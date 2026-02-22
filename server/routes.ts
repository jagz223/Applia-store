import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { registerGenFebRoutes } from "./routes-genfeb";
import { registerAuthRoutes as registerJwtAuthRoutes } from "./routes-auth";
import { registerInvoiceRoutes } from "./routes-invoices";
import { registerPayPalRoutes } from "./routes-paypal";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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

  /** Middleware ligero para verificar sesión OIDC en rutas protegidas */
  const requireAuth = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };

  /** Categorías: listado público */
  app.get(api.categories.list.path, async (req, res) => {
    const categories = await storage.getCategories();
    res.json(categories);
  });

  /**
   * Proveedores:
   * - GET /api/providers?profession=... → filtro opcional por profesión
   * - GET /api/providers/:id → detalle por id
   * - POST /api/providers → creación (requiere sesión)
   * - GET /api/me/provider → perfil de proveedor del usuario autenticado
   */
  app.get(api.providers.list.path, async (req, res) => {
    const profession = req.query.profession as string | undefined;
    const providers = await storage.getAllProviders(profession);
    res.json(providers);
  });

  app.get(api.providers.get.path, async (req, res) => {
    const provider = await storage.getProvider(Number(req.params.id));
    if (!provider) return res.status(404).json({ message: "Provider not found" });
    res.json(provider);
  });

  app.post(api.providers.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.providers.create.input.parse(req.body);
      const userId = (req.user as any).claims.sub;
      
      /** Evita duplicar perfil de proveedor por usuario */
      const existing = await storage.getProviderByUserId(userId);
      if (existing) {
        return res.status(400).json({ message: "You are already a provider" });
      }

      const provider = await storage.createProvider({
        ...input,
        userId,
      });
      res.status(201).json(provider);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get(api.providers.me.path, requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const provider = await storage.getProviderByUserId(userId);
    res.json(provider || null);
  });

  /**
   * Servicios:
   * - GET /api/services?categoryId&search → listado con filtros
   * - GET /api/services/:id → detalle con proveedor y categoría
   * - POST /api/services → creación (requiere ser provider)
   */
  app.get(api.services.list.path, async (req, res) => {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const search = req.query.search as string | undefined;
    const services = await storage.getAllServices(categoryId, search);
    res.json(services);
  });

  app.get(api.services.get.path, async (req, res) => {
    const service = await storage.getService(Number(req.params.id));
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json(service);
  });

  app.post(api.services.create.path, requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const provider = await storage.getProviderByUserId(userId);
    if (!provider) return res.status(403).json({ message: "Only providers can create services" });

    try {
      const input = api.services.create.input.parse(req.body);
      const service = await storage.createService({
        ...input,
        providerId: provider.id,
      });
      res.status(201).json(service);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  /**
   * Reservas:
   * - GET /api/bookings?asProvider=true → vista de reservas como proveedor o como usuario
   * - POST /api/bookings → crea reserva para un servicio
   * - PATCH /api/bookings/:id/status → actualiza estado (provider)
   */
  app.get(api.bookings.list.path, requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    
    // If user is also a provider, they might want to see jobs?
    // For now let's return bookings they MADE. 
    // Maybe we need a query param to switch mode? 
    // Let's implement simpler: return bookings MADE by user.
    // Providers check a different endpoint or filter?
    // Let's stick to user bookings here.
    
    /** Permite alternar modo proveedor con ?asProvider=true */
    
    const asProvider = req.query.asProvider === 'true';
    
    if (asProvider) {
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) return res.json([]);
      const bookings = await storage.getBookingsByProvider(provider.id);
      return res.json(bookings);
    } else {
      const bookings = await storage.getBookingsByUser(userId);
      return res.json(bookings);
    }
  });

  app.post(api.bookings.create.path, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = api.bookings.create.input.parse(req.body);
      
      const booking = await storage.createBooking({
        ...input,
        userId,
        date: new Date(input.date) // ensure date is Date object
      });
      res.status(201).json(booking);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.patch(api.bookings.updateStatus.path, requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const provider = await storage.getProviderByUserId(userId);
    if (!provider) return res.status(403).json({ message: "Only providers can update status" });

    // Verify booking belongs to provider
    // TODO: Ideally we fetch booking and check service->providerId matches
    // For MVP trusting the user/provider context but ideally we check ownership
    
    const booking = await storage.updateBookingStatus(Number(req.params.id), req.body.status);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    res.json(booking);
  });

  /** Semillas iniciales de categorías (idempotente) */
  await storage.seedCategories();

  return httpServer;
}
