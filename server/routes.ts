import type { Express } from "express";
import type { Server } from "http";
import { api } from "@shared/routes";
import { catalogService, bookingService } from "./services";
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

  /**
   * Registro de middleware y rutas de autenticación.
   * Si REPL_ID no está definido, las rutas de login/callback responden 501.
   */
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Registrar rutas de GenFeb S.A.S.
  await registerGenFebRoutes(httpServer, app);
  
  // Registrar rutas de autenticación JWT
  await registerJwtAuthRoutes(httpServer, app);
  
  // Registrar rutas de facturas
  await registerInvoiceRoutes(httpServer, app);
  
  // Registrar rutas de PayPal
  await registerPayPalRoutes(httpServer, app);

  /** Categorías: listado público (unificado con genFebStorage vía CatalogService) */
  app.get(api.categories.list.path, async (_req, res) => {
    const categories = await catalogService.getCategories();
    res.json(categories);
  });

  /**
   * Proveedores:
   * - GET /api/providers?profession=... → filtro opcional por profesión
   * - GET /api/providers/:id → detalle por id
   */
  app.get(api.providers.list.path, async (req, res) => {
    const profession = req.query.profession as string | undefined;
    const providers = await catalogService.getAllProviders(profession);
    res.json(providers);
  });

  app.get(api.providers.get.path, async (req, res) => {
    const provider = await catalogService.getProvider(Number(req.params.id));
    if (!provider) return res.status(404).json({ message: "Provider not found" });
    res.json(provider);
  });

  /**
   * Servicios:
   * - GET /api/services?categoryId&search → listado con filtros
   * - GET /api/services/:id → detalle con proveedor y categoría
   */
  app.get(api.services.list.path, async (req, res) => {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const search = req.query.search as string | undefined;
    const services = await catalogService.getAllServices(categoryId, search);
    res.json(services);
  });

  app.get(api.services.get.path, async (req, res) => {
    const service = await catalogService.getService(Number(req.params.id));
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json(service);
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

  /** Semillas iniciales de categorías (idempotente) */
  await catalogService.seedCategories();

  return httpServer;
}

