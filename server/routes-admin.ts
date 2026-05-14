/**
 * Rutas de administración (solo admin).
 * Rutas finas: validan entrada y delegan en servicios.
 * Usamos Router para /api/admin/users para que GET /:id y GET / no se pisen.
 */

import express, { type Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authenticateJWT } from "./routes-auth";
import { requireAdminStaff, requireFullAdmin, requireStaffFromDb } from "./middleware-roles";
import { userService } from "./services";
import { genFebStorage } from "./storage-genfeb";
import { catalogService } from "./services";
import { getFullAdminUsers } from "./staff-users";
import { getIO, sendNotificationToAdmins } from "./socket";
import { applyServiceBookingChatLifecycle } from "./service-booking-chat";
import { notificationService } from "./services/notification.service";
import { getPlatformCommissionRate, setPlatformCommissionRate } from "./platform-commission-rate";
import { getMobilityFares, setMobilityFares } from "./mobility-fares";
import { getPackFares, setPackFares } from "./pack-fares";
import { getSubscriptionFeesByCategorySlug, setSubscriptionFeesByCategorySlug } from "./subscription-fees";
import { commissionDisplayPercents } from "@shared/platform-commission";
import { getDashboardStatsRange, type AdminDashboardStatsPreset } from "./admin-dashboard-stats";
import { DEFAULT_CATEGORIES, getCategoryDisplayName, isMobilityGoDriverVehicleCategorySlug } from "@shared/default-categories";
import { SETTINGS_URL_AFTER_VEHICLE_CHANGE_RESOLVED } from "@shared/settings-notification-urls";
import { SUPPRESS_GENFEB_WALLET_FLOW_NOTIFICATIONS } from "@shared/wallet-notifications";
import {
  getHiddenCategorySlugs,
  getHiddenCategorySlugsByRole,
  getHiddenCategorySlugsForRole,
  setHiddenCategorySlugs,
  setHiddenCategorySlugsForRole,
} from "./category-visibility";
import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";
import { isFullAdmin } from "@shared/roles";
import {
  extendVisibilitySubscriptionEndsAtByMonths,
  parseVisibilitySubscriptionEndMs,
} from "@shared/professional-listing-subscription";
import { isAssociateOnboardingDossierComplete } from "@shared/professional-verification";
import { vehicleChangeProposalSchema } from "@shared/vehicle-change-proposal";

/** Lista servicios para el panel admin (incluye proveedores no verificados; el catálogo público los excluye). */
async function adminListAllServices() {
  return genFebStorage.getAllServices(undefined, undefined, undefined, undefined, true);
}

type AdminAuditAction =
  | "subscription_payment_approved"
  | "subscription_payment_rejected"
  | "associate_onboarding_approved"
  | "associate_onboarding_rejected"
  | "account_change_request_approved"
  | "account_change_request_rejected";

/** Cuando no hay Firestore, el historial de auditoría vive en memoria (reinicia al reiniciar el servidor). */
const ADMIN_AUDIT_MEMORY_MAX = 200;
const adminAuditMemoryLog: Array<{
  id: string;
  action: AdminAuditAction;
  adminUserId: string;
  affectedUserId: string;
  meta: Record<string, unknown> | null;
  createdAt: Date;
}> = [];

async function createAdminAuditEvent(args: {
  action: AdminAuditAction;
  adminUserId: string;
  affectedUserId: string;
  meta?: Record<string, unknown>;
}) {
  const meta = args.meta ?? null;
  const createdAt = new Date();
  try {
    const db = getFirestore();
    if (db) {
      await db.collection(FIRESTORE_COLLECTIONS.ADMIN_AUDIT_LOG).add({
        action: args.action,
        adminUserId: args.adminUserId,
        affectedUserId: args.affectedUserId,
        meta,
        createdAt,
      });
      return;
    }
    adminAuditMemoryLog.unshift({
      id: `m_${randomUUID()}`,
      action: args.action,
      adminUserId: args.adminUserId,
      affectedUserId: args.affectedUserId,
      meta,
      createdAt,
    });
    while (adminAuditMemoryLog.length > ADMIN_AUDIT_MEMORY_MAX) {
      adminAuditMemoryLog.pop();
    }
  } catch (e) {
    console.error("[admin-audit] Error:", e);
  }
}

/**
 * Misma noción de "marca" que Explore (`providerCategoryId`): cuenta un servicio en la marca
 * si la categoría del servicio o la del proveedor coincide (evita que perfiles con categoryId desalineado no aparezcan en admin).
 */
function serviceBelongsToBrand(
  s: { categoryId?: unknown; provider?: { categoryId?: unknown; category?: unknown } | undefined },
  brandCategoryId: number,
  categories: Array<{ id?: unknown; slug?: unknown }>
): boolean {
  if (Number(s?.categoryId) === brandCategoryId) return true;
  const p = s?.provider;
  if (!p) return false;
  if (p.categoryId != null && Number(p.categoryId) === brandCategoryId) return true;
  const slug = categories.find((c) => Number(c?.id) === brandCategoryId)?.slug;
  if (slug != null && typeof p.category === "string" && p.category.trim() === String(slug)) return true;
  return false;
}

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  role: z.string().min(1).max(50).optional(),
  newPassword: z.string().min(6).max(100).optional(),
});

