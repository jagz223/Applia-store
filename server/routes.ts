import type { Express } from "express";
import type { Server } from "http";
import { z } from "zod";
import { hasAdminPrivileges, isFullAdmin } from "@shared/roles";
import { api } from "@shared/routes";
import { insertProviderSchema, insertServiceSchema, professionalBioFieldSchema } from "@shared/schema";
import { providerSkillsSchema } from "@shared/skills-schema";
import { insertProviderVehicleSchema } from "@shared/vehicle-schema";
import { isCarGoProvider } from "@shared/provider-car-go";
import { providerHasGoBrand } from "@shared/provider-go";
import { providerCategorySchema, PROVIDER_CATEGORIES } from "@shared/provider-categories";
import { catalogService, bookingService } from "./services";
import { genFebStorage } from "./storage-genfeb";
import {
  patchProfessionalVerificationImageBody,
  patchProfessionalVerificationCredentialBody,
  patchProfessionalVerificationPaymentBody,
} from "@shared/professional-verification";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { registerGenFebRoutes } from "./routes-genfeb";
import { registerAuthRoutes as registerJwtAuthRoutes, authenticateJWT, optionalAuthenticateJWT } from "./routes-auth";
import { registerInvoiceRoutes } from "./routes-invoices";
import { registerPayPalRoutes } from "./routes-paypal";
import { registerRoleRoutes } from "./routes-roles";
import { registerAdminRoutes } from "./routes-admin";
import { registerMapRoutes } from "./routes-maps";
import { registerMobilityRideRoutes } from "./mobility-rides";
import { registerPackRideRoutes } from "./pack-rides";
import { registerSeoRoutes } from "./seo";
import { getFullAdminUsers } from "./staff-users";
import { getIO, sendNotificationToAdmins } from "./socket";
import { notificationService } from "./services/notification.service";
import { getHiddenCategorySlugsForRole } from "./category-visibility";
import { MOBILITY_GO_PROVIDER_SLUGS, filterCategoriesExcludedFromPublicApi } from "@shared/default-categories";
import { categorySlugFromProvider, getSubscriptionFeesByCategorySlug, subscriptionMonthlyUsdForCategorySlug } from "./subscription-fees";
import {
  validateAssignableServiceCategory,
  providerHasServiceInCategory,
  validateSubcategoryBelongsToCategory,
} from "./service-category-validation";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerSeoRoutes(app);

  // Registrar PRIMERO las rutas /api (admin, roles, health) para que tengan prioridad
  // y no sean interceptadas por session/passport ni por Vite
  registerAdminRoutes(app);
  registerRoleRoutes(app);
  registerMapRoutes(app);
  registerMobilityRideRoutes(app);
  registerPackRideRoutes(app);

  // GET /api/me/provider — perfil de proveedor del usuario autenticado (Create Service, Dashboard). Ruta explícita y temprana.
  app.get("/api/me/provider", authenticateJWT, async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const provider = await catalogService.getProviderByUserId(userId);
    res.json(provider ?? null);
  });

  /** Car Go: tipo de vehículo registrado (icono en mapa conductor). */
  app.get("/api/me/provider-vehicle", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const provider = await catalogService.getProviderByUserId(userId);
      if (!provider) return res.json(null);
      const v = await genFebStorage.getPrimaryVehicleFullByUserId(userId);
      res.json(v ?? null);
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  const enrollGoDriverBodySchema = z.object({
    profession: z.string().trim().min(2).max(200),
    bio: professionalBioFieldSchema,
    serviceTitle: z.string().trim().min(2).max(500),
    serviceDescription: z.string().trim().min(50).max(5000),
    vehicle: z.any().optional(),
  });

  /** Habilita módulos taxi + delivery (Go) y datos de conductor para un proveedor ya existente. */
  app.post("/api/me/go-driver", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const provider = await catalogService.getProviderByUserId(userId);
      if (!provider) {
        return res.status(403).json({ message: "Primero debes tener perfil de asociado." });
      }
      const body = enrollGoDriverBodySchema.parse(req.body);
      const pid = (provider as { id: number }).id;
      const categories = await catalogService.getCategories();
      const existingV = await genFebStorage.getPrimaryVehicleByProviderId(pid);

      if (!existingV) {
        if (body.vehicle == null) {
          return res.status(400).json({ message: "Debes registrar los datos del vehículo para conducir." });
        }
        const parsedVehicle = insertProviderVehicleSchema.safeParse(body.vehicle);
        if (!parsedVehicle.success) {
          return res.status(400).json({
            message: "Datos de vehículo inválidos o incompletos.",
            issues: parsedVehicle.error.flatten(),
          });
        }
        await genFebStorage.createProviderVehicle({
          providerId: pid,
          userId,
          vehicle: parsedVehicle.data,
        });
      }

      const ALLOWED = new Set(["transport", "delivery", "marketplace"]);
      const rawBrands = (provider as { goBrands?: unknown }).goBrands;
      const current = Array.isArray(rawBrands)
        ? rawBrands.map((s: unknown) => String(s).trim().toLowerCase()).filter(Boolean)
        : [];
      const extra: string[] = [];
      const cid = (provider as { categoryId?: number | null }).categoryId;
      if (cid != null && !Number.isNaN(Number(cid))) {
        const row = categories.find((c) => Number(c.id) === Number(cid));
        const sl = String((row as { slug?: string } | undefined)?.slug ?? "")
          .trim()
          .toLowerCase();
        if (sl && ALLOWED.has(sl)) extra.push(sl);
      }
      const direct = String((provider as { category?: string | null }).category ?? "")
        .trim()
        .toLowerCase();
      if (direct && ALLOWED.has(direct)) extra.push(direct);
      const merged = Array.from(new Set([...current, ...extra, "transport", "delivery"])).filter((b) =>
        ALLOWED.has(b)
      );

      await catalogService.updateProvider(pid, {
        goBrands: merged,
        profession: body.profession,
        bio: body.bio,
        goDriverOfferTitle: body.serviceTitle,
        goDriverOfferDescription: body.serviceDescription,
      });

      const hasTransport = providerHasGoBrand({ ...provider, goBrands: merged }, "transport", categories);
      const hasDelivery = providerHasGoBrand({ ...provider, goBrands: merged }, "delivery", categories);
      const vAfter = existingV ?? (await genFebStorage.getPrimaryVehicleByProviderId(pid));

      return res.json({
        ok: true,
        goBrands: merged,
        hasPrimaryVehicle: !!vAfter,
        hasTransport,
        hasDelivery,
      });
    } catch (e: any) {
      if (e?.name === "ZodError") {
        return res.status(400).json({ message: "Datos inválidos", errors: e.errors });
      }
      return res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  // ============ Verificación de profesionales (1 doc por userId) ============

  app.get("/api/me/professional-verification", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const provider = await catalogService.getProviderByUserId(userId);
      if (!provider) return res.status(403).json({ message: "Solo para cuentas de profesional" });

      const rawUser = await genFebStorage.getUserById(userId);
      const rawIdent = (rawUser as any)?.user_identification ?? null;
      let imageUrl: string | null = null;
      if (typeof rawIdent === "string") {
        imageUrl = rawIdent.trim() || null;
      } else if (rawIdent && typeof rawIdent === "object" && typeof (rawIdent as any).imageUrl === "string") {
        imageUrl = String((rawIdent as any).imageUrl).trim() || null;
      }

      const doc = await genFebStorage.getProfessionalVerificationByUserId(userId);
      res.json({
        userId,
        imageUrl,
        imageVerified: doc?.imageVerified === true,
        professionalCredentialUrl: doc?.professionalCredentialUrl ?? null,
        transferReceiptCode: doc?.transferReceiptCode ?? null,
        transferDate: doc?.transferDate ?? null,
        createdAt: doc?.createdAt ?? undefined,
        updatedAt: doc?.updatedAt ?? undefined,
      });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Error" });
    }
  });

  // =================== verifying_status (para UI de pasos) ===================
  app.get("/api/me/verifying-status", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const provider = await catalogService.getProviderByUserId(userId);
      if (!provider) return res.status(403).json({ message: "Solo para cuentas de profesional" });

      const st = await genFebStorage.getVerifyingStatusByUserId(userId);
      if (!st) {
        return res.json({
          user: userId,
          requestType: null,
          identification_verified: "rejected",
          transacction_date: null,
          transacction_verified: null,
        });
      }

      return res.json({
        user: st.user ?? userId,
        requestType: (st as any)?.requestType ?? null,
        identification_verified: st.identification_verified,
        transacction_date: st.transacction_date ?? null,
        transacction_verified: st.transacction_verified,
      });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Error" });
    }
  });

  app.patch("/api/me/professional-verification/image", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const provider = await catalogService.getProviderByUserId(userId);
      if (!provider) return res.status(403).json({ message: "Solo para cuentas de profesional" });

      const st = await genFebStorage.getVerifyingStatusByUserId(userId);
      // Solo bloqueamos si el admin ya aprobó la identificación. En "pending" o "rejected"
      // el usuario puede volver a enviar y se fusionan los datos nuevos.
      if (st?.identification_verified === "verified") {
        return res.status(409).json({ message: "La identificación ya fue verificada" });
      }

      const body = patchProfessionalVerificationImageBody.parse(req.body);

      await genFebStorage.updateUser(userId, {
        user_identification: body.imageUrl,
      } as any);

      // También guardamos el imageUrl en el documento de verificación para que el paso de pago
      // pueda validar que primero existe el documento.
      await genFebStorage.upsertProfessionalVerificationImage(userId, body.imageUrl);

      // Cambiar estado en verifying_status → identification_verified = pending
      await genFebStorage.upsertVerifyingStatusIdentificationPending(userId, "onboarding" as any);

      // Notificación a admins solo cuando el onboarding está completo (identificación + documento + pago),
      // ver `PATCH .../payment` y listado `/api/admin/verifying-status/pending`.

      const doc = await genFebStorage.getProfessionalVerificationByUserId(userId);
      res.json({
        userId,
        imageUrl: body.imageUrl,
        imageVerified: doc?.imageVerified === true,
        transferReceiptCode: doc?.transferReceiptCode ?? null,
        transferDate: doc?.transferDate ?? null,
        createdAt: doc?.createdAt ?? undefined,
        updatedAt: new Date(),
      });
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ message: "Datos inválidos", errors: e.errors });
      const msg = e?.message || "Error al guardar";
      const status = String(msg).includes("revisión") ? 409 : 400;
      res.status(status).json({ message: msg });
    }
  });

  app.patch("/api/me/professional-verification/credential", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const provider = await catalogService.getProviderByUserId(userId);
      if (!provider) return res.status(403).json({ message: "Solo para cuentas de profesional" });

      const parsed = patchProfessionalVerificationCredentialBody.parse(req.body);
      const updated = await genFebStorage.upsertProfessionalVerificationCredential(userId, parsed.professionalCredentialUrl);

      // Guardar también en Mis documentos (bóveda). Esto permite verlo siempre aunque haya subido más tarde.
      try {
        const categories = await catalogService.getCategories();
        const carGo = isCarGoProvider(provider as any, categories);
        const name =
          parsed.name?.trim() || (carGo ? "Licencia de conducir" : "Documento profesional");
        await genFebStorage.createDocument({
          userId,
          name,
          type: "professional_credential",
          encryptedPath: parsed.professionalCredentialUrl,
          size: typeof parsed.size === "number" ? parsed.size : undefined,
          mimeType: parsed.mimeType,
          status: "verified",
        } as any);
      } catch (e) {
        console.error("Error guardando documento profesional en bóveda:", e);
      }

      return res.json({
        userId,
        professionalCredentialUrl: updated?.professionalCredentialUrl ?? null,
        imageUrl: updated?.imageUrl ?? null,
        imageVerified: updated?.imageVerified === true,
        transferReceiptCode: updated?.transferReceiptCode ?? null,
        transferDate: updated?.transferDate ?? null,
        createdAt: updated?.createdAt ?? undefined,
        updatedAt: updated?.updatedAt ?? undefined,
      });
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ message: "Datos inválidos", errors: e.errors });
      res.status(400).json({ message: e?.message || "Error al guardar" });
    }
  });

  app.patch("/api/me/professional-verification/payment", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const provider = await catalogService.getProviderByUserId(userId);
      if (!provider) return res.status(403).json({ message: "Solo para cuentas de profesional" });

      const st = await genFebStorage.getVerifyingStatusByUserId(userId);
      if (st?.transacction_verified === "pending") {
        return res.status(409).json({ message: "Ya hay un comprobante de pago en revisión. Espera la validación del equipo." });
      }

      const profBeforePayment = await genFebStorage.getProfessionalVerificationByUserId(userId);
      if (!(provider as { isVerified?: boolean }).isVerified) {
        const img = typeof profBeforePayment?.imageUrl === "string" ? profBeforePayment.imageUrl.trim() : "";
        const cred =
          typeof profBeforePayment?.professionalCredentialUrl === "string"
            ? profBeforePayment.professionalCredentialUrl.trim()
            : "";
        if (!img || !cred) {
          return res.status(400).json({
            message:
              "Debés subir tu identificación y tu documento profesional (o licencia de conducir) antes de registrar el pago.",
          });
        }
      }

      const body = patchProfessionalVerificationPaymentBody.parse(req.body);
      const feesBySlug = await getSubscriptionFeesByCategorySlug();
      const catSlug = categorySlugFromProvider(provider as any, []);
      const monthlyUsd = subscriptionMonthlyUsdForCategorySlug(feesBySlug, catSlug);
      const updated = await genFebStorage.upsertProfessionalVerificationPayment(userId, {
        transferReceiptCode: body.transferReceiptCode,
        transferDate: body.transferDate,
        subscriptionMonths: body.subscriptionMonths,
        subscriptionMonthlyUsd: monthlyUsd,
      });

      // Cambiar estado en verifying_status → transacction_date = body.transferDate y transacction_verified = pending
      const requestType =
        (provider as any)?.isVerified === true ? ("renewal" as const) : ("onboarding" as const);
      await genFebStorage.upsertVerifyingStatusTransactionPending(userId, body.transferDate, requestType as any);

      // Un solo cargo pendiente por usuario: evita duplicados si reenvía comprobante.
      try {
        const reports = await genFebStorage.getFinancialReports(userId);
        const hasPendingVerification = reports.some(
          (r: { type?: string; status?: string }) => r.type === "verification_fee" && r.status === "pending",
        );
        if (!hasPendingVerification) {
          const months =
            Math.max(1, Math.min(12, Math.trunc(body.subscriptionMonths)));
          const amountUsd = (monthlyUsd * months).toFixed(2);
          await genFebStorage.createFinancialReport({
            userId,
            type: "verification_fee",
            amount: amountUsd,
            currency: "USD",
            status: "pending",
            description: `Pago por suscripción de visibilidad (${months} mes(es)) (Comprobante: ${body.transferReceiptCode})`,
            createdAt: new Date(),
          });
        }
      } catch (err) {
        console.error("Error creando reporte financiero para verificación:", err);
      }

      // --- Notificar a administradores ---
      try {
        const admins = await getFullAdminUsers(genFebStorage);
        const user = (await genFebStorage.getUserById(userId)) as any;
        const name = user ? ([user.firstName, user.lastName].filter(Boolean).join(" ").trim() || (user as any).name || (user as any).email || userId) : userId;
        const msg = `El usuario ${name} completó documentación y comprobante de pago (alta como asociado). Revisá la solicitud en el panel.`;
        const urlAdmin = "/admin?tab=overview";

        for (const admin of admins) {
          const adminId = String(admin.id);
          // 1. Notificación persistente
          await genFebStorage.createNotification({
            userId: adminId,
            type: "admin_verification_request",
            data: { userId, name, message: msg, url: urlAdmin, step: "payment" }
          });
          // 2. Notificación Push
          void notificationService.sendPushToUser(adminId, {
            title: "Comprobante de pago recibido",
            body: msg,
            data: { url: urlAdmin, type: "admin_verification_request", userId }
          }).catch(err => console.error("[push-admin] Error:", err));
        }

        // 3. Notificación Real-time (Socket)
        const io = getIO();
        if (io) {
          sendNotificationToAdmins(io, {
            type: "admin_verification_request",
            data: { userId, name, message: msg, url: urlAdmin, step: "payment" }
          });
        }
      } catch (err) {
        console.error("Error notificando a admins (pay):", err);
      }
      // ------------------------------------

      res.json(updated);
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ message: "Datos inválidos", errors: e.errors });
      const msg = e?.message || "Error al guardar";
      const status = String(msg).includes("revisión") ? 409 : 400;
      res.status(status).json({ message: msg });
    }
  });

  // Catálogo público: registrar ANTES de GenFeb para que /api/provider-categories/availability y /api/services coincidan
  app.get(api.categories.list.path, async (_req, res) => {
    const categories = await catalogService.getCategoriesForPublicCatalog();
    res.json(filterCategoriesExcludedFromPublicApi(categories));
  });
  app.get("/api/subcategories", async (req, res) => {
    const categoryId = req.query.categoryId != null ? Number(req.query.categoryId) : undefined;
    if (categoryId == null || Number.isNaN(categoryId)) {
      return res.json([]);
    }
    const list = await catalogService.getSubcategories(categoryId);
    res.json(list);
  });
  app.get("/api/provider-categories", (_req, res) => res.json(PROVIDER_CATEGORIES));
  app.get("/api/provider-categories/availability", async (_req, res) => {
    res.json(await catalogService.getProviderCategoryAvailability());
  });
  // Visibilidad de marcas en UI: lectura pública; JWT opcional para aplicar reglas por rol.
  app.get("/api/platform/category-visibility", optionalAuthenticateJWT, async (req: any, res) => {
    const role = req.user?.role as string | undefined;
    res.json({ hiddenSlugs: await getHiddenCategorySlugsForRole(role) });
  });
  app.get(api.categories.homeAssociateCounts.path, async (_req, res) => {
    res.json(await catalogService.getHomeCategoryAssociateCounts());
  });
  app.post(api.categories.monthlyPopularSubcategories.path, async (req, res) => {
    const parsed = api.categories.monthlyPopularSubcategories.input.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
    }
    res.json(await catalogService.getMonthlyPopularSubcategoryBookingCountsForHome(parsed.data.limit));
  });
  app.get(api.providers.list.path, async (req, res) => {
    const profession = (req.query.profession as string)?.trim() || undefined;
    const category = (req.query.category as string)?.trim() || undefined;
    res.json(await catalogService.getAllProviders(profession, category));
  });
  app.get(api.providers.get.path, async (req, res) => {
    const provider = await catalogService.getProvider(Number(req.params.id));
    if (!provider) return res.status(404).json({ message: "Provider not found" });
    res.json(provider);
  });
  app.get(api.services.list.path, async (req, res) => {
    const categoryIdRaw = req.query.categoryId != null ? Number(req.query.categoryId) : undefined;
    const search = (req.query.search as string) || undefined;
    const providerCategoryIdRaw =
      req.query.providerCategoryId != null ? Number(req.query.providerCategoryId) : undefined;
    const subcategoryId = req.query.subcategoryId ? Number(req.query.subcategoryId) : undefined;

    const categoryId =
      categoryIdRaw != null && !Number.isNaN(categoryIdRaw) ? categoryIdRaw : undefined;
    const providerCategoryId =
      providerCategoryIdRaw != null && !Number.isNaN(providerCategoryIdRaw) ? providerCategoryIdRaw : undefined;

    let list = await catalogService.getAllServices(categoryId, search, providerCategoryId, subcategoryId);

    /** Vista general (Explorar “Todos”, sin categoría explícita): no mezclar conductores/comercios/delivery Go. */
    const isGeneralCatalogExplore = categoryId == null && providerCategoryId == null;
    if (isGeneralCatalogExplore && list?.length) {
      const mobilitySlugs = new Set(MOBILITY_GO_PROVIDER_SLUGS.map((s) => String(s).toLowerCase()));
      const cats = await catalogService.getCategoriesForPublicCatalog();
      list = list.filter((s: any) => {
        const p = s?.provider as { category?: string; categoryId?: number } | undefined;
        if (!p) return true;
        const fromField =
          typeof p.category === "string" ? p.category.trim().toLowerCase() : "";
        if (mobilitySlugs.has(fromField)) return false;
        if (p.categoryId != null && !Number.isNaN(Number(p.categoryId))) {
          const cat = cats.find((c: { id?: number }) => Number(c.id) === Number(p.categoryId));
          const slug = (cat as { slug?: string } | undefined)?.slug;
          const sl = slug != null ? String(slug).trim().toLowerCase() : "";
          if (mobilitySlugs.has(sl)) return false;
        }
        return true;
      });
    }

    // Catálogo público: no exponer servicios desactivados.
    res.json((list ?? []).filter((s: any) => s?.isActive !== false));
  });
  app.get(api.services.get.path, async (req, res) => {
    const service = await catalogService.getService(Number(req.params.id));
    if (!service || (service as any)?.isActive === false) return res.status(404).json({ message: "Service not found" });
    res.json(service);
  });

  // GET /api/providers/:providerId/completed-count - Cantidad de servicios completados por un proveedor
  // (usado para mostrar prueba social en listas públicas)
  app.get("/api/providers/:providerId/completed-count", async (req: any, res: any) => {
    try {
      const providerIdRaw = req.params.providerId;
      const providerId = Number(providerIdRaw);
      if (!Number.isFinite(providerId) || providerId <= 0) {
        return res.status(400).json({ message: "providerId inválido" });
      }
      const bookings = await genFebStorage.getBookingsByProvider(providerId);
      const completedCount = (bookings ?? []).filter((b: any) => b?.status === "completed").length;
      res.json({ providerId, completedCount });
    } catch (error) {
      console.error("Error fetching provider completed count:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/me/services", authenticateJWT, async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const provider = await catalogService.getProviderByUserId(userId);
    if (!provider) return res.json([]);
    const all = await catalogService.getAllServices();
    const mine = all.filter((s: { providerId: number }) => s.providerId === provider.id);
    res.json(mine);
  });

  const createServiceBodySchema = insertServiceSchema.extend({
    subcategoryId: z.number().int().positive().optional().nullable(),
  });
  const updateServiceBodySchema = z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    price: z.string().optional(),
    imageUrl: z.string().url().optional().or(z.literal("")),
    isActive: z.boolean().optional(),
    categoryId: z.number().int().positive().optional(),
    subcategoryId: z.number().int().positive().optional().nullable(),
  });

  app.post(api.services.create.path, authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const provider = await catalogService.getProviderByUserId(userId);
      if (!provider) return res.status(403).json({ message: "Solo proveedores pueden crear servicios" });
      const allServices = await catalogService.getAllServices();
      const existingForProvider = allServices.filter((s: { providerId: number }) => s.providerId === provider.id);
      const data = createServiceBodySchema.parse(req.body);
      const categories = await catalogService.getCategories();
      const resolvedCategoryId = Number(
        data.categoryId ?? (provider as { categoryId?: number }).categoryId ?? 0
      );
      if (!Number.isFinite(resolvedCategoryId) || resolvedCategoryId < 1) {
        return res.status(400).json({ message: "Selecciona una categoría válida para el servicio." });
      }
      const chosenCategory = categories.find((c) => c.id === resolvedCategoryId);
      const catCheck = validateAssignableServiceCategory(chosenCategory);
      if (!catCheck.ok) return res.status(400).json({ message: catCheck.message });
      if (
        providerHasServiceInCategory(
          existingForProvider.map((s: { id: number; categoryId: number }) => ({ id: s.id, categoryId: s.categoryId })),
          resolvedCategoryId
        )
      ) {
        return res.status(400).json({
          message: "Ya tienes un servicio en esa categoría. Elige otra categoría o edita el servicio existente.",
        });
      }
      const subCheck = await validateSubcategoryBelongsToCategory(
        catalogService,
        data.subcategoryId,
        resolvedCategoryId
      );
      if (!subCheck.ok) return res.status(400).json({ message: subCheck.message });

      const service = await catalogService.createService({
        ...data,
        providerId: provider.id,
        categoryId: resolvedCategoryId,
        title: data.title,
        description: data.description ?? "",
        price: data.price ?? "0",
        imageUrl: data.imageUrl ?? "",
        isActive: data.isActive ?? true,
        subcategoryId: data.subcategoryId ?? undefined,
      } as any);
      return res.status(201).json(service);
    } catch (e: any) {
      if (e.name === "ZodError") return res.status(400).json({ message: "Datos inválidos", errors: e.errors });
      throw e;
    }
  });

  app.patch("/api/services/:id", authenticateJWT, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "ID inválido" });
      const service = await catalogService.getService(id);
      if (!service) return res.status(404).json({ message: "Service not found" });
      const userId = req.user?.id;
      const isAdmin = hasAdminPrivileges(req.user?.role);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const provider = await catalogService.getProviderByUserId(userId);
      const isOwner = provider && service.providerId === provider.id;
      if (!isOwner && !isAdmin) return res.status(403).json({ message: "Solo el dueño del servicio o un admin puede editarlo" });
      const data = updateServiceBodySchema.parse(req.body);

      const prevCategoryId = Number((service as { categoryId: number }).categoryId);
      const categoryIsChanging =
        data.categoryId !== undefined && Number(data.categoryId) !== prevCategoryId;
      const nextCategoryId =
        data.categoryId !== undefined ? Number(data.categoryId) : prevCategoryId;

      let nextSubcategoryId: number | null | undefined;
      if (data.subcategoryId !== undefined) {
        nextSubcategoryId = data.subcategoryId;
      } else if (categoryIsChanging) {
        nextSubcategoryId = null;
      } else {
        nextSubcategoryId = (service as { subcategoryId?: number | null }).subcategoryId ?? null;
      }

      if (data.categoryId !== undefined) {
        const categories = await catalogService.getCategories();
        const chosen = categories.find((c) => c.id === nextCategoryId);
        const catCheck = validateAssignableServiceCategory(chosen);
        if (!catCheck.ok) return res.status(400).json({ message: catCheck.message });
        const allServices = await catalogService.getAllServices();
        const mine = allServices.filter((s: { providerId: number }) => s.providerId === service.providerId);
        if (
          providerHasServiceInCategory(
            mine.map((s: { id: number; categoryId: number }) => ({ id: s.id, categoryId: s.categoryId })),
            nextCategoryId,
            id
          )
        ) {
          return res.status(400).json({
            message: "Ya tienes otro servicio en esa categoría.",
          });
        }
      }

      const subCheck = await validateSubcategoryBelongsToCategory(
        catalogService,
        nextSubcategoryId,
        nextCategoryId
      );
      if (!subCheck.ok) return res.status(400).json({ message: subCheck.message });

      const updatePayload = {
        ...data,
        ...(data.categoryId !== undefined ? { categoryId: nextCategoryId } : {}),
        ...(data.subcategoryId !== undefined || categoryIsChanging
          ? { subcategoryId: nextSubcategoryId ?? null }
          : {}),
        lastEditedAt: new Date(),
      };
      const updated = await catalogService.updateService(id, updatePayload as any);
      if (!updated) return res.status(404).json({ message: "Service not found" });
      return res.json(updated);
    } catch (e: any) {
      if (e.name === "ZodError") return res.status(400).json({ message: "Datos inválidos", errors: e.errors });
      throw e;
    }
  });

  app.delete("/api/services/:id", authenticateJWT, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "ID inválido" });
      const service = await catalogService.getService(id);
      if (!service) return res.status(404).json({ message: "Service not found" });
      const userId = req.user?.id;
      const isAdmin = hasAdminPrivileges(req.user?.role);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const provider = await catalogService.getProviderByUserId(userId);
      const isOwner = provider && service.providerId === provider.id;
      if (!isOwner && !isAdmin) return res.status(403).json({ message: "Solo el dueño del servicio o un admin puede eliminarlo" });
      const ok = await catalogService.deleteService(id);
      if (!ok) return res.status(404).json({ message: "Service not found" });
      return res.status(204).send();
    } catch (e: any) {
      throw e;
    }
  });

  await setupAuth(app);
  registerAuthRoutes(app);
  await registerGenFebRoutes(httpServer, app);
  
  // Registrar rutas de autenticación JWT
  await registerJwtAuthRoutes(httpServer, app);
  
  // Registrar rutas de facturas
  await registerInvoiceRoutes(httpServer, app);
  
  // Registrar rutas de PayPal
  await registerPayPalRoutes(httpServer, app);

  /** Registro Car Go (`transport`): el formulario no pide perfil/servicio; pueden ir vacíos (se derivan o se editan después). */
  const createProviderBodySchemaCarGo = insertProviderSchema
    .extend({
      category: providerCategorySchema.optional(),
      categoryId: z.number().int().positive().optional(),
      subcategoryId: z.number().int().positive().optional().nullable(),
    })
    .extend({
      bio: z.string().trim().max(700),
      skills: providerSkillsSchema,
      /** Módulos Go extra habilitados (Pack/Shop). */
      goBrands: z.array(z.enum(["transport", "delivery", "marketplace"])).optional(),
      serviceTitle: z.string().trim().max(500).optional(),
      serviceDescription: z.string().trim().max(5000).optional(),
      vehicle: z.any().optional(),
      profession: z.string().max(300),
      hourlyRate: z.preprocess(
        (v) => (v === "" || v === null || v === undefined ? undefined : v),
        z.union([z.string(), z.number()]).optional().nullable()
      ),
      coursesCompleted: z.string().trim().max(8000).optional(),
      /** Alias preferido de `coursesCompleted` (nivel de preparación). */
      preparationLevel: z.string().trim().max(8000).optional(),
      certifications: z.string().trim().max(8000).optional(),
    });

  const createProviderBodySchemaStrict = insertProviderSchema
    .extend({
      category: providerCategorySchema.optional(),
      categoryId: z.number().int().positive().optional(),
      subcategoryId: z.number().int().positive().optional().nullable(),
    })
    .extend({
      bio: professionalBioFieldSchema,
      skills: providerSkillsSchema,
      goBrands: z.array(z.enum(["transport", "delivery", "marketplace"])).optional(),
      /** Título público del único servicio (listado / edición). Si no se envía, se deriva de profesión o nombre. */
      serviceTitle: z.string().trim().max(500).optional(),
      /** Qué incluye la oferta; si no se envía o va vacío, se usa la biografía como texto inicial del servicio. */
      serviceDescription: z.string().trim().max(5000).optional(),
      /** Solo categoría Car Go (`transport`): datos del vehículo; validación adicional en el handler. */
      vehicle: z.any().optional(),
      /** Fix Go / Man Go: texto libre guardado en el perfil (Firestore). */
      coursesCompleted: z.string().trim().max(8000).optional(),
      /** Alias preferido de `coursesCompleted` (nivel de preparación). */
      preparationLevel: z.string().trim().max(8000).optional(),
      certifications: z.string().trim().max(8000).optional(),
    });
  const updateProviderBodySchema = z.object({
    category: providerCategorySchema.optional(),
    categoryId: z.number().int().positive().optional(),
    profession: z.string().min(1).max(200).optional(),
    bio: professionalBioFieldSchema.optional(),
    yearsExperience: z.number().int().min(0).optional(),
    hourlyRate: z.string().optional(),
    skills: providerSkillsSchema.optional(),
    preparationLevel: z.string().trim().max(8000).optional(),
    coursesCompleted: z.string().trim().max(8000).optional(),
    certifications: z.string().trim().max(8000).optional(),
    goBrands: z.array(z.enum(["transport", "delivery", "marketplace"])).optional(),
  });

  app.post(api.providers.create.path, authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const allCatsForSignup = await catalogService.getCategories();
      const preCategoryId = Number(req.body?.categoryId);
      const preCat = Number.isFinite(preCategoryId)
        ? allCatsForSignup.find((c) => c.id === preCategoryId)
        : undefined;
      const isGoDriverSignup = preCat?.slug === "transport" || preCat?.slug === "delivery";
      const data = (isGoDriverSignup ? createProviderBodySchemaCarGo : createProviderBodySchemaStrict).parse(req.body);
      const {
        serviceTitle: serviceTitleFromClient,
        serviceDescription: serviceDescriptionFromClient,
        vehicle: vehicleFromBody,
        goBrands,
        coursesCompleted: coursesCompletedRaw,
        preparationLevel: preparationLevelRaw,
        certifications: certificationsRaw,
        ...providerInsert
      } = data;

      // Validar vehículo ANTES de crear provider para evitar dejar registros creados si el vehículo falla.
      const catForSignup = allCatsForSignup.find((c) => c.id === Number(providerInsert.categoryId ?? preCategoryId));
      const isGoDriverCategory = catForSignup?.slug === "transport" || catForSignup?.slug === "delivery";
      let parsedVehicle: ReturnType<typeof insertProviderVehicleSchema.safeParse> | null = null;
      if (vehicleFromBody != null && !isGoDriverCategory) {
        return res.status(400).json({ message: "Los datos de vehículo solo aplican a Taxi y Delivery." });
      }
      if (isGoDriverCategory) {
        parsedVehicle = insertProviderVehicleSchema.safeParse(vehicleFromBody);
        if (!parsedVehicle.success) {
          return res.status(400).json({
            message: "Datos de vehículo inválidos o incompletos.",
            issues: parsedVehicle.error.flatten(),
          });
        }
      }
      const dbUser = await genFebStorage.getUserById(userId);
      const effectiveRole = (dbUser as { role?: string } | undefined)?.role ?? req.user?.role;
      /** Admin o Soporte TI: no degradar a professional; misma regla que requireStaffFromDb (BD primero). */
      const keepStaffRole = hasAdminPrivileges(effectiveRole);
      const existing = await catalogService.getProviderByUserId(userId);
      if (existing) {
        // No degradar staff a professional si ya tenía proveedor (409).
        if (!keepStaffRole) {
          await genFebStorage.updateUser(userId, {
            role: "professional",
            acceptedProviderTermsOfUse: false,
          } as any);
        }
        return res.status(409).json({ message: "Ya tienes un perfil de proveedor" });
      }
      const coursesCompleted =
        typeof coursesCompletedRaw === "string" && coursesCompletedRaw.trim() !== "" ? coursesCompletedRaw.trim() : undefined;
      const preparationLevelFromBody =
        typeof preparationLevelRaw === "string" && preparationLevelRaw.trim() !== "" ? preparationLevelRaw.trim() : undefined;
      const preparationMerged = preparationLevelFromBody ?? coursesCompleted;
      const certifications =
        typeof certificationsRaw === "string" && certificationsRaw.trim() !== "" ? certificationsRaw.trim() : undefined;

      const provider = await catalogService.createProvider({
        userId,
        categoryId: providerInsert.categoryId ?? undefined,
        category: providerInsert.category ?? null,
        subcategoryId: providerInsert.subcategoryId ?? undefined,
        ...(isGoDriverCategory
          ? {
              goBrands: Array.isArray(goBrands)
                ? Array.from(new Set(goBrands))
                : catForSignup?.slug === "delivery"
                  ? ["delivery"]
                  : ["transport"],
            }
          : {}),
        profession: providerInsert.profession,
        bio: providerInsert.bio ?? "",
        yearsExperience: providerInsert.yearsExperience ?? 0,
        hourlyRate: providerInsert.hourlyRate ?? null,
        skills: providerInsert.skills ?? [],
        ...(preparationMerged != null
          ? { preparationLevel: preparationMerged, coursesCompleted: preparationMerged }
          : {}),
        ...(certifications != null ? { certifications } : {}),
      } as any);
      if (keepStaffRole) {
        // Solo administrador pleno: verificado en catálogo sin flujo de verificación de plataforma.
        if (isFullAdmin(effectiveRole)) {
          await catalogService.updateProvider((provider as { id: number }).id, { isVerified: true } as any);
        }
      } else {
        await genFebStorage.updateUser(userId, {
          role: "professional",
          acceptedProviderTermsOfUse: false,
        } as any);
      }

      // Un solo servicio por profesional: título = nombre explícito del servicio, o profesión, o nombre del usuario.
      const categoryId = (provider as { categoryId?: number }).categoryId;
      if (categoryId != null && !Number.isNaN(Number(categoryId)) && Number(categoryId) >= 1) {
        const user = await genFebStorage.getUserById(userId);
        const u = user as { name?: string; firstName?: string; lastName?: string } | null;
        const fullName =
          (typeof u?.name === "string" && u.name.trim()) ||
          [u?.firstName, u?.lastName]
            .filter((x) => x != null && String(x).trim() !== "")
            .map((x) => String(x).trim())
            .join(" ") ||
          "";
        const prof = String((provider as { profession?: string }).profession ?? "").trim();
        const explicit = typeof serviceTitleFromClient === "string" ? serviceTitleFromClient.trim() : "";
        const serviceTitle =
          explicit.length >= 2 ? explicit : prof || fullName || "Servicio";
        const descExplicit =
          typeof serviceDescriptionFromClient === "string" ? serviceDescriptionFromClient.trim() : "";
        const serviceDescriptionText =
          descExplicit.length > 0 ? descExplicit : String((provider as { bio?: string }).bio ?? "");
        await catalogService.createService({
          providerId: provider.id,
          categoryId: Number(categoryId),
          subcategoryId: (provider as { subcategoryId?: number | null }).subcategoryId ?? undefined,
          title: serviceTitle,
          description: serviceDescriptionText,
          price: (provider as { hourlyRate?: string | null }).hourlyRate ?? "0",
          imageUrl: "",
          isActive: true,
        } as any);
      }

      if (parsedVehicle?.success) {
        await genFebStorage.createProviderVehicle({
          providerId: (provider as { id: number }).id,
          userId,
          vehicle: parsedVehicle.data,
        });
      }

      return res.status(201).json(provider);
    } catch (e: any) {
      if (e.name === "ZodError") return res.status(400).json({ message: "Datos inválidos", errors: e.errors });
      throw e;
    }
  });

  app.patch("/api/providers/:id", authenticateJWT, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "ID inválido" });
      const provider = await catalogService.getProvider(id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const userId = req.user?.id;
      const isAdmin = hasAdminPrivileges(req.user?.role);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      if ((provider as any).userId !== userId && !isAdmin) return res.status(403).json({ message: "Solo el dueño o un admin puede editar este proveedor" });
      const data = updateProviderBodySchema.parse(req.body);
      const updated = await catalogService.updateProvider(id, data as any);
      if (!updated) return res.status(404).json({ message: "Provider not found" });
      return res.json(updated);
    } catch (e: any) {
      if (e.name === "ZodError") return res.status(400).json({ message: "Datos inválidos", errors: e.errors });
      throw e;
    }
  });

  app.delete("/api/providers/:id", authenticateJWT, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "ID inválido" });
      const provider = await catalogService.getProvider(id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const userId = req.user?.id;
      const isAdmin = hasAdminPrivileges(req.user?.role);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      if ((provider as any).userId !== userId && !isAdmin) return res.status(403).json({ message: "Solo el dueño o un admin puede eliminar este proveedor" });
      const ok = await catalogService.deleteProvider(id);
      if (!ok) return res.status(404).json({ message: "Provider not found" });
      return res.status(204).send();
    } catch (e: any) {
      throw e;
    }
  });

  /**
   * Reservas:
   * - PATCH /api/bookings/:id/status → actualiza estado (solo el proveedor de la reserva)
   */
  app.patch(api.bookings.updateStatus.path, authenticateJWT, async (req: any, res: any) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const provider = await catalogService.getProviderByUserId(userId);
    if (!provider) return res.status(403).json({ message: "Only providers can update status" });

    const bookingId = Number(req.params.id);
    const booking = await bookingService.getBooking(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const service = await catalogService.getService(booking.serviceId);
    if (!service) return res.status(404).json({ message: "Service not found" });

    if (service.providerId !== provider.id) {
      return res.status(403).json({ message: "You are not authorized to update this booking" });
    }

    const updatedBooking = await bookingService.updateBookingStatus(bookingId, req.body.status);
    if (!updatedBooking) return res.status(404).json({ message: "Booking not found" });
    res.json(updatedBooking);
  });

  /**
   * PATCH /api/bookings/:id/schedule → actualizar fecha/hora de la reserva (GenFeb, solo profesional y pending)
   */
  app.patch("/api/bookings/:id/schedule", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const bookingId = Number(req.params.id);
      if (!Number.isFinite(bookingId)) return res.status(400).json({ message: "ID de reserva inválido" });
      const body = z.object({ date: z.string().min(1, "La fecha es requerida") }).parse(req.body);
      const date = new Date(body.date);
      if (Number.isNaN(date.getTime())) return res.status(400).json({ message: "Fecha u hora inválida" });
      const booking = await genFebStorage.getBooking(bookingId);
      if (!booking) return res.status(404).json({ message: "Reserva no encontrada" });
      const provider = await catalogService.getProviderByUserId(userId);
      if (!provider) return res.status(403).json({ message: "No eres proveedor de esta reserva" });
      const bid = booking as { providerId?: number; status?: string };
      if (bid.providerId !== (provider as { id: number }).id) return res.status(403).json({ message: "No puedes editar esta reserva" });
      if ((bid.status || "pending") !== "pending") {
        return res.status(403).json({ message: "Solo puedes cambiar la fecha cuando la reserva está pendiente" });
      }
      const updated = await genFebStorage.updateBookingSchedule(bookingId, date);
      if (!updated) return res.status(500).json({ message: "Error al actualizar la fecha" });
      return res.json(updated);
    } catch (e: any) {
      if (e.name === "ZodError") return res.status(400).json({ message: "Datos inválidos", errors: e.errors });
      throw e;
    }
  });

  /** Semillas iniciales de categorías (idempotente) */
  await catalogService.seedCategories();

  return httpServer;
}

