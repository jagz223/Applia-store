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
  getDispatchCompany,
  listDispatchCompanies,
  updateDispatchCompany,
  sanitizeDispatchMobilityFares,
  sanitizeDispatchPackFares,
} from "./dispatch-companies";
import { getMobilityOnlineDriversSnapshot, mobilityDriverInActiveRide } from "./mobility-rides";
import { getPackOnlineDriversSnapshot, packDriverInActiveRide } from "./pack-rides";
import { centralFleetRoom } from "./central-fleet-notify";
import { buildGoDriverEnrollmentCategoryPatch } from "@shared/provider-category-membership";
import { insertProviderVehicleSchema } from "@shared/vehicle-schema";
import { goOfferKindToVehicleType, type GoDriverOfferKindSlug } from "@shared/go-driver-offer-kind";

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

function mergedPresenceForUser(userId: string) {
  const taxi = getMobilityOnlineDriversSnapshot().get(userId);
  const pack = getPackOnlineDriversSnapshot().get(userId);
  const pres = taxi ?? pack;
  if (!pres) return null;
  const now = Date.now();
  if (now - pres.updatedAt > PRESENCE_TTL_MS) return null;
  return {
    ...pres,
    isPetFriendly: taxi?.isPetFriendly ?? false,
    receiving: true,
  };
}

export function registerCentralRoutes(app: Express): void {
  app.get("/api/dispatch-companies/options", optionalAuthListCompanies);

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
      const pres = mergedPresenceForUser(userId);
      const inService = mobilityDriverInActiveRide(userId) || packDriverInActiveRide(userId);
      if (!pres && !inService) continue;

      const user = (await genFebStorage.getUserById(userId)) as {
        name?: string;
        lastName?: string;
        avatar?: string;
        rating?: number;
      } | null;
      const vehicle = await genFebStorage.getPrimaryVehicleByUserId(userId);

      drivers.push({
        userId,
        name: user?.name ?? "",
        lastName: user?.lastName ?? "",
        avatar: user?.avatar ?? null,
        rating: Number(user?.rating ?? 5),
        vehicleType: pres?.vehicleType ?? vehicle?.vehicle_type ?? "car",
        isPetFriendly: pres?.isPetFriendly ?? false,
        lat: pres?.lat ?? null,
        lon: pres?.lon ?? null,
        receiving: !!pres,
        inService,
        updatedAt: pres?.updatedAt ?? null,
      });
    }
    res.json({ drivers });
  });

  const registerMemberSchema = z.object({
    companyId: z.string().optional(),
    memberType: z.enum(["central", "driver"]),
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(2),
    lastName: z.string().min(2),
    phone: z.string().min(1),
    offerKind: z.enum(["moto", "carro", "camion", "pet"]).optional(),
  });

  app.post("/api/central/members", authenticateJWT, async (req: any, res) => {
    if (!canAccessCentralPanel(req.user?.role)) {
      return res.status(403).json({ message: "Sin acceso" });
    }
    const body = registerMemberSchema.parse(req.body);
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
      const kindRaw = body.offerKind ?? "carro";
      const isPet = kindRaw === "pet";
      const kind = (isPet ? "carro" : kindRaw) as GoDriverOfferKindSlug;
      const vehicleType = goOfferKindToVehicleType(kind);
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

      const parsedVehicle = insertProviderVehicleSchema.safeParse({
        license_plate: "PEND-00",
        model_year: new Date().getFullYear(),
        brand: "Pendiente",
        model: "Pendiente",
        vehicle_status: "pending_inspection",
        vehicle_type: vehicleType,
        is_pet_friendly: isPet,
      });
      if (parsedVehicle.success) {
        await genFebStorage.createProviderVehicle({
          providerId: (provider as { id: number }).id,
          userId: user.id,
          vehicle: parsedVehicle.data,
        });
      }
    }

    res.status(201).json({ ok: true, userId: user.id, role });
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
