import type { Express } from "express";
import type { Socket } from "socket.io";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { canAccessCentralPanel, hasAdminPrivileges, isCentralRole } from "@shared/roles";
import { authenticateJWT } from "./routes-auth";
import { genFebStorage } from "./storage-genfeb";
import { catalogService } from "./services";
import {
  createDispatchCompany,
  findDispatchCompanyByName,
  getDispatchCompany,
  listDispatchCompanies,
  updateDispatchCompany,
  sanitizeDispatchMobilityFares,
  sanitizeDispatchPackFares,
} from "./dispatch-companies";
import {
  getMobilityOnlineDriversSnapshot,
  getMobilityActiveRideForCentral,
  mobilityDriverInActiveRide,
  refreshMobilityPresenceDispatchCompany,
} from "./mobility-rides";
import {
  getPackOnlineDriversSnapshot,
  getPackActiveRideForCentral,
  packDriverInActiveRide,
  refreshPackPresenceDispatchCompany,
} from "./pack-rides";
import { centralFleetRoom } from "./central-fleet-notify";
import { buildGoDriverEnrollmentCategoryPatch } from "@shared/provider-category-membership";
import {
  registerCentralMemberSchema,
  patchCentralMemberSchema,
} from "@shared/central-member";
import { listCompanyMembers, memberBelongsToCompany, patchCompanyMember } from "./central-members";
import {
  getCentralAffiliationRequest,
  listCentralAffiliationRequestsForCompany,
  updateCentralAffiliationRequest,
} from "./central-affiliation-store";
import {
  notifyApplicantAffiliationApproved,
  notifyApplicantAffiliationRejected,
  notifyApplicantDataAccessRequested,
} from "./central-affiliation-notify";
import { listMobilityRideHistoryForCentral } from "./mobility-ride-history-store";

const PRESENCE_TTL_MS = 45_000;

async function resolveCompanyIdForRequest(
  req: { user?: { id?: string; role?: string } },
  queryCompanyId?: string,
): Promise<{ companyId: string } | { error: string; status: number }> {
  const role = req.user?.role;
  if (hasAdminPrivileges(role)) {
    const cid = String(queryCompanyId ?? "").trim();
    if (!cid) return { error: "companyId requerido", status: 400 };
    const company = await getDispatchCompany(cid);
    if (!company) return { error: "Empresa no encontrada", status: 404 };
    return { companyId: cid };
  }
  if (isCentralRole(role)) {
    const user = (await genFebStorage.getUserById(String(req.user?.id))) as {
      dispatchCompanyId?: string;
    } | null;
    const cid = user?.dispatchCompanyId;
    if (!cid) return { error: "Sin empresa asignada", status: 403 };
    return { companyId: cid };
  }
  return { error: "Sin acceso", status: 403 };
}

/** Con viaje activo se conserva la última posición aunque venza el TTL (el conductor ya no emite «recibiendo»). */
function freshMobilityPresence(userId: string, inActiveRide: boolean) {
  const row = getMobilityOnlineDriversSnapshot().get(userId);
  if (!row) return null;
  if (!inActiveRide && Date.now() - row.updatedAt > PRESENCE_TTL_MS) return null;
  return row;
}

function freshPackPresence(userId: string, inActiveRide: boolean) {
  const row = getPackOnlineDriversSnapshot().get(userId);
  if (!row) return null;
  if (!inActiveRide && Date.now() - row.updatedAt > PRESENCE_TTL_MS) return null;
  return row;
}

/** Posición/vehículo para la central: si hay taxi y delivery, el más reciente por `updatedAt`. */
function pickPresenceForDisplay(
  taxi: ReturnType<typeof freshMobilityPresence>,
  pack: ReturnType<typeof freshPackPresence>,
) {
  if (taxi && pack) return taxi.updatedAt >= pack.updatedAt ? taxi : pack;
  return taxi ?? pack;
}