/** Serializa a objeto plano para JSON (p. ej. Timestamp de Firestore → ISO string). */
function toPlainUser(obj: unknown): Record<string, unknown> {
  if (obj === null || typeof obj !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "password") continue;
    if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
      out[k] = (v as { toDate: () => Date }).toDate().toISOString();
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

const platformCommissionPatchSchema = z.object({
  /** Porcentaje que retiene la plataforma (1–50). */
  platformPercent: z.number().min(1).max(50),
});

export function registerAdminRoutes(app: Express): void {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, message: "API OK" });
  });

  /** Lectura pública de la tasa actual (UI asociado / admin). */
  app.get("/api/platform/commission-rate", async (_req, res) => {
    try {
      const commissionRate = await getPlatformCommissionRate();
      const { platformPercent, providerPercent } = commissionDisplayPercents(commissionRate);
      res.json({ commissionRate, platformPercent, providerPercent });
    } catch (e) {
      console.error("[platform-commission-rate] GET", e);
      res.status(500).json({ message: "Error al leer comisión" });
    }
  });

  /** Lectura pública de tarifas Car Go / envíos (UI). */
  app.get("/api/platform/mobility-fares", async (_req, res) => {
    try {
      const fares = await getMobilityFares();
      return res.json({ fares });
    } catch (e) {
      console.error("[mobility-fares] GET", e);
      return res.status(500).json({ message: "Error al leer tarifas" });
    }
  });

  /** Lectura pública de tarifas Pack Go (UI). */
  app.get("/api/platform/pack-fares", async (_req, res) => {
    try {
      const fares = await getPackFares();
      return res.json({ fares });
    } catch (e) {
      console.error("[pack-fares] GET", e);
      return res.status(500).json({ message: "Error al leer tarifas" });
    }
  });

  /** Lectura pública de mensualidad por categoría (UI pago/renovación). */
  app.get("/api/platform/subscription-fees", async (_req, res) => {
    try {
      const feesBySlug = await getSubscriptionFeesByCategorySlug();
      return res.json({ feesBySlug });
    } catch (e) {
      console.error("[subscription-fees] GET", e);
      return res.status(500).json({ message: "Error al leer mensualidades" });
    }
  });

  /** Solo administrador completo: actualizar porcentaje de comisión de plataforma. */
  app.patch(
    "/api/admin/platform-commission-rate",
    authenticateJWT,
    requireFullAdmin,
    async (req, res) => {
      try {
        const parsed = platformCommissionPatchSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
        }
        const rate = parsed.data.platformPercent / 100;
        const commissionRate = await setPlatformCommissionRate(rate);
        const { platformPercent, providerPercent } = commissionDisplayPercents(commissionRate);
        res.json({ commissionRate, platformPercent, providerPercent });
      } catch (e) {
        console.error("[platform-commission-rate] PATCH", e);
        res.status(500).json({ message: "Error al guardar comisión" });
      }
    },
  );

  const mobilityFaresPatchSchema = z.object({
    fares: z.object({
      moto: z.object({ baseUsd: z.number().min(0).max(100), perKmUsd: z.number().min(0).max(20) }),
      auto: z.object({
        baseDayUsd: z.number().min(0).max(100),
        baseNightUsd: z.number().min(0).max(100),
        perKmUsd: z.number().min(0).max(20),
        petExtraUsd: z.number().min(0).max(50),
      }),
      camioneta: z.object({ baseUsd: z.number().min(0).max(500), perKmUsd: z.number().min(0).max(50), petExtraUsd: z.number().min(0).max(50) }),
    }),
  });

  app.patch("/api/admin/mobility-fares", authenticateJWT, requireFullAdmin, async (req, res) => {
    try {
      const parsed = mobilityFaresPatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      const saved = await setMobilityFares(parsed.data.fares);
      return res.json({ fares: saved });
    } catch (e) {
      console.error("[mobility-fares] PATCH", e);
      return res.status(500).json({ message: "Error al guardar tarifas" });
    }
  });

  const subscriptionFeesPatchSchema = z.object({
    feesBySlug: z.record(z.string().min(1).max(80), z.number().min(0).max(10_000)),
  });

  app.patch("/api/admin/subscription-fees", authenticateJWT, requireFullAdmin, async (req, res) => {
    try {
      const parsed = subscriptionFeesPatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      const saved = await setSubscriptionFeesByCategorySlug(parsed.data.feesBySlug);
      return res.json({ feesBySlug: saved });
    } catch (e) {
      console.error("[subscription-fees] PATCH", e);
      return res.status(500).json({ message: "Error al guardar mensualidades" });
    }
  });

  const packFaresPatchSchema = z.object({
    fares: z.object({
      moto: z.object({ baseUsd: z.number().min(0).max(100), perKmUsd: z.number().min(0).max(20) }),
      auto: z.object({ baseUsd: z.number().min(0).max(200), perKmUsd: z.number().min(0).max(50) }),
      camioneta: z.object({ baseUsd: z.number().min(0).max(500), perKmUsd: z.number().min(0).max(80) }),
    }),
  });

  app.patch("/api/admin/pack-fares", authenticateJWT, requireFullAdmin, async (req, res) => {
    try {
      const parsed = packFaresPatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      const saved = await setPackFares(parsed.data.fares);
      return res.json({ fares: saved });
    } catch (e) {
      console.error("[pack-fares] PATCH", e);
      return res.status(500).json({ message: "Error al guardar tarifas" });
    }
  });

  const adminUsersRouter = express.Router({ mergeParams: true });

  /** GET /api/admin/users — Listado con paginación y filtros. (Antes que /:id para no capturar "users" como id.) */
  adminUsersRouter.get("/", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
      const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
      const role = (req.query.role as string)?.trim() || undefined;
      const name = (req.query.name as string)?.trim() || undefined;
      const email = (req.query.email as string)?.trim() || undefined;
      const lastName = (req.query.lastName as string)?.trim() || undefined;
      const search = (req.query.search as string)?.trim() || undefined;
      const result = await userService.getUsers({
        role,
        name,
        email,
        lastName,
        search,
        page,
        limit,
      });
      return res.status(200).json(result);
    } catch (error) {
      console.error("Error listing users:", error);
      return res.status(500).json({ message: "Error al listar usuarios" });
    }
  });

  /** GET /api/admin/users/:id — Un usuario por ID (sin contraseña). */
  adminUsersRouter.get("/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const user = await userService.getUserByIdSafe(id);
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      return res.status(200).json(toPlainUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      return res.status(500).json({ message: "Error al obtener usuario" });
    }
  });

  /** PATCH /api/admin/users/:id — Actualizar usuario. */
  adminUsersRouter.patch("/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const existing = await userService.getUserById(id);
      if (!existing) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      const data = updateUserSchema.parse(req.body);
      const update: Record<string, unknown> = {};
      if (data.name !== undefined) update.name = data.name.trim();
      if (data.lastName !== undefined) update.lastName = data.lastName.trim();
      if (data.email !== undefined) update.email = data.email.trim();
      if (data.phone !== undefined) update.phone = data.phone?.trim() ?? null;
      if (data.role !== undefined) {
        const newRole = data.role.trim();
        update.role = newRole;
        if (newRole === "professional" && (existing as any).role !== "professional") {
          update.acceptedProviderTermsOfUse = false;
        }
      }
      if (Object.keys(update).length > 0) {
        await userService.updateUser(id, update);
      }
      if (data.newPassword) {
        const hashed = await bcrypt.hash(data.newPassword, 10);
        await genFebStorage.updateUserPassword(id, hashed);
      }
      const updated = await userService.getUserByIdSafe(id);
      return res.status(200).json(toPlainUser(updated ?? {}));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error("Error updating user:", error);
      return res.status(500).json({ message: "Error al actualizar usuario" });
    }
  });

  app.use("/api/admin/users", authenticateJWT, requireStaffFromDb, adminUsersRouter);

  /**
   * Si ambos pasos de verificación están en "verified",
   * entonces marca al profesional como verificado (providers.isVerified = true).
   */
  async function maybeVerifyProfessional(userId: string): Promise<void> {
    const st = await genFebStorage.getVerifyingStatusByUserId(userId);
    if (!st) return;

    const bothApproved = st.identification_verified === "verified" && st.transacction_verified === "verified";
    if (!bothApproved) return;

    const provider = await genFebStorage.getProviderByUserId(userId);
    if (!provider) return;

    // ProviderUpdate (types) no incluye isVerified; en runtime la colección sí lo soporta.
    await genFebStorage.updateProvider(provider.id, { isVerified: true } as any);

    // --- Notificar al usuario (Bienvenida) ---
    try {
      const msg = "¡Felicidades! Ahora eres un Asociado verificado de GenFeb. ¡Bienvenido!";
      await genFebStorage.createNotification({
        userId,
        type: "verification_welcome",
        data: { message: msg, url: "/professional-dashboard" }
      });

      const io = getIO();
      if (io) {
        io.to(`user:${userId}`).emit("notification", {
          type: "verification_welcome",
          title: "¡Bienvenido Asociado!",
          body: msg,
          data: { url: "/professional-dashboard" }
        });
      }

      void notificationService.sendPushToUser(userId, {
        title: "¡Bienvenido Asociado!",
        body: msg,
        data: { url: "/professional-dashboard" }
      }).catch(err => console.error("[push-welcome] Error:", err));
    } catch (err) {
      console.error("Error notificando bienvenida:", err);
    }
    // -----------------------------------------
  }

  /**
   * VERIFICACIÓN DE ASOCIADOS
   * verificación_status/pending + aprobar/rechazar
   */
  app.get("/api/admin/verifying-status/pending", authenticateJWT, requireFullAdmin, async (_req, res) => {
    try {
      const pending = await genFebStorage.getPendingVerifyingStatuses();
      // Filtro por rol (si en el futuro un rol no-admin ve esta vista):
      // ocultar solicitudes de marcas que ese rol no puede ver.
      // Importante: NO aplicamos "hiddenSlugs" global aquí; solo reglas por rol (admin siempre ve todo).
      const reqRole = String((_req as any)?.user?.role ?? "");
      const hiddenByRole = reqRole && reqRole !== "admin" ? await getHiddenCategorySlugsByRole() : {};
      const hiddenSlugs = new Set(reqRole && reqRole !== "admin" ? (hiddenByRole[reqRole] ?? []) : []);
      const categories = await genFebStorage.getCategories();
      const catById = new Map<number, any>();
      for (const c of categories ?? []) {
        const id = Number((c as any)?.id);
        if (Number.isFinite(id)) catById.set(id, c);
      }

      const items: Array<{
        userId: string;
        name: string;
        email?: string | null;
        avatar?: string | null;
        requestType?: "onboarding" | "renewal";
        user_identification?: string | null;
        professionalCredentialUrl?: string | null;
        identification_verified: "pending" | "verified" | "rejected";
        transacction_date: string | null;
        transacction_verified: "pending" | "verified" | "rejected";
        transacction_code?: string | null;
        /** Slug de categoría del proveedor (p. ej. `transport` = Car Go). */
        providerCategorySlug?: string | null;
        /** ISO fin de suscripción vigente (si existe). */
        visibilitySubscriptionEndsAt?: string | null;
        /** Suscripción: meses y monto del comprobante (si existe). */
        subscriptionMonths?: number | null;
        subscriptionMonthlyUsd?: number | null;
        subscriptionTotalUsd?: number | null;
      }> = [];

      for (const st of pending ?? []) {
        const userId = String((st as any).user ?? "");
        if (!userId) continue;

        const provider = await genFebStorage.getProviderByUserId(userId);
        const providerEndsAtRaw = (provider as any)?.visibilitySubscriptionEndsAt;
        const providerEndsAtIso = (() => {
          const ms = parseVisibilitySubscriptionEndMs(providerEndsAtRaw);
          return ms == null ? null : new Date(ms).toISOString();
        })();
        const catId = Number((provider as any)?.categoryId);
        const slugFromId =
          Number.isFinite(catId) && catId > 0 ? String((catById.get(catId) as any)?.slug ?? "") : "";
        const providerCategorySlug =
          (slugFromId || String((provider as any)?.category ?? "").trim()) || null;

        // Filtrar por marca del proveedor (Delivery / Pedidos / Taxi, etc.) si aplica al rol.
        if (hiddenSlugs.size > 0) {
          if (providerCategorySlug && hiddenSlugs.has(providerCategorySlug)) continue;
        }

        const user = (await genFebStorage.getUserById(userId)) as any;
        const name =
          (user?.name ?? [user?.firstName ?? "", user?.lastName ?? ""].filter(Boolean).join(" ").trim()) ||
          user?.email ||
          "Usuario";
        const email = user?.email ?? null;
        const avatar = user?.avatar ?? null;
        const user_identification = user?.user_identification ?? null;

        const profVer = await genFebStorage.getProfessionalVerificationByUserId(userId);
        const transacction_code = profVer?.transferReceiptCode ?? null;
        const subscriptionMonths =
          typeof (profVer as any)?.subscriptionMonths === "number" && Number.isFinite((profVer as any).subscriptionMonths)
            ? Math.max(1, Math.min(12, Math.trunc((profVer as any).subscriptionMonths)))
            : null;
        const subscriptionMonthlyUsd =
          typeof (profVer as any)?.subscriptionMonthlyUsd === "number" && Number.isFinite((profVer as any).subscriptionMonthlyUsd)
            ? Math.max(0, Number((profVer as any).subscriptionMonthlyUsd))
            : null;
        const subscriptionTotalUsd =
          subscriptionMonths != null && subscriptionMonthlyUsd != null
            ? Math.round(subscriptionMonths * subscriptionMonthlyUsd * 100) / 100
            : null;
        const storedType = (st as any)?.requestType as ("onboarding" | "renewal" | undefined);
        const inferredType =
          storedType ??
          ((provider as any)?.isVerified === true && (st as any)?.transacction_verified === "pending" && (st as any)?.identification_verified !== "pending"
            ? "renewal"
            : "onboarding");

        const isRenewalProvider = (provider as any)?.isVerified === true;
        if (!isRenewalProvider && !isAssociateOnboardingDossierComplete(profVer)) {
          continue;
        }

        items.push({
          userId,
          name,
          email,
          avatar,
          requestType: inferredType,
          user_identification,
          professionalCredentialUrl: profVer?.professionalCredentialUrl ?? null,
          identification_verified: (st.identification_verified as any) ?? "rejected",
          transacction_date: st.transacction_date ?? null,
          transacction_verified: (st.transacction_verified as any) ?? "rejected",
          transacction_code,
          providerCategorySlug,
          visibilitySubscriptionEndsAt: providerEndsAtIso,
          subscriptionMonths,
          subscriptionMonthlyUsd,
          subscriptionTotalUsd,
        });
      }

      return res.status(200).json({ items, total: items.length });
    } catch (error) {
      console.error("Error listing verifying_status pending:", error);
      return res.status(500).json({ message: "Error al listar asociados" });
    }
  });

  app.get("/api/admin/audit-log", authenticateJWT, requireFullAdmin, async (req: any, res) => {
    try {
      const limRaw = Number(req.query?.limit ?? 50);
      const limit = Number.isFinite(limRaw) ? Math.max(1, Math.min(200, limRaw)) : 50;
      const db = getFirestore();
      let rawItems: any[];
      if (db) {
        const snap = await db
          .collection(FIRESTORE_COLLECTIONS.ADMIN_AUDIT_LOG)
          .orderBy("createdAt", "desc")
          .limit(limit)
          .get();
        rawItems = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      } else {
        rawItems = adminAuditMemoryLog.slice(0, limit).map((row) => ({
          id: row.id,
          action: row.action,
          adminUserId: row.adminUserId,
          affectedUserId: row.affectedUserId,
          meta: row.meta,
          createdAt: row.createdAt,
        }));
      }

      const uniqueAdminIds = Array.from(
        new Set(rawItems.map((it) => String(it.adminUserId ?? "").trim()).filter(Boolean)),
      );
      const uniqueAffectedIds = Array.from(
        new Set(rawItems.map((it) => String(it.affectedUserId ?? "").trim()).filter(Boolean)),
      );
      const adminById = new Map<string, { id: string; name: string; email: string | null }>();
      await Promise.all(
        uniqueAdminIds.map(async (id) => {
          try {
            const u = (await genFebStorage.getUserById(id)) as any;
            const name =
              (u?.name ?? [u?.firstName ?? "", u?.lastName ?? ""].filter(Boolean).join(" ").trim()) ||
              u?.email ||
              id;
            const email = u?.email ?? null;
            adminById.set(id, { id, name, email });
          } catch {
            adminById.set(id, { id, name: id, email: null });
          }
        }),
      );

      const affectedById = new Map<string, { id: string; name: string; email: string | null }>();
      await Promise.all(
        uniqueAffectedIds.map(async (id) => {
          try {
            const u = (await genFebStorage.getUserById(id)) as any;
            const name =
              (u?.name ?? [u?.firstName ?? "", u?.lastName ?? ""].filter(Boolean).join(" ").trim()) ||
              u?.email ||
              id;
            const email = u?.email ?? null;
            affectedById.set(id, { id, name, email });
          } catch {
            affectedById.set(id, { id, name: id, email: null });
          }
        }),
      );

      const items = rawItems.map((it) => {
        const admin = adminById.get(String(it.adminUserId ?? "").trim()) ?? null;
        const affected = affectedById.get(String(it.affectedUserId ?? "").trim()) ?? null;
        return {
          ...it,
          adminName: admin?.name ?? null,
          adminEmail: admin?.email ?? null,
          affectedUserName: affected?.name ?? null,
          affectedUserEmail: affected?.email ?? null,
        };
      });

      return res.json({ items, total: items.length });
    } catch (e) {
      console.error("Error listing admin audit log:", e);
      return res.status(500).json({ message: "Error al listar historial" });
    }
  });

  // GET /api/admin/account-change-requests/pending - Peticiones pendientes (correo/nombre/teléfono)
  app.get("/api/admin/account-change-requests/pending", authenticateJWT, requireFullAdmin, async (_req: any, res) => {
    try {
      const pending = await genFebStorage.getPendingAccountChangeRequests();
      const enriched: any[] = [];
      for (const r of pending ?? []) {
        const uid = String((r as any).userId ?? "");
        const u = (await genFebStorage.getUserById(uid, true)) as any;
        enriched.push({
          ...r,
          user: u
            ? {
                id: u.id,
                name: u.name,
                lastName: u.lastName,
                email: u.email,
                phone: u.phone,
                role: u.role,
              }
            : null,
        });
      }
      return res.json({ requests: enriched });
    } catch (e) {
      console.error("Error listing account change requests:", e);
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // PATCH /api/admin/account-change-requests/:id - Aprobar/Rechazar
  app.patch("/api/admin/account-change-requests/:id", authenticateJWT, requireFullAdmin, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "id inválido" });
      const schema = z.object({
        action: z.enum(["approve", "reject"]),
        reason: z.string().trim().min(3).max(600).optional(),
      });
      const body = schema.parse(req.body);

      const rejectReason = body.action === "reject" ? String(body.reason ?? "").trim() : "";
      if (body.action === "reject" && rejectReason.length < 3) {
        return res.status(400).json({ message: "Debes indicar el motivo del rechazo." });
      }

      const pendingList = await genFebStorage.getPendingAccountChangeRequests();
      const pendingRow = (pendingList as any[]).find((r) => Number(r?.id) === id) ?? null;
      if (!pendingRow) return res.status(404).json({ message: "Petición no encontrada o ya resuelta" });

      const fieldEarly = String((pendingRow as any)?.field ?? "");
      let parsedVehicleProposal: import("@shared/vehicle-change-proposal").VehicleChangeProposal | null = null;
      if (body.action === "approve" && fieldEarly === "vehicle") {
        const parsed = vehicleChangeProposalSchema.safeParse((pendingRow as any)?.proposal);
        if (!parsed.success) {
          return res.status(400).json({ message: "Propuesta de vehículo inválida", errors: parsed.error.flatten() });
        }
        const userIdEarly = String((pendingRow as any)?.userId ?? "");
        const provider = await catalogService.getProviderByUserId(userIdEarly);
        if (!provider) {
          return res.status(400).json({ message: "El usuario no tiene perfil de asociado." });
        }
        const categories = await catalogService.getCategories();
        const cat = categories.find((c) => c.id === parsed.data.categoryId);
        const slug = String((cat as { slug?: string })?.slug ?? "");
        if (!isMobilityGoDriverVehicleCategorySlug(slug)) {
          return res.status(400).json({ message: "La categoría debe ser taxi, delivery o marketplace." });
        }
        parsedVehicleProposal = parsed.data;
      }

      const resolved = await genFebStorage.resolveAccountChangeRequest({
        id,
        action: body.action,
        adminUserId: String(req.user.id),
      });

      // --- Auditoría ---
      try {
        const userId = String((resolved as any)?.userId ?? "");
        if (userId) {
          await createAdminAuditEvent({
            action: body.action === "approve" ? "account_change_request_approved" : "account_change_request_rejected",
            adminUserId: String(req.user?.id ?? ""),
            affectedUserId: userId,
            meta: {
              requestId: id,
              field: String((resolved as any)?.field ?? ""),
              ...(body.action === "reject" ? { reason: rejectReason } : null),
            },
          });
        }
      } catch {
        /* ignore */
      }

      const userId = String((resolved as any)?.userId ?? "");
      const field = String((resolved as any)?.field ?? "");
      const allowed = field === "email" || field === "name" || field === "phone";
      const allowedVehicle = field === "vehicle";

      const accountFieldLabelEs = (f: string) =>
        f === "email"
          ? "correo"
          : f === "name"
            ? "nombre"
            : f === "phone"
              ? "teléfono"
              : f === "vehicle"
                ? "vehículo"
                : "perfil";
      const capLabel = (f: string) => {
        const s = accountFieldLabelEs(f);
        return s.charAt(0).toUpperCase() + s.slice(1);
      };

      // Notificar y habilitar edición (grants) si se aprueba
      if (userId && allowed && body.action === "approve") {
        const u = (await genFebStorage.getUserById(userId, true)) as any;
        const current = u ?? {};
        const grants = (current.profileEditGrants ?? {}) as any;
        const next = { ...grants, [field]: true };
        await genFebStorage.updateUser(userId, { profileEditGrants: next } as any);

        const title = `${capLabel(field)}: aprobado`;
        const bodyText = "Abre Configuración para actualizar tu perfil.";
        const notifData = { field, url: "/settings", message: bodyText, title };
        const created = await genFebStorage.createNotification({
          userId,
          type: "account_change_request_approved",
          data: notifData,
        });

        const io = getIO();
        if (io) {
          io.to(`user:${userId}`).emit("notification", {
            id: (created as any)?.id,
            type: "account_change_request_approved",
            title,
            body: bodyText,
            data: notifData,
          });
        }
        void notificationService
          .sendPushToUser(userId, {
            title,
            body: bodyText,
            data: { url: "/settings" },
          })
          .catch((err) => console.error("[push-account-change] approve:", err));
      }

      if (userId && allowed && body.action === "reject") {
        const title = `${capLabel(field)}: rechazado`;
        const bodyText = `Tu solicitud fue rechazada. Motivo: ${rejectReason}`;
        const notifData = { field, url: "/settings", message: bodyText, title, reason: rejectReason };
        const created = await genFebStorage.createNotification({
          userId,
          type: "account_change_request_rejected",
          data: notifData,
        });

        const io = getIO();
        if (io) {
          io.to(`user:${userId}`).emit("notification", {
            id: (created as any)?.id,
            type: "account_change_request_rejected",
            title,
            body: bodyText,
            data: notifData,
          });
        }
        void notificationService
          .sendPushToUser(userId, {
            title,
            body: bodyText,
            data: { url: "/settings" },
          })
          .catch((err) => console.error("[push-account-change] reject:", err));
      }

      if (userId && allowedVehicle && body.action === "approve" && parsedVehicleProposal) {
        const provider = await catalogService.getProviderByUserId(userId);
        if (provider) {
          const categories = await catalogService.getCategories();
          const cat = categories.find((c) => c.id === parsedVehicleProposal!.categoryId);
          const slug = String((cat as { slug?: string })?.slug ?? "");
          await catalogService.updateProvider((provider as { id: number }).id, {
            categoryId: parsedVehicleProposal.categoryId,
            category: slug,
            subcategoryId: parsedVehicleProposal.subcategoryId ?? null,
            goBrands: parsedVehicleProposal.goBrands,
          } as any);
          await genFebStorage.upsertPrimaryProviderVehicle({
            providerId: (provider as { id: number }).id,
            userId,
            vehicle: parsedVehicleProposal.vehicle,
          });
        }
        const title = "Tu vehículo ya está configurado";
        const bodyText =
          "El equipo aprobó tu solicitud. Abre Configuración para ver placa, tipo de unidad y datos actualizados.";
        const notifData = {
          field: "vehicle",
          url: SETTINGS_URL_AFTER_VEHICLE_CHANGE_RESOLVED,
          message: bodyText,
          title,
        };
        const created = await genFebStorage.createNotification({
          userId,
          type: "vehicle_change_request_approved",
          data: notifData,
        });
        const io = getIO();
        if (io) {
          io.to(`user:${userId}`).emit("notification", {
            id: (created as any)?.id,
            type: "vehicle_change_request_approved",
            title,
            body: bodyText,
            data: notifData,
          });
        }
        void notificationService
          .sendPushToUser(userId, {
            title,
            body: bodyText,
            data: {
              url: SETTINGS_URL_AFTER_VEHICLE_CHANGE_RESOLVED,
              type: "vehicle_change_request_approved",
            },
          })
          .catch((err) => console.error("[push-vehicle-change] approve:", err));
      }

      if (userId && allowedVehicle && body.action === "reject") {
        const title = "Vehículo: solicitud rechazada";
        const bodyText = `Tu solicitud de cambio de vehículo fue rechazada. Motivo: ${rejectReason}`;
        const notifData = { field: "vehicle", url: "/settings", message: bodyText, title, reason: rejectReason };
        const created = await genFebStorage.createNotification({
          userId,
          type: "vehicle_change_request_rejected",
          data: notifData,
        });
        const io = getIO();
        if (io) {
          io.to(`user:${userId}`).emit("notification", {
            id: (created as any)?.id,
            type: "vehicle_change_request_rejected",
            title,
            body: bodyText,
            data: notifData,
          });
        }
        void notificationService
          .sendPushToUser(userId, {
            title,
            body: bodyText,
            data: { url: "/settings" },
          })
          .catch((err) => console.error("[push-vehicle-change] reject:", err));
      }

      return res.json({ request: resolved });
    } catch (e: any) {
      if (e instanceof z.ZodError) return res.status(400).json({ message: "Datos inválidos", errors: e.errors });
      const msg = e instanceof Error ? e.message : "Error";
      const code = String(msg).toLowerCase().includes("ya fue resuelta") ? 409 : 400;
      console.error("Error resolving account change request:", e);
      return res.status(code).json({ message: msg });
    }
  });

  const verifyingStatusActionSchema = z.object({
    action: z.enum(["approve", "reject"]),
    reason: z.string().trim().min(3).max(600).optional(),
  });

  app.patch(
    "/api/admin/verifying-status/:userId/identification",
    authenticateJWT,
    requireFullAdmin,
    async (req: any, res) => {
      try {
        const userId = String(req.params.userId ?? "").trim();
        if (!userId) return res.status(400).json({ message: "userId es requerido" });

        const parsed = verifyingStatusActionSchema.parse(req.body);
        const status = parsed.action === "approve" ? "verified" : "rejected";
        const rejectReason = status === "rejected" ? String(parsed.reason ?? "").trim() : "";
        if (status === "rejected" && rejectReason.length < 3) {
          return res.status(400).json({ message: "Debes indicar el motivo del rechazo." });
        }

        const updated = await genFebStorage.setVerifyingStatusIdentification(userId, status as any);
        if (status === "verified") {
          await maybeVerifyProfessional(userId);
        }

        // --- Auditoría ---
        try {
          const isApprove = status === "verified";
          await createAdminAuditEvent({
            action: isApprove ? "associate_onboarding_approved" : "associate_onboarding_rejected",
            adminUserId: String(req.user?.id ?? ""),
            affectedUserId: userId,
            meta: isApprove ? undefined : { reason: rejectReason },
          });
        } catch {
          /* ignore */
        }

        // --- Notificar al usuario ---
        try {
          const isApprove = status === "verified";
          const title = isApprove ? "Identificación aprobada" : "Identificación rechazada";
          const msg = isApprove
            ? "Tu identificación ha sido aprobada correctamente."
            : `Tu identificación ha sido rechazada. Motivo: ${rejectReason}`;

          await genFebStorage.createNotification({
            userId,
            type: "verification_result",
            data: { step: "identification", status, message: msg, url: "/professional-dashboard" }
          });

          const io = getIO();
          if (io) {
            io.to(`user:${userId}`).emit("notification", {
              type: "verification_result",
              title,
              body: msg,
              data: { step: "identification", status, url: "/professional-dashboard" }
            });
          }

          void notificationService.sendPushToUser(userId, {
            title,
            body: msg,
            data: { step: "identification", status, url: "/professional-dashboard" }
          }).catch(err => console.error("[push-id-res] Error:", err));
        } catch (err) {
          console.error("Error notificando resultado id:", err);
        }
        // ----------------------------

        return res.status(200).json(updated);
      } catch (error: any) {
        const msg = error?.message || "Error";
        const code = String(msg).toLowerCase().includes("pending") || String(msg).toLowerCase().includes("no está") ? 409 : 400;
        return res.status(code).json({ message: msg });
      }
    }
  );

  app.patch(
    "/api/admin/verifying-status/:userId/transaction",
    authenticateJWT,
    requireFullAdmin,
    async (req: any, res) => {
      try {
        const userId = String(req.params.userId ?? "").trim();
        if (!userId) return res.status(400).json({ message: "userId es requerido" });

        const parsed = verifyingStatusActionSchema.parse(req.body);
        const status = parsed.action === "approve" ? "verified" : "rejected";
        const rejectReason = status === "rejected" ? String(parsed.reason ?? "").trim() : "";
        if (status === "rejected" && rejectReason.length < 3) {
          return res.status(400).json({ message: "Debes indicar el motivo del rechazo." });
        }

        const updated = await genFebStorage.setVerifyingStatusTransaction(userId, status as any);
        let verificationReportId: number | null = null;
        if (status === "verified") {
          await maybeVerifyProfessional(userId);
          try {
            const providerAfter = await genFebStorage.getProviderByUserId(userId);
            if (providerAfter) {
              const approvalBase = (() => {
                const raw = (updated as any)?.transacction_date;
                const s = raw != null ? String(raw).trim() : "";
                // `yyyy-MM-dd` → usar mediodía UTC para evitar bordes por TZ/DST.
                if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00Z`);
                return new Date();
              })();
                const profVer = await genFebStorage.getProfessionalVerificationByUserId(userId);
              const receipt = (profVer?.transferReceiptCode ?? "").trim();
              const months =
                typeof (profVer as any)?.subscriptionMonths === "number" && Number.isFinite((profVer as any).subscriptionMonths)
                  ? Math.max(1, Math.min(12, Math.trunc((profVer as any).subscriptionMonths)))
                  : 1;
                const monthlyUsd =
                  typeof (profVer as any)?.subscriptionMonthlyUsd === "number" && Number.isFinite((profVer as any).subscriptionMonthlyUsd)
                    ? Math.max(0, Number((profVer as any).subscriptionMonthlyUsd))
                    : 15;
              const txDate = String((updated as any)?.transacction_date ?? "").trim();
              const paymentKey = receipt && txDate ? `${receipt}|${txDate}|${months}` : "";

              const alreadyApplied =
                paymentKey &&
                String((providerAfter as any)?.visibilitySubscriptionLastPaymentKey ?? "").trim() === paymentKey;

              if (!alreadyApplied) {
              const nextIso = extendVisibilitySubscriptionEndsAtByMonths(
                (providerAfter as { visibilitySubscriptionEndsAt?: unknown }).visibilitySubscriptionEndsAt,
                months,
                approvalBase,
              );
                await genFebStorage.updateProvider(Number((providerAfter as { id: number }).id), {
                  visibilitySubscriptionEndsAt: nextIso,
                  visibilitySubscriptionLastPaymentKey: paymentKey || null,
                  visibilitySubscriptionLastPaymentApprovedAt: new Date(),
                  visibilitySubscriptionLastPaymentApprovedBy: String(req.user?.id ?? ""),
                } as any);
              }
            }
          } catch (err) {
            console.error("[admin] visibilitySubscriptionEndsAt extend:", err);
          }
          
          // Reporte financiero (factura USD 15): completar pendiente o crear si faltaba al subir comprobante
          try {
            const reports = await genFebStorage.getFinancialReports(userId);
            const pendingFee = reports.find((r: { type?: string; status?: string }) => r.type === "verification_fee" && r.status === "pending");
            if (pendingFee) {
              const rid = pendingFee.id != null ? Number(pendingFee.id) : NaN;
              verificationReportId = Number.isFinite(rid) ? rid : null;
              await genFebStorage.updateFinancialReportStatus(pendingFee.id, "completed");
            } else {
              const alreadyDone = reports.find(
                (r: { type?: string; status?: string }) => r.type === "verification_fee" && r.status === "completed",
              );
              if (alreadyDone) {
                const rid = alreadyDone.id != null ? Number(alreadyDone.id) : NaN;
                verificationReportId = Number.isFinite(rid) ? rid : null;
              } else {
                const profVer = await genFebStorage.getProfessionalVerificationByUserId(userId);
                const months =
                  typeof (profVer as any)?.subscriptionMonths === "number" && Number.isFinite((profVer as any).subscriptionMonths)
                    ? Math.max(1, Math.min(12, Math.trunc((profVer as any).subscriptionMonths)))
                    : 1;
                const monthlyUsd =
                  typeof (profVer as any)?.subscriptionMonthlyUsd === "number" && Number.isFinite((profVer as any).subscriptionMonthlyUsd)
                    ? Math.max(0, Number((profVer as any).subscriptionMonthlyUsd))
                    : 15;
                const created = await genFebStorage.createFinancialReport({
                  userId,
                  type: "verification_fee",
                  amount: (monthlyUsd * months).toFixed(2),
                  currency: "USD",
                  status: "completed",
                  description: `Pago por suscripción de visibilidad (${months} mes(es))`,
                  createdAt: new Date(),
                });
                const cr = created?.id != null ? Number(created.id) : NaN;
                verificationReportId = Number.isFinite(cr) ? cr : null;
              }
            }
          } catch (err) {
            console.error("Error actualizando reporte financiero:", err);
          }
        } else {
          // Rechazo: marcar cargo pendiente como rechazado para poder crear uno nuevo al reenviar comprobante
          try {
            const reports = await genFebStorage.getFinancialReports(userId);
            const pendingFee = reports.find(r => r.type === "verification_fee" && r.status === "pending");
            if (pendingFee) {
              await genFebStorage.updateFinancialReportStatus(pendingFee.id, "rejected");
            }
          } catch (err) {
            console.error("Error actualizando reporte financiero (rechazo):", err);
          }
        }

        // --- Notificar al usuario ---
        try {
          const isApprove = status === "verified";
          const title = isApprove ? "Pago verificado" : "Pago rechazado";
          const msg = isApprove
            ? "Tu comprobante de pago ha sido verificado correctamente."
            : `Tu comprobante de pago ha sido rechazado. Motivo: ${rejectReason}`;

          const txNotifyData = (() => {
            const base: Record<string, unknown> = {
              step: "transaction",
              status,
              message: msg,
            };
            if (isApprove) {
              base.url =
                verificationReportId != null
                  ? `/professional-dashboard?tab=invoices&verificationInvoice=1&reportId=${verificationReportId}`
                  : `/professional-dashboard?tab=invoices&verificationInvoice=1`;
              if (verificationReportId != null) base.reportId = verificationReportId;
            } else {
              base.url = "/professional-dashboard";
            }
            return base;
          })();

          const pushNotifyData: Record<string, string> = {
            step: "transaction",
            status,
            message: msg,
            url:
              isApprove && verificationReportId != null
                ? `/professional-dashboard?tab=invoices&verificationInvoice=1&reportId=${verificationReportId}`
                : isApprove
                  ? `/professional-dashboard?tab=invoices&verificationInvoice=1`
                  : "/professional-dashboard",
          };
          if (isApprove && verificationReportId != null) {
            pushNotifyData.reportId = String(verificationReportId);
          }

          await genFebStorage.createNotification({
            userId,
            type: "verification_result",
            data: txNotifyData as any,
          });

          const io = getIO();
          if (io) {
            io.to(`user:${userId}`).emit("notification", {
              type: "verification_result",
              title,
              body: msg,
              data: txNotifyData,
            });
          }

          void notificationService.sendPushToUser(userId, {
            title,
            body: msg,
            data: pushNotifyData,
          }).catch(err => console.error("[push-tx-res] Error:", err));
        } catch (err) {
          console.error("Error notificando resultado tx:", err);
        }
        // ----------------------------

        // --- Auditoría ---
        try {
          const isApprove = status === "verified";
          const provider = await genFebStorage.getProviderByUserId(userId);
          const isRenewal = (provider as any)?.isVerified === true;
          await createAdminAuditEvent({
            action: isApprove
              ? "subscription_payment_approved"
              : "subscription_payment_rejected",
            adminUserId: String(req.user?.id ?? ""),
            affectedUserId: userId,
            meta: {
              requestType: isRenewal ? "renewal" : "onboarding",
              ...(isApprove ? null : { reason: rejectReason }),
            },
          });
        } catch {
          /* ignore */
        }

        return res.status(200).json(updated);
      } catch (error: any) {
        const msg = error?.message || "Error";
        const code = String(msg).toLowerCase().includes("pending") || String(msg).toLowerCase().includes("no está") ? 409 : 400;
        return res.status(code).json({ message: msg });
      }
    }
  );

  /**
   * GET /api/admin/providers/with-services
   * Lista profesionales que tienen al menos un servicio (activo o no), con métricas para el admin panel.
   * Incluye rating (de user), estado de verificación (provider.isVerified) y conteo de reservas.
   */
  app.get("/api/admin/providers/with-services", authenticateJWT, requireStaffFromDb, async (_req, res) => {
    try {
      // Usamos getAllServices y agrupamos por providerId para filtrar solo proveedores con servicios.
      const services = await adminListAllServices();
      const byProviderId = new Map<number, any[]>();
      for (const s of services ?? []) {
        const pid = (s as { providerId?: number; provider?: { id?: number } }).providerId ?? (s as any)?.provider?.id;
        if (pid == null) continue;
        const arr = byProviderId.get(Number(pid)) ?? [];
        arr.push(s);
        byProviderId.set(Number(pid), arr);
      }

      const items: Array<{
        providerId: number;
        userId: string;
        name: string;
        email?: string | null;
        profession?: string | null;
        category?: string | null;
        serviceCount: number;
        bookingsCount: number;
        rating: number;
        ratingCount: number;
        verified: boolean;
      }> = [];

      for (const [providerId, providerServices] of Array.from(byProviderId.entries())) {
        const provider = await genFebStorage.getProvider(providerId);
        if (!provider) continue;
        const userId = String((provider as { userId?: string }).userId ?? "");
        if (!userId) continue;
        const rawUser = await genFebStorage.getUserById(userId);
        const u = rawUser as { name?: string; firstName?: string; lastName?: string; email?: string | null; rating?: number; ratingCount?: number } | null;
        const name =
          (u?.name ?? [u?.firstName ?? "", u?.lastName ?? ""].filter(Boolean).join(" ").trim()) || "Usuario";
        const rating = typeof u?.rating === "number" ? u.rating : 5;
        const ratingCount = typeof u?.ratingCount === "number" ? u.ratingCount : 0;
        const email = u?.email ?? null;

        const bookings = await genFebStorage.getBookingsByProvider(providerId);
        const bookingsCount = (bookings ?? []).length;

        items.push({
          providerId,
          userId,
          name,
          email,
          profession: (provider as { profession?: string | null }).profession ?? null,
          category: (provider as { category?: string | null }).category ?? null,
          serviceCount: providerServices.length,
          bookingsCount,
          rating,
          ratingCount,
          verified: (provider as { isVerified?: boolean | null }).isVerified === true,
        });
      }

      // Orden: más reservas primero
      items.sort((a, b) => b.bookingsCount - a.bookingsCount);
      return res.status(200).json({ providers: items, total: items.length });
    } catch (error) {
      console.error("Error listing providers with services:", error);
      return res.status(500).json({ message: "Error al listar proveedores" });
    }
  });

  /**
   * GET /api/admin/services/active
   * Staff (admin o Soporte TI): lista todos los servicios activos (isActive !== false) con datos del proveedor/usuario.
   * Nota: se lee directo de Firestore para no aplicar filtros del catálogo público (p. ej. verificación).
   */
  app.get("/api/admin/services/active", authenticateJWT, requireStaffFromDb, async (req: any, res) => {
    try {
      const role = req.user?.role as string | undefined;
      const hiddenForRole = new Set(await getHiddenCategorySlugsForRole(role));
      const search = String(req.query.search ?? "").trim().toLowerCase();
      const brandSlug = String(req.query.brandSlug ?? "").trim();

      const db = getFirestore();
      if (!db) {
        // Sin Firestore, caemos a storage (puede ser vacío en memoria) y filtramos.
        const list = (await adminListAllServices()) ?? [];
        const active = list.filter((s: any) => s?.isActive !== false);
        return res.status(200).json({ services: active, total: active.length });
      }

      const [categoriesSnap, servicesSnap] = await Promise.all([
        db.collection(FIRESTORE_COLLECTIONS.CATEGORIES).get(),
        db.collection(FIRESTORE_COLLECTIONS.SERVICES).get(),
      ]);
      const categories = categoriesSnap.docs.map((d) => ({ id: parseInt(d.id, 10), ...d.data() })) as any[];
      const catById = new Map<number, any>();
      for (const c of categories) catById.set(Number(c.id), c);

      const serviceDocs = servicesSnap.docs.map((d) => ({ id: parseInt(d.id, 10), ...d.data() })) as any[];
      const activeServices = serviceDocs.filter((s) => s?.isActive !== false);

      // Cache provider/user para evitar N+1 pesado
      const providerCache = new Map<number, any>();
      const userCache = new Map<string, any>();

      const out: any[] = [];
      for (const s of activeServices) {
        const providerId = Number(s?.providerId);
        const provider =
          Number.isFinite(providerId) && providerId > 0
            ? (providerCache.get(providerId) ?? (await genFebStorage.getProvider(providerId)))
            : null;
        if (provider && Number.isFinite(providerId)) providerCache.set(providerId, provider);

        const userId = String((provider as any)?.userId ?? "");
        const user = userId ? (userCache.get(userId) ?? (await genFebStorage.getUserById(userId))) : null;
        if (userId) userCache.set(userId, user);

        const category = catById.get(Number(s?.categoryId)) ?? null;
        const slug = String(category?.slug ?? "");
        if (slug && hiddenForRole.has(slug)) continue;
        if (brandSlug && slug !== brandSlug) continue;

        out.push({
          id: Number(s?.id),
          title: String(s?.title ?? ""),
          price: s?.price ?? null,
          categoryId: Number(s?.categoryId),
          categorySlug: category?.slug ?? null,
          categoryDisplayName: category ? getCategoryDisplayName(category) : null,
          providerId: providerId,
          providerVerified: (provider as any)?.isVerified === true,
          providerProfession: (provider as any)?.profession ?? null,
          userId,
          userName:
            (user as any)?.name ??
            [String((user as any)?.firstName ?? ""), String((user as any)?.lastName ?? "")]
              .filter(Boolean)
              .join(" ")
              .trim(),
          userEmail: (user as any)?.email ?? null,
        });
      }

      const filtered = search
        ? out.filter((row: any) => {
            const h = `${row.title ?? ""} ${row.userName ?? ""} ${row.userEmail ?? ""}`.toLowerCase();
            return h.includes(search);
          })
        : out;

      filtered.sort((a, b) => String(a.categoryDisplayName ?? "").localeCompare(String(b.categoryDisplayName ?? ""), "es"));
      return res.status(200).json({ services: filtered, total: filtered.length });
    } catch (e) {
      console.error("Error listing active services (admin):", e);
      return res.status(500).json({ message: "Error al listar servicios activos" });
    }
  });

  /**
   * GET /api/admin/service-brands
   * Admin-only: lista marcas (Fix Go / Man Go / Pro Go / etc.) con conteos de servicios activos/inactivos.
   * Nota: "marca" aquí = categoría (categories) cuyo slug está en DEFAULT_CATEGORIES.
   */
  app.get("/api/admin/service-brands", authenticateJWT, requireFullAdmin, async (_req, res) => {
    try {
      const [categories, services] = await Promise.all([genFebStorage.getCategories(), adminListAllServices()]);
      const brandSlugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));
      const hiddenSlugs = new Set(await getHiddenCategorySlugs());
      const brands = (categories ?? [])
        .filter((c: any) => brandSlugs.has(String(c?.slug ?? "")))
        .map((c: any) => {
          const catId = Number(c.id);
          const svc = (services ?? [])
            .filter((s: any) => serviceBelongsToBrand(s, catId, categories ?? []))
            .filter((s: any) => s?.provider?.isVerified === true);
          const activeServices = svc.filter((s: any) => s?.isActive !== false).length;
          const inactiveServices = svc.length - activeServices;
          const slug = String(c.slug ?? "");
          const uiHidden = hiddenSlugs.has(slug);
          return {
            categoryId: catId,
            slug,
            name: String(c.name ?? ""),
            displayName: getCategoryDisplayName(c),
            uiHidden,
            totalServices: svc.length,
            activeServices,
            inactiveServices,
          };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
      return res.status(200).json({ brands });
    } catch (e) {
      console.error("Error listing service brands:", e);
      return res.status(500).json({ message: "Error al listar marcas de servicios" });
    }
  });

  /**
   * GET /api/admin/category-visibility/by-role
   * Admin-only: mapa de slugs ocultos por rol (además del ocultamiento global).
   */
  app.get("/api/admin/category-visibility/by-role", authenticateJWT, requireFullAdmin, async (_req, res) => {
    try {
      const map = await getHiddenCategorySlugsByRole();
      return res.status(200).json({ byRole: map });
    } catch (e) {
      console.error("Error reading role category visibility:", e);
      return res.status(500).json({ message: "Error al leer visibilidad por rol" });
    }
  });

  const roleVisibilityPatchSchema = z.object({
    role: z.string().min(1).max(50),
    hiddenSlugs: z.array(z.string().min(1).max(50)).default([]),
  });

  /**
   * PATCH /api/admin/category-visibility/by-role
   * Admin-only: define slugs ocultos para un rol (no afecta admin).
   */
  app.patch("/api/admin/category-visibility/by-role", authenticateJWT, requireFullAdmin, async (req, res) => {
    try {
      const parsed = roleVisibilityPatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos" });
      if (parsed.data.role === "admin") return res.status(400).json({ message: "No se puede configurar ocultamiento para admin" });
      const byRole = await setHiddenCategorySlugsForRole(parsed.data.role, parsed.data.hiddenSlugs);
      return res.status(200).json({ ok: true, byRole });
    } catch (e: any) {
      const msg = e?.message || "Error al guardar visibilidad por rol";
      return res.status(400).json({ message: msg });
    }
  });

  const brandToggleSchema = z.object({ isActive: z.boolean() });

  /**
   * PATCH /api/admin/service-brands/:categoryId
   * Admin-only: activa/desactiva TODOS los servicios de una marca (categoryId).
   */
  app.patch("/api/admin/service-brands/:categoryId", authenticateJWT, requireFullAdmin, async (req, res) => {
    try {
      const categoryId = Number(req.params.categoryId);
      if (!Number.isFinite(categoryId) || categoryId <= 0) {
        return res.status(400).json({ message: "categoryId inválido" });
      }
      const parsed = brandToggleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos" });

      // Preparar info de marca para notificaciones
      const categories = await genFebStorage.getCategories();
      const cat = (categories ?? []).find((c: any) => Number(c?.id) === categoryId);
      const slug = String((cat as any)?.slug ?? "");
      const brandDisplay = cat ? getCategoryDisplayName(cat) : `Categoría ${categoryId}`;

      // 1) Visibilidad de la marca en UI (chips)
      try {
        if (slug) {
          const currentHidden = new Set(await getHiddenCategorySlugs());
          if (parsed.data.isActive) currentHidden.delete(slug);
          else currentHidden.add(slug);
          await setHiddenCategorySlugs(Array.from(currentHidden));
        }
      } catch (e) {
        console.error("Error updating category visibility:", e);
      }

      const all = await adminListAllServices();
      const target = (all ?? []).filter((s: any) => serviceBelongsToBrand(s, categoryId, categories ?? []));
      const ids = target.map((s: any) => Number(s?.id)).filter((id: any) => Number.isFinite(id));

      await Promise.all(ids.map((id) => genFebStorage.updateService(Number(id), { isActive: parsed.data.isActive })));

      // 2) Notificar a admins (solo rol admin) que se cambió el estatus de una marca/servicios
      try {
        const adminUserId = String((req as any).user?.id ?? "");
        const adminWhoProcessed = adminUserId ? await genFebStorage.getUserById(adminUserId) : null;
        const adminName =
          (adminWhoProcessed as { name?: string; firstName?: string; lastName?: string; email?: string } | null)?.name ??
          ([((adminWhoProcessed as any)?.firstName ?? ""), ((adminWhoProcessed as any)?.lastName ?? "")].filter(Boolean).join(" ") ||
            (adminWhoProcessed as any)?.email ||
            "Un administrador");
        const actionLabel = parsed.data.isActive ? "activó" : "desactivó";
        const title = "Cambio de estatus de marca";
        const body = `${adminName} ${actionLabel} ${brandDisplay}.`;

        const allAdmins = await getFullAdminUsers(genFebStorage);
        for (const admin of allAdmins ?? []) {
          const aid = (admin as { id?: string }).id;
          if (!aid) continue;
          // Notificar a todos los admins (incluyendo al que ejecutó) según tu requerimiento
          await genFebStorage.createNotification({
            userId: aid,
            type: "admin",
            data: {
              type: "brand_status_changed",
              brandCategoryId: categoryId,
              brandSlug: slug || undefined,
              brandName: brandDisplay,
              isActive: parsed.data.isActive,
              changedByAdminId: adminUserId || undefined,
              changedByAdminName: adminName,
              message: body,
            },
          });
          void notificationService
            .sendPushToUser(aid, {
              title,
              body,
              data: {
                url: "/admin?tab=services",
                type: "admin",
                adminEvent: "brand_status_changed",
                brandCategoryId: String(categoryId),
                brandSlug: slug,
                isActive: String(parsed.data.isActive),
              },
            })
            .catch(() => {});
        }

        const io = getIO();
        if (io) {
          sendNotificationToAdmins(io, {
            type: "brand_status_changed",
            data: { categoryId, slug, brandName: brandDisplay, isActive: parsed.data.isActive, changedByAdminName: adminName },
          });
        }
      } catch (e) {
        console.error("Error notifying admins on brand toggle:", e);
      }

      return res.status(200).json({ ok: true, updated: ids.length });
    } catch (e) {
      console.error("Error toggling brand services:", e);
      return res.status(500).json({ message: "Error al actualizar servicios de la marca" });
    }
  });

  /**
   * GET /api/admin/service-brands/:categoryId/providers
   * Admin-only: lista "usuarios" (proveedores) dentro de una marca con filtros básicos.
   */
  app.get("/api/admin/service-brands/:categoryId/providers", authenticateJWT, requireFullAdmin, async (req, res) => {
    try {
      const categoryId = Number(req.params.categoryId);
      if (!Number.isFinite(categoryId) || categoryId <= 0) {
        return res.status(400).json({ message: "categoryId inválido" });
      }
      const search = String(req.query.search ?? "").trim().toLowerCase();
      const minRating = req.query.minRating != null ? Number(req.query.minRating) : undefined;
      const sort = String(req.query.sort ?? "rating_desc");
      const subcategoryId =
        req.query.subcategoryId != null && String(req.query.subcategoryId).trim() !== ""
          ? Number(req.query.subcategoryId)
          : undefined;

      const [services, categories] = await Promise.all([adminListAllServices(), genFebStorage.getCategories()]);
      let inBrand = (services ?? []).filter((s: any) => serviceBelongsToBrand(s, categoryId, categories ?? []));
      if (subcategoryId != null && Number.isFinite(subcategoryId) && subcategoryId > 0) {
        inBrand = inBrand.filter((s: any) => Number(s?.subcategoryId) === subcategoryId);
      }

      const byProvider = new Map<number, any[]>();
      for (const s of inBrand) {
        const pid = Number(s?.providerId);
        if (!Number.isFinite(pid)) continue;
        const arr = byProvider.get(pid) ?? [];
        arr.push(s);
        byProvider.set(pid, arr);
      }

      const items: Array<{
        providerId: number;
        userId: string;
        name: string;
        email?: string | null;
        rating: number;
        ratingCount: number;
        verified: boolean;
        totalServices: number;
        activeServices: number;
        inactiveServices: number;
      }> = [];

      for (const [providerId, svc] of Array.from(byProvider.entries())) {
        const provider = await genFebStorage.getProvider(providerId);
        if (!provider) continue;
        const userId = String((provider as any)?.userId ?? "");
        if (!userId) continue;
        const rawUser = await genFebStorage.getUserById(userId);
        const u = rawUser as any;
        const name = (u?.name ?? [u?.firstName ?? "", u?.lastName ?? ""].filter(Boolean).join(" ").trim()) || "Usuario";
        const email = u?.email ?? null;
        const rating = typeof u?.rating === "number" ? u.rating : Number(u?.rating ?? 5) || 5;
        const ratingCount = typeof u?.ratingCount === "number" ? u.ratingCount : Number(u?.ratingCount ?? 0) || 0;

        const totalServices = svc.length;
        const activeServices = svc.filter((s: any) => s?.isActive !== false).length;
        const inactiveServices = totalServices - activeServices;

        // Documento Firestore (sin depender de `svc[0].provider` del listado, que a veces no coincide).
        const platformVerified = (provider as { isVerified?: unknown }).isVerified === true;
        const adminAsAssociate = isFullAdmin(u?.role);
        if (!platformVerified && !adminAsAssociate) continue;

        const verified = platformVerified || adminAsAssociate;

        const haystack = `${name} ${email ?? ""}`.toLowerCase();
        if (search && !haystack.includes(search)) continue;
        if (minRating != null && Number.isFinite(minRating) && rating < minRating) continue;

        items.push({
          providerId,
          userId,
          name,
          email,
          rating,
          ratingCount,
          verified,
          totalServices,
          activeServices,
          inactiveServices,
        });
      }

      const cmpName = (a: any, b: any) => a.name.localeCompare(b.name, "es");
      const cmpRatingDesc = (a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0) || cmpName(a, b);
      const cmpRatingAsc = (a: any, b: any) => (a.rating ?? 0) - (b.rating ?? 0) || cmpName(a, b);
      const cmpActiveDesc = (a: any, b: any) => (b.activeServices ?? 0) - (a.activeServices ?? 0) || cmpRatingDesc(a, b);

      if (sort === "name_asc") items.sort(cmpName);
      else if (sort === "rating_asc") items.sort(cmpRatingAsc);
      else if (sort === "active_desc") items.sort(cmpActiveDesc);
      else items.sort(cmpRatingDesc);

      return res.status(200).json({ providers: items, total: items.length });
    } catch (e) {
      console.error("Error listing brand providers:", e);
      return res.status(500).json({ message: "Error al listar proveedores de la marca" });
    }
  });

  const providerToggleSchema = z.object({ isActive: z.boolean() });

  /**
   * PATCH /api/admin/providers/:providerId/services
   * Admin-only: activa/desactiva servicios del proveedor (en todas sus marcas).
   */
  app.patch("/api/admin/providers/:providerId/services", authenticateJWT, requireFullAdmin, async (req, res) => {
    try {
      const providerId = Number(req.params.providerId);
      if (!Number.isFinite(providerId) || providerId <= 0) {
        return res.status(400).json({ message: "providerId inválido" });
      }
      const parsed = providerToggleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos" });

      const provider = await genFebStorage.getProvider(providerId);
      const providerUserId = String((provider as any)?.userId ?? "");

      const all = await adminListAllServices();
      const target = (all ?? []).filter((s: any) => Number(s?.providerId) === providerId);
      const ids = target.map((s: any) => Number(s?.id)).filter((id: any) => Number.isFinite(id));
      await Promise.all(ids.map((id) => genFebStorage.updateService(Number(id), { isActive: parsed.data.isActive })));

      return res.status(200).json({ ok: true, updated: ids.length });
    } catch (e) {
      console.error("Error toggling provider services:", e);
      return res.status(500).json({ message: "Error al actualizar servicios del proveedor" });
    }
  });

  /**
   * GET /api/admin/bookings
   * Lista todas las reservas (admin), enriquecidas con service + provider + client (cuando el storage lo provee).
   * Estrategia: iterar todos los proveedores y unir sus bookings (cada booking pertenece a 1 providerId).
   */
  app.get("/api/admin/bookings", authenticateJWT, requireStaffFromDb, async (_req, res) => {
    try {
      const providers = await genFebStorage.getAllProviders();
      const map = new Map<number, any>();
      for (const p of providers ?? []) {
        const providerId = (p as { id?: number }).id;
        if (providerId == null) continue;
        const bookings = await genFebStorage.getBookingsByProvider(Number(providerId));
        for (const b of bookings ?? []) {
          const bid = Number((b as { id?: number }).id);
          if (!Number.isFinite(bid)) continue;
          map.set(bid, b);
        }
      }
      const list = Array.from(map.values());
      const toMs = (x: unknown) =>
        x instanceof Date
          ? x.getTime()
          : (x as { toDate?: () => Date })?.toDate?.()?.getTime?.() ?? (typeof x === "string" ? new Date(x).getTime() : 0);
      list.sort((a: any, b: any) => toMs(b.createdAt ?? b.date) - toMs(a.createdAt ?? a.date));
      return res.status(200).json({ bookings: list, total: list.length });
    } catch (error) {
      console.error("Error listing admin bookings:", error);
      return res.status(500).json({ message: "Error al listar reservas" });
    }
  });

  const adminUpdateBookingSchema = z.object({
    status: z.enum(["pending", "confirmed", "in_progress", "completed", "cancelled"]).optional(),
    cost: z.number().min(0).optional(),
    scheduleIso: z.string().min(1).optional(),
  });

  /**
   * PATCH /api/admin/bookings/:id
   * Permite al admin corregir status/costo/horario. Se recomienda usarlo solo en casos especiales.
   */
  app.patch("/api/admin/bookings/:id", authenticateJWT, requireStaffFromDb, async (req: any, res) => {
    try {
      const bookingId = Number(req.params.id);
      if (!Number.isFinite(bookingId)) return res.status(400).json({ message: "ID inválido" });
      const body = adminUpdateBookingSchema.parse(req.body);
      const current = await genFebStorage.getBooking(bookingId);
      if (!current) return res.status(404).json({ message: "Reserva no encontrada" });

      if (body.cost != null) {
        await genFebStorage.updateBookingCost(bookingId, body.cost);
      }
      if (body.scheduleIso) {
        const d = new Date(body.scheduleIso);
        if (!Number.isFinite(d.getTime())) return res.status(400).json({ message: "scheduleIso inválido" });
        await genFebStorage.updateBookingSchedule(bookingId, d);
      }

      if (body.status) {
        const bid = current as { confirmedByClient?: boolean; status?: string };
        if (body.status === "completed") {
          if (bid.confirmedByClient === true) {
            await genFebStorage.completeBookingAndReleaseEscrow(bookingId);
          } else {
            await genFebStorage.updateBookingStatus(bookingId, "completed");
          }
        } else if (body.status === "cancelled") {
          if (bid.confirmedByClient === true) {
            await genFebStorage.cancelBookingAndRefundClientEscrow(bookingId);
          } else {
            await genFebStorage.updateBookingStatus(bookingId, "cancelled");
          }
        } else {
          await genFebStorage.updateBookingStatus(bookingId, body.status);
        }
      }

      const updated = await genFebStorage.getBooking(bookingId);
      await applyServiceBookingChatLifecycle(getIO(), genFebStorage, updated ?? current);
      return res.status(200).json(updated ?? current);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error("Error updating admin booking:", error);
      return res.status(500).json({ message: "Error al actualizar la reserva" });
    }
  });

  /**
   * GET /api/admin/conversations
   * Lista conversaciones para auditoría (sin filtro de gracia de 24h ni ocultamiento por usuario).
   */
  app.get("/api/admin/conversations", authenticateJWT, requireStaffFromDb, async (req: any, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
      const conversations = await genFebStorage.listConversationsForAdmin({ limit });
      return res.status(200).json({ conversations, total: conversations.length });
    } catch (error) {
      console.error("Error listing admin conversations:", error);
      return res.status(500).json({ message: "Error al listar conversaciones" });
    }
  });

  /**
   * GET /api/admin/conversations/:id/messages
   * Historial de mensajes para revisión interna (staff).
   */
  app.get("/api/admin/conversations/:id/messages", authenticateJWT, requireStaffFromDb, async (req: any, res) => {
    try {
      const conversationId = Number(req.params.id);
      if (!Number.isFinite(conversationId)) return res.status(400).json({ message: "ID inválido" });
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
      const before = req.query.before != null ? Number(req.query.before) : undefined;
      const { messages, hasMore } = await genFebStorage.getMessagesByConversation(conversationId, {
        limit,
        before: before && !Number.isNaN(before) ? before : undefined,
      });
      return res.status(200).json({ messages, hasMore });
    } catch (error) {
      console.error("Error fetching admin conversation messages:", error);
      return res.status(500).json({ message: "Error al cargar mensajes" });
    }
  });

  // GET /api/admin/withdrawals - Lista usuarios con withdrawingFunds > 0 (solo admin)
  app.get("/api/admin/withdrawals", authenticateJWT, requireFullAdmin, async (_req, res) => {
    try {
      const list = await genFebStorage.getUsersWithPendingWithdrawals();
      return res.status(200).json(list);
    } catch (error) {
      console.error("Error listing pending withdrawals:", error);
      return res.status(500).json({ message: "Error al listar solicitudes de retiro" });
    }
  });

  const withdrawalActionSchema = z.object({
    action: z.enum(["approve", "reject"]),
    adminNote: z.string().max(500).optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  });

  // PATCH /api/admin/withdrawals/:userId - Aprobar o rechazar retiro (solo admin). Atómico + notificación al usuario. adminNote opcional.
  app.patch("/api/admin/withdrawals/:userId", authenticateJWT, requireFullAdmin, async (req: any, res) => {
    try {
      const userId = (req.params.userId as string)?.trim();
      if (!userId) return res.status(400).json({ message: "userId es requerido" });
      const parsed = withdrawalActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "action debe ser 'approve' o 'reject'" });
      }
      const adminUserId = req.user?.id as string;
      const { action, adminNote } = parsed.data;

      if (action === "approve") {
        // Liquidación: withdrawingFunds → 0 y registro en historial; el monto NO se transfiere a cuenta admin (pago externo manual).
        const { transfer, user } = await genFebStorage.processWithdrawalApproval(userId, adminUserId);
        const professionalName = (user as { name?: string; firstName?: string; lastName?: string; email?: string }).name
          ?? ([((user as { firstName?: string }).firstName ?? ""), ((user as { lastName?: string }).lastName ?? "")].filter(Boolean).join(" ") || (user as { email?: string }).email || "Usuario");
        const amountFormatted = new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(transfer.amount);

        const approvedMessage = "Tu retiro fue aprobado. Tus fondos fueron enviados a la cuenta bancaria registrada.";
        const notificationData: Record<string, unknown> = {
          message: approvedMessage,
          amount: transfer.amount,
          transferId: transfer.id,
        };
        if (adminNote) notificationData.adminNote = adminNote;

        if (!SUPPRESS_GENFEB_WALLET_FLOW_NOTIFICATIONS) {
          await genFebStorage.createNotification({
            userId,
            type: "withdrawal_approved",
            data: notificationData,
          });
          const io = getIO();
          const bodyWithNote = adminNote ? `${approvedMessage} Nota: ${adminNote}` : approvedMessage;
          if (io) {
            io.to(`user:${userId}`).emit("notification", {
              type: "withdrawal_approved",
              title: "Retiro aprobado",
              body: bodyWithNote,
              data: { message: approvedMessage, amount: transfer.amount, transferId: transfer.id, adminNote: adminNote ?? undefined },
            });
          }
          void notificationService.sendPushToUser(userId, {
            title: "Retiro aprobado",
            body: bodyWithNote,
          }).catch(() => {});

          // Notificar a los demás admins: el retiro ya fue procesado por otro admin (queda en historial para evitar duplicados)
          const adminWhoProcessed = await genFebStorage.getUserById(adminUserId);
          const adminName = (adminWhoProcessed as { name?: string; firstName?: string; lastName?: string; email?: string })?.name
            ?? ([((adminWhoProcessed as { firstName?: string })?.firstName ?? ""), ((adminWhoProcessed as { lastName?: string })?.lastName ?? "")].filter(Boolean).join(" ") || (adminWhoProcessed as { email?: string })?.email || "Un administrador");
          const allAdmins = await getFullAdminUsers(genFebStorage);
          for (const admin of allAdmins ?? []) {
            const aid = (admin as { id?: string }).id;
            if (aid && aid !== adminUserId) {
              await genFebStorage.createNotification({
                userId: aid,
                type: "admin",
                data: {
                  type: "withdrawal_processed_by_other",
                  action: "approved",
                  message: `El retiro de ${professionalName} ($${amountFormatted} USD) fue aprobado por ${adminName}. Ya no aparece en Solicitudes de Retiro.`,
                  professionalUserId: userId,
                  professionalName,
                  amount: transfer.amount,
                  amountFormatted,
                  processedByAdminId: adminUserId,
                  processedByAdminName: adminName,
                },
              });
              void notificationService
                .sendPushToUser(aid, {
                  title: "Retiro aprobado por otro admin",
                  body: `El retiro de ${professionalName} ($${amountFormatted} USD) fue aprobado por ${adminName}.`,
                  data: {
                    url: "/admin?tab=payouts",
                    type: "admin",
                    withdrawalType: "withdrawal_processed_by_other",
                    action: "approved",
                    professionalUserId: userId,
                    professionalName,
                    amountFormatted,
                  },
                })
                .catch((err) => console.error("[push] Error notificando retiro aprobado por otro admin:", err));
            }
          }
          const ioBroadcast = getIO();
          if (ioBroadcast) {
            sendNotificationToAdmins(ioBroadcast, {
              type: "withdrawal_processed_by_other",
              action: "approved",
              data: { professionalUserId: userId, professionalName, amountFormatted, processedByAdminName: adminName },
            });
          }
        }

        return res.status(200).json({ message: "Pago aprobado y registrado.", transfer, user: toPlainUser(user) });
      } else {
        // Rollback: withdrawingFunds regresa íntegramente al wallet del profesional; luego withdrawingFunds = 0.
        const { user, amount: rejectedAmount } = await genFebStorage.processWithdrawalRejection(userId);
        await genFebStorage.recordWithdrawalRejection(
          userId,
          rejectedAmount,
          adminUserId,
          (user as { bankName?: string }).bankName,
          (user as { accountNumber?: string }).accountNumber
        );
        const professionalName = (user as { name?: string; firstName?: string; lastName?: string; email?: string }).name
          ?? ([((user as { firstName?: string }).firstName ?? ""), ((user as { lastName?: string }).lastName ?? "")].filter(Boolean).join(" ") || (user as { email?: string }).email || "Usuario");

        const rejectedMessage = "Tu solicitud de retiro fue rechazada. Los fondos fueron devueltos a tu Saldo Genfeb.";
        const rejectionData: Record<string, unknown> = { message: rejectedMessage };
        if (adminNote) rejectionData.adminNote = adminNote;

        if (!SUPPRESS_GENFEB_WALLET_FLOW_NOTIFICATIONS) {
          await genFebStorage.createNotification({
            userId,
            type: "withdrawal_rejected",
            data: rejectionData,
          });
          const io = getIO();
          const bodyReject = adminNote ? `${rejectedMessage} Nota: ${adminNote}` : rejectedMessage;
          if (io) {
            io.to(`user:${userId}`).emit("notification", {
              type: "withdrawal_rejected",
              title: "Retiro rechazado",
              body: bodyReject,
              data: { message: rejectedMessage, adminNote: adminNote ?? undefined },
            });
          }
          void notificationService.sendPushToUser(userId, {
            title: "Retiro rechazado",
            body: bodyReject,
          }).catch(() => {});

          const adminWhoProcessed = await genFebStorage.getUserById(adminUserId);
          const adminName = (adminWhoProcessed as { name?: string; firstName?: string; lastName?: string; email?: string })?.name
            ?? ([((adminWhoProcessed as { firstName?: string })?.firstName ?? ""), ((adminWhoProcessed as { lastName?: string })?.lastName ?? "")].filter(Boolean).join(" ") || (adminWhoProcessed as { email?: string })?.email || "Un administrador");
          const allAdmins = await getFullAdminUsers(genFebStorage);
          for (const admin of allAdmins ?? []) {
            const aid = (admin as { id?: string }).id;
            if (aid && aid !== adminUserId) {
              await genFebStorage.createNotification({
                userId: aid,
                type: "admin",
                data: {
                  type: "withdrawal_processed_by_other",
                  action: "rejected",
                  message: `El retiro de ${professionalName} fue rechazado por ${adminName}. Los fondos fueron devueltos a su Saldo Genfeb.`,
                  professionalUserId: userId,
                  professionalName,
                  processedByAdminId: adminUserId,
                  processedByAdminName: adminName,
                },
              });
              void notificationService
                .sendPushToUser(aid, {
                  title: "Retiro rechazado por otro admin",
                  body: `El retiro de ${professionalName} fue rechazado por ${adminName}.`,
                  data: {
                    url: "/admin?tab=payouts",
                    type: "admin",
                    withdrawalType: "withdrawal_processed_by_other",
                    action: "rejected",
                    professionalUserId: userId,
                    professionalName,
                  },
                })
                .catch((err) => console.error("[push] Error notificando retiro rechazado por otro admin:", err));
            }
          }
          const ioBroadcast = getIO();
          if (ioBroadcast) {
            sendNotificationToAdmins(ioBroadcast, {
              type: "withdrawal_processed_by_other",
              action: "rejected",
              data: { professionalUserId: userId, professionalName, processedByAdminName: adminName },
            });
          }
        }

        return res.status(200).json({ message: "Retiro rechazado; fondos devueltos al Saldo Genfeb del usuario.", user: toPlainUser(user) });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === "Usuario no encontrado" || msg === "No hay retiro pendiente") {
        return res.status(404).json({ message: msg });
      }
      console.error("Error processing withdrawal:", error);
      return res.status(500).json({ message: "Error al procesar la solicitud de retiro" });
    }
  });

  // GET /api/admin/withdrawals/history - Historial de retiros (aprobados/rechazados) con paginación y filtro
  app.get("/api/admin/withdrawals/history", authenticateJWT, requireFullAdmin, async (req: any, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
      const status = (req.query.status as string)?.toLowerCase();
      const validStatus =
        status === "approved" || status === "rejected" || status === "pending" ? status : "all";
      const { items, total } = await genFebStorage.getWithdrawalHistory({ page, limit, status: validStatus });
      return res.status(200).json({ items, total, page, limit });
    } catch (error) {
      console.error("Error listing withdrawal history:", error);
      return res.status(500).json({ message: "Error al listar historial de retiros" });
    }
  });

  /** Estadísticas agregadas para el panel admin (filtro día / semana / mes / año). */
  app.get("/api/admin/dashboard-stats", authenticateJWT, requireFullAdmin, async (req, res) => {
    try {
      const parsed = z
        .enum(["day", "week", "month", "year"])
        .safeParse(typeof req.query.period === "string" ? req.query.period : "week");
      const preset = (parsed.success ? parsed.data : "week") as AdminDashboardStatsPreset;
      const { from, to } = getDashboardStatsRange(preset);
      const stats = await genFebStorage.getAdminDashboardStats({ from, to });
      return res.status(200).json({
        preset,
        range: { from: from.toISOString(), to: to.toISOString() },
        ...stats,
      });
    } catch (error) {
      console.error("Error building admin dashboard stats:", error);
      return res.status(500).json({ message: "Error al cargar estadísticas" });
    }
  });

  // ==================== CATEGORÍAS Y SUBCATEGORÍAS ====================
  const updateCategorySchema = z.object({
    name: z.string().min(1).max(200).optional(),
    slug: z.string().max(200).optional(),
    icon: z.string().max(100).optional(),
  });

  /** Lista completa de categorías (incluye legacy tipo legal/financial en `categories`) para gestión en admin. */
  app.get("/api/admin/categories", authenticateJWT, requireFullAdmin, async (_req, res) => {
    try {
      const categories = await catalogService.getCategories();
      return res.status(200).json(categories ?? []);
    } catch (error) {
      console.error("Error listing admin categories:", error);
      return res.status(500).json({ message: "Error al listar categorías" });
    }
  });

  app.patch("/api/admin/categories/:id", authenticateJWT, requireFullAdmin, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id) || id <= 0) return res.status(400).json({ message: "ID inválido" });
      const parsed = updateCategorySchema.parse(req.body);
      
      const updated = await catalogService.updateCategory(id, parsed as any);
      if (!updated) return res.status(404).json({ message: "Categoría no encontrada" });
      return res.status(200).json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      console.error("Error updating category:", error);
      return res.status(500).json({ message: "Error al actualizar categoría" });
    }
  });

  const createSubcategorySchema = z.object({
    name: z.string().min(1).max(200),
    slug: z.string().min(1).max(200),
    categoryId: z.number().int().positive(),
    categorySlug: z.string().optional(),
    icon: z.string().optional(),
  });

  app.post("/api/admin/subcategories", authenticateJWT, requireFullAdmin, async (req: any, res) => {
    try {
      const parsed = createSubcategorySchema.parse(req.body);
      const created = await catalogService.createSubcategory(parsed);
      return res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      console.error("Error creating subcategory:", error);
      return res.status(500).json({ message: "Error al crear subcategoría" });
    }
  });

  const updateSubcategorySchema = z.object({
    name: z.string().min(1).max(200).optional(),
    slug: z.string().max(200).optional(),
    categoryId: z.number().int().positive().optional(),
    categorySlug: z.string().optional(),
    icon: z.string().optional(),
  });

  app.patch("/api/admin/subcategories/:id", authenticateJWT, requireFullAdmin, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id) || id <= 0) return res.status(400).json({ message: "ID inválido" });
      const parsed = updateSubcategorySchema.parse(req.body);
      
      const updated = await catalogService.updateSubcategory(id, parsed);
      if (!updated) return res.status(404).json({ message: "Subcategoría no encontrada" });
      return res.status(200).json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      console.error("Error updating subcategory:", error);
      return res.status(500).json({ message: "Error al actualizar subcategoría" });
    }
  });

  console.log("✅ Admin routes registered (incl. GET /api/admin/dashboard-stats)");
}
