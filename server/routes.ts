import type { Express } from "express";
import type { Server } from "http";
import { z } from "zod";
import { api } from "@shared/routes";
import { insertProviderSchema, insertServiceSchema } from "@shared/schema";
import { providerCategorySchema, PROVIDER_CATEGORIES } from "@shared/provider-categories";
import { catalogService, bookingService } from "./services";
import { genFebStorage } from "./storage-genfeb";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { registerGenFebRoutes } from "./routes-genfeb";
import { registerAuthRoutes as registerJwtAuthRoutes, authenticateJWT } from "./routes-auth";
import { registerInvoiceRoutes } from "./routes-invoices";
import { registerPayPalRoutes } from "./routes-paypal";
import { registerRoleRoutes } from "./routes-roles";
import { registerAdminRoutes } from "./routes-admin";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Registrar PRIMERO las rutas /api (admin, roles, health) para que tengan prioridad
  // y no sean interceptadas por session/passport ni por Vite
  registerAdminRoutes(app);
  registerRoleRoutes(app);

  // GET /api/me/provider — perfil de proveedor del usuario autenticado (Create Service, Dashboard). Ruta explícita y temprana.
  app.get("/api/me/provider", authenticateJWT, async (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const provider = await catalogService.getProviderByUserId(userId);
    res.json(provider ?? null);
  });

  // Catálogo público: registrar ANTES de GenFeb para que /api/provider-categories/availability y /api/services coincidan
  app.get(api.categories.list.path, async (_req, res) => {
    const categories = await catalogService.getCategories();
    res.json(categories);
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
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const search = (req.query.search as string) || undefined;
    const providerCategoryId = req.query.providerCategoryId ? Number(req.query.providerCategoryId) : undefined;
    const subcategoryId = req.query.subcategoryId ? Number(req.query.subcategoryId) : undefined;
    res.json(await catalogService.getAllServices(categoryId, search, providerCategoryId, subcategoryId));
  });
  app.get(api.services.get.path, async (req, res) => {
    const service = await catalogService.getService(Number(req.params.id));
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json(service);
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
      if (existingForProvider.length >= 1) {
        return res.status(400).json({ message: "Solo puedes tener un servicio. Edítalo desde Mis servicios." });
      }
      const data = createServiceBodySchema.parse(req.body);
      const resolvedCategoryId = data.categoryId ?? (provider as { categoryId?: number }).categoryId;
      if (resolvedCategoryId == null || Number.isNaN(Number(resolvedCategoryId)) || Number(resolvedCategoryId) < 1) {
        return res.status(400).json({ message: "categoryId es requerido (categoría del perfil de proveedor)" });
      }
      const service = await catalogService.createService({
        ...data,
        providerId: provider.id,
        categoryId: Number(resolvedCategoryId),
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
      const isAdmin = req.user?.role === "admin";
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const provider = await catalogService.getProviderByUserId(userId);
      const isOwner = provider && service.providerId === provider.id;
      if (!isOwner && !isAdmin) return res.status(403).json({ message: "Solo el dueño del servicio o un admin puede editarlo" });
      const data = updateServiceBodySchema.parse(req.body);
      const updated = await catalogService.updateService(id, data as any);
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
      const isAdmin = req.user?.role === "admin";
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

  const createProviderBodySchema = insertProviderSchema.extend({
    category: providerCategorySchema.optional(),
    categoryId: z.number().int().positive().optional(),
    subcategoryId: z.number().int().positive().optional().nullable(),
  });
  const updateProviderBodySchema = z.object({
    category: providerCategorySchema.optional(),
    categoryId: z.number().int().positive().optional(),
    profession: z.string().min(1).max(200).optional(),
    bio: z.string().max(2000).optional(),
    yearsExperience: z.number().int().min(0).optional(),
    hourlyRate: z.string().optional(),
  });

  app.post(api.providers.create.path, authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const data = createProviderBodySchema.parse(req.body);
      const existing = await catalogService.getProviderByUserId(userId);
      if (existing) {
        await genFebStorage.updateUser(userId, { role: "professional" } as any);
        return res.status(409).json({ message: "Ya tienes un perfil de proveedor" });
      }
      const provider = await catalogService.createProvider({
        userId,
        categoryId: data.categoryId ?? undefined,
        category: data.category ?? null,
        subcategoryId: data.subcategoryId ?? undefined,
        profession: data.profession,
        bio: data.bio ?? "",
        yearsExperience: data.yearsExperience ?? 0,
        hourlyRate: data.hourlyRate ?? null,
      } as any);
      await genFebStorage.updateUser(userId, { role: "professional" } as any);

      // Un solo servicio por profesional: se crea desde los datos del proveedor (nombre = nombre del profesional, descripción = bio, precio = tarifa).
      const categoryId = (provider as { categoryId?: number }).categoryId;
      if (categoryId != null && !Number.isNaN(Number(categoryId)) && Number(categoryId) >= 1) {
        const user = await genFebStorage.getUserById(userId);
        const u = user as { name?: string; firstName?: string; lastName?: string } | null;
        const serviceTitle =
          (u?.name ?? ([u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() || (provider as { profession?: string }).profession)) ||
          (provider as { profession?: string }).profession;
        await catalogService.createService({
          providerId: provider.id,
          categoryId: Number(categoryId),
          subcategoryId: (provider as { subcategoryId?: number | null }).subcategoryId ?? undefined,
          title: serviceTitle,
          description: (provider as { bio?: string }).bio ?? "",
          price: (provider as { hourlyRate?: string | null }).hourlyRate ?? "0",
          imageUrl: "",
          isActive: true,
        } as any);
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
      const isAdmin = req.user?.role === "admin";
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
      const isAdmin = req.user?.role === "admin";
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