export function registerCentralRoutes(app: Express): void {
  app.get("/api/dispatch-companies/options", optionalAuthListCompanies);

  const setupCompanySchema = z.object({
    name: z.string().trim().min(2, "Mínimo 2 caracteres").max(120),
  });

  /** Operador central: crea su empresa despachadora con nombre único (tras cambio de rol). */
  app.post("/api/central/setup-company", authenticateJWT, async (req: any, res) => {
    if (!isCentralRole(req.user?.role)) {
      return res.status(403).json({ message: "Solo usuarios Central pueden configurar una central" });
    }
    try {
      const { name } = setupCompanySchema.parse(req.body);
      const user = (await genFebStorage.getUserById(req.user.id, true)) as Record<string, unknown> | null;
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

      const existingCompanyId = String(user.dispatchCompanyId ?? "").trim();
      if (existingCompanyId && user.pendingCentralSetup !== true) {
        const cur = await getDispatchCompany(existingCompanyId);
        if (cur) {
          return res.status(400).json({
            message: "Ya tienes una central asignada.",
            company: cur,
          });
        }
      }

      const duplicate = await findDispatchCompanyByName(name);
      if (duplicate) {
        return res.status(409).json({
          message: "Ya existe una central con ese nombre. Elige otro.",
          field: "name",
        });
      }

      const company = await createDispatchCompany({
        name,
        ownerUserId: String(req.user.id),
      });

      await genFebStorage.updateUser(String(req.user.id), {
        dispatchCompanyId: company.id,
        pendingCentralSetup: false,
      } as Record<string, unknown>);

      return res.status(201).json({
        message: "Central creada",
        company: { id: company.id, name: company.name },
        dispatchCompanyId: company.id,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error("Error en setup central:", error);
      return res.status(500).json({ message: "Error al crear la central" });
    }
  });

  app.get("/api/central/companies", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const q = String(req.query.q ?? "").trim().toLowerCase();
    let list = await listDispatchCompanies(true);
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    res.json(list.map((c) => ({ id: c.id, name: c.name })));
  });

  app.get("/api/central/me", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const resolved = await resolveCompanyIdForRequest(req, req.query.companyId as string);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });
    const company = await getDispatchCompany(resolved.companyId);
    if (!company) return res.status(404).json({ message: "Empresa no encontrada" });
    res.json({ company, isAdminView: hasAdminPrivileges(req.user?.role) });
  });

  app.get("/api/central/fares", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const resolved = await resolveCompanyIdForRequest(req, req.query.companyId as string);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });
    const company = await getDispatchCompany(resolved.companyId);
    if (!company) return res.status(404).json({ message: "Empresa no encontrada" });
    res.json({ mobilityFares: company.mobilityFares, packFares: company.packFares });
  });

  const patchFaresSchema = z.object({
    companyId: z.string().optional(),
    mobilityFares: z.record(z.any()).optional(),
    packFares: z.record(z.any()).optional(),
  });

  app.patch("/api/central/fares", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const body = patchFaresSchema.parse(req.body);
    const resolved = await resolveCompanyIdForRequest(req, body.companyId);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });
    const patch: Parameters<typeof updateDispatchCompany>[1] = {};
    if (body.mobilityFares) patch.mobilityFares = sanitizeDispatchMobilityFares(body.mobilityFares);
    if (body.packFares) patch.packFares = sanitizeDispatchPackFares(body.packFares);
    const updated = await updateDispatchCompany(resolved.companyId, patch);
    res.json(updated);
  });

  const patchServiceMapSchema = z.object({
    companyId: z.string().optional(),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    cityZoom: z.number().min(9).max(14).optional(),
  });

  app.patch("/api/central/service-map", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const body = patchServiceMapSchema.parse(req.body);
    const resolved = await resolveCompanyIdForRequest(req, body.companyId);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });
    const patch: Parameters<typeof updateDispatchCompany>[1] = {
      serviceMapLat: body.lat,
      serviceMapLon: body.lon,
    };
    if (body.cityZoom !== undefined) patch.serviceMapCityZoom = body.cityZoom;
    const updated = await updateDispatchCompany(resolved.companyId, patch);
    res.json(updated);
  });

  app.get("/api/central/fleet", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const resolved = await resolveCompanyIdForRequest(req, req.query.companyId as string);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });

    const providers = await genFebStorage.getAllProviders();
    const fleet = providers.filter(
      (p) => String((p as { dispatchCompanyId?: string }).dispatchCompanyId ?? "") === resolved.companyId,
    );

    const drivers: unknown[] = [];
    for (const p of fleet) {
      const userId = String((p as { userId?: string }).userId ?? "");
      if (!userId) continue;
      const inService = mobilityDriverInActiveRide(userId) || packDriverInActiveRide(userId);
      const taxiPres = freshMobilityPresence(userId, inService);
      const packPres = freshPackPresence(userId, inService);
      const pres = pickPresenceForDisplay(taxiPres, packPres);
      if (!pres && !inService) continue;

      const activeService = inService
        ? (await getMobilityActiveRideForCentral(userId)) ?? (await getPackActiveRideForCentral(userId))
        : null;

      const user = (await genFebStorage.getUserById(userId)) as {
        name?: string;
        lastName?: string;
        avatar?: string;
        rating?: number;
        phone?: string | null;
      } | null;
      const vehicle = await genFebStorage.getPrimaryVehicleByUserId(userId);

      drivers.push({
        userId,
        name: user?.name ?? "",
        lastName: user?.lastName ?? "",
        avatar: user?.avatar ?? null,
        phone: user?.phone != null && String(user.phone).trim() ? String(user.phone).trim() : null,
        licensePlate:
          vehicle?.license_plate != null && String(vehicle.license_plate).trim()
            ? String(vehicle.license_plate).trim().toUpperCase()
            : null,
        rating: Number(user?.rating ?? 5),
        vehicleType: pres?.vehicleType ?? vehicle?.vehicle_type ?? "car",
        isPetFriendly: taxiPres?.isPetFriendly ?? false,
        lat: pres?.lat ?? null,
        lon: pres?.lon ?? null,
        receivingTaxi: !!(taxiPres && !taxiPres.idleOnMapDuringRide),
        receivingDelivery: !!(packPres && !packPres.idleOnMapDuringRide),
        receiving: !!(
          (taxiPres && !taxiPres.idleOnMapDuringRide) ||
          (packPres && !packPres.idleOnMapDuringRide)
        ),
        inService,
        updatedAt: pres?.updatedAt ?? null,
        activeService,
      });
    }
    res.json({ drivers });
  });

  /**
   * GET /api/central/cargo-go/rides
   * Historial de servicios Car Go / Pack de conductores de la central (completados y cancelados).
   */
  app.get("/api/central/cargo-go/rides", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const resolved = await resolveCompanyIdForRequest(req, req.query.companyId as string);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });

    try {
      const bucketRaw = String(req.query.bucket ?? "completed").trim().toLowerCase();
      const bucket = bucketRaw === "cancelled" ? "cancelled" : "completed";
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 10));

      const result = await listMobilityRideHistoryForCentral(resolved.companyId, bucket, { page, limit });
      const rides = result.rides.map((h) => ({
        id: h.id,
        module: h.module,
        moduleLabel: h.module === "pack" ? "Delivery" : "Taxi",
        bucket: result.bucket,
        status: h.outcome,
        statusLabel: h.statusLabel,
        driverName: h.driverName,
        vehicleLabel: h.vehicleLabel,
        startLabel: h.startLabel,
        endLabel: h.endLabel,
        endedAt: h.endedAt,
        durationMin: h.durationMin,
        amountUsd: h.amountUsd,
        payment: h.payment,
      }));

      return res.status(200).json({
        rides,
        bucket: result.bucket,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        counts: result.counts,
      });
    } catch (error) {
      console.error("Error listing central cargo-go rides:", error);
      return res.status(500).json({ message: "Error al cargar historial de servicios" });
    }
  });

  app.get("/api/central/members", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const resolved = await resolveCompanyIdForRequest(req, req.query.companyId as string);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });
    const members = await listCompanyMembers(resolved.companyId);
    res.json({ members });
  });

  app.patch("/api/central/members/:userId", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const userId = String(req.params.userId ?? "").trim();
    if (!userId) return res.status(400).json({ message: "userId requerido" });
    const body = patchCentralMemberSchema.parse(req.body);
    const resolved = await resolveCompanyIdForRequest(req, body.companyId);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });

    const belongs = await memberBelongsToCompany(userId, resolved.companyId);
    if (!belongs.ok) return res.status(404).json({ message: "Usuario no encontrado en esta empresa" });

    const result = await patchCompanyMember(userId, resolved.companyId, {
      email: body.email,
      phone: body.phone,
      newPassword: body.newPassword,
    });
    if (!result.ok) {
      return res.status(result.status).json({ message: result.error });
    }
    res.json({ ok: true });
  });

  app.post("/api/central/members", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const body = registerCentralMemberSchema.parse(req.body);
    const resolved = await resolveCompanyIdForRequest(req, body.companyId);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });

    const email = body.email.trim().toLowerCase();
    const existing = await genFebStorage.getUserByEmail(email);
    if (existing && !(existing as { deletedAt?: unknown }).deletedAt) {
      return res.status(409).json({ message: "El correo ya está registrado." });
    }

    const hashedPassword = await bcrypt.hash(body.password, 10);
    const role = body.memberType === "central" ? "central" : "professional";

    const user = (await genFebStorage.createUser({
      email,
      password: hashedPassword,
      name: body.name,
      lastName: body.lastName,
      phone: body.phone,
      role,
      dispatchCompanyId: resolved.companyId,
      rating: 5,
      ratingCount: 0,
    })) as { id: string };

    if (body.memberType === "driver") {
      const vehicle = body.vehicle!;
      const categories = await catalogService.getCategories();
      const categoryPatch = buildGoDriverEnrollmentCategoryPatch(
        { categoryId: null, secondCategoryId: null, thirdCategoryId: null } as Parameters<
          typeof buildGoDriverEnrollmentCategoryPatch
        >[0],
        categories,
      );
      const provider = await catalogService.createProvider({
        userId: user.id,
        profession: "Conductor Genfeb Go",
        bio: "Conductor registrado por central.",
        ...categoryPatch,
      } as Parameters<typeof catalogService.createProvider>[0]);

      await catalogService.updateProvider((provider as { id: number }).id, {
        dispatchCompanyId: resolved.companyId,
        goBrands: ["transport", "delivery"],
        goDriverOfferTitle: "Conductor Genfeb Go",
        goDriverOfferDescription:
          "Servicios de taxi y delivery en Genfeb Go. Registrado por la central de la empresa.",
      } as Parameters<typeof catalogService.updateProvider>[1]);

      await genFebStorage.createProviderVehicle({
        providerId: (provider as { id: number }).id,
        userId: user.id,
        vehicle,
      });
    }

    res.status(201).json({ ok: true, userId: user.id, role });
  });

  app.get("/api/central/affiliation-requests", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const resolved = await resolveCompanyIdForRequest(req, req.query.companyId as string);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });
    const list = await listCentralAffiliationRequestsForCompany(resolved.companyId);
    res.json({ requests: list });
  });

  app.get("/api/central/affiliation-requests/:id/applicant-preview", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const resolved = await resolveCompanyIdForRequest(req, req.query.companyId as string);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ message: "id requerido" });
    const row = await getCentralAffiliationRequest(id);
    if (!row || row.dispatchCompanyId !== resolved.companyId) {
      return res.status(404).json({ message: "Solicitud no encontrada" });
    }
    const applicant = (await genFebStorage.getUserById(row.applicantUserId)) as Record<string, unknown> | null;
    const vehicle = await genFebStorage.getPrimaryVehicleByUserId(row.applicantUserId);
    const prof = await genFebStorage.getProfessionalVerificationByUserId(row.applicantUserId);
    const shareCompany = String((applicant as { centralDataShareForCompanyId?: string })?.centralDataShareForCompanyId ?? "");
    const dataGranted =
      row.dataAccessStatus === "granted" || shareCompany === resolved.companyId;

    const name = String(applicant?.name ?? (applicant as { firstName?: string })?.firstName ?? "").trim();
    const lastName = String(applicant?.lastName ?? "").trim();

    res.json({
      request: row,
      applicant: {
        userId: row.applicantUserId,
        name,
        lastName,
        email: dataGranted ? String(applicant?.email ?? "") : null,
        phone: dataGranted ? String(applicant?.phone ?? "") : null,
        credentialsManagedByUser: true,
      },
      vehicle: vehicle
        ? {
            license_plate: vehicle.license_plate,
            brand: vehicle.brand,
            model: vehicle.model,
            model_year: vehicle.model_year,
            vehicle_type: vehicle.vehicle_type,
          }
        : null,
      verification: {
        professionalCredentialUrl: prof?.professionalCredentialUrl ?? null,
        imageVerified: prof?.imageVerified === true,
      },
      dataAccessGranted: dataGranted,
    });
  });

  app.post("/api/central/affiliation-requests/:id/request-data-access", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const resolved = await resolveCompanyIdForRequest(req, req.body?.companyId as string);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ message: "id requerido" });
    const row = await getCentralAffiliationRequest(id);
    if (!row || row.dispatchCompanyId !== resolved.companyId || row.status !== "pending") {
      return res.status(404).json({ message: "Solicitud no encontrada" });
    }
    if (row.dataAccessStatus === "granted") {
      return res.status(409).json({ message: "El conductor ya autorizó el acceso a datos." });
    }
    if (row.dataAccessStatus === "requested") {
      return res.json({ ok: true, alreadySent: true });
    }
    const operatorId = String(req.user?.id ?? "");
    await updateCentralAffiliationRequest(id, {
      dataAccessStatus: "requested",
      dataAccessRequestedByUserId: operatorId,
      dataAccessRequestedAt: new Date().toISOString(),
    });
    const company = await getDispatchCompany(resolved.companyId);
    const companyName = company?.name ?? "Tu central";
    await notifyApplicantDataAccessRequested({
      applicantUserId: row.applicantUserId,
      companyName,
      requestId: id,
    });
    res.json({ ok: true });
  });

  app.post("/api/central/affiliation-requests/:id/approve", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const resolved = await resolveCompanyIdForRequest(req, req.body?.companyId as string);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ message: "id requerido" });
    const row = await getCentralAffiliationRequest(id);
    if (!row || row.dispatchCompanyId !== resolved.companyId) {
      return res.status(404).json({ message: "Solicitud no encontrada" });
    }
    if (row.status !== "pending") {
      return res.status(409).json({ message: "La solicitud ya fue procesada." });
    }
    const provider = await catalogService.getProviderByUserId(row.applicantUserId);
    if (!provider) return res.status(404).json({ message: "Proveedor no encontrado" });
    const pid = (provider as { id: number }).id;
    await catalogService.updateProvider(pid, {
      dispatchCompanyId: resolved.companyId,
    } as Parameters<typeof catalogService.updateProvider>[1]);
    await updateCentralAffiliationRequest(id, { status: "approved" });
    await genFebStorage.updateUser(row.applicantUserId, {
      credentialsManagedOutsideCentral: true,
      dispatchCompanyId: resolved.companyId,
    } as Parameters<typeof genFebStorage.updateUser>[1]);
    void refreshMobilityPresenceDispatchCompany(row.applicantUserId);
    void refreshPackPresenceDispatchCompany(row.applicantUserId);
    const company = await getDispatchCompany(resolved.companyId);
    const companyName = company?.name ?? "Tu central";
    await notifyApplicantAffiliationApproved({
      applicantUserId: row.applicantUserId,
      companyName,
      requestId: id,
    });
    res.json({ ok: true });
  });

  app.post("/api/central/affiliation-requests/:id/reject", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const resolved = await resolveCompanyIdForRequest(req, req.body?.companyId as string);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ message: "id requerido" });
    const row = await getCentralAffiliationRequest(id);
    if (!row || row.dispatchCompanyId !== resolved.companyId) {
      return res.status(404).json({ message: "Solicitud no encontrada" });
    }
    if (row.status !== "pending") {
      return res.status(409).json({ message: "La solicitud ya fue procesada." });
    }
    await updateCentralAffiliationRequest(id, { status: "rejected" });
    const company = await getDispatchCompany(resolved.companyId);
    const companyName = company?.name ?? "La central";
    await notifyApplicantAffiliationRejected({
      applicantUserId: row.applicantUserId,
      companyName,
      requestId: id,
    });
    res.json({ ok: true });
  });
}

async function optionalAuthListCompanies(req: any, res: any) {
  try {
    const list = await listDispatchCompanies(true);
    res.json(list.map((c) => ({ id: c.id, name: c.name })));
  } catch (e: any) {
    res.status(500).json({ message: e?.message ?? "Error" });
  }
}

export function registerCentralSocket(io: import("socket.io").Server): void {
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as { id?: string; role?: string } | undefined;
    if (!user?.id || !canAccessCentralPanel(user.role)) return;

    socket.on("central:fleet:subscribe", async (data: { companyId?: string }) => {
      let companyId = data?.companyId;
      if (!hasAdminPrivileges(user.role)) {
        const u = (await genFebStorage.getUserById(user.id!)) as { dispatchCompanyId?: string };
        companyId = u?.dispatchCompanyId;
      }
      if (!companyId) return;
      socket.join(centralFleetRoom(companyId));
    });

    socket.on("central:fleet:unsubscribe", (data: { companyId?: string }) => {
      if (data?.companyId) socket.leave(centralFleetRoom(data.companyId));
    });
  });
}
