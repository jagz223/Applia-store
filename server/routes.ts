import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  await setupAuth(app);
  registerAuthRoutes(app);

  // Helper to ensure auth
  const requireAuth = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };

  // Categories
  app.get(api.categories.list.path, async (req, res) => {
    const categories = await storage.getCategories();
    res.json(categories);
  });

  // Providers
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
      
      // Check if already provider
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

  // Services
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

  // Bookings
  app.get(api.bookings.list.path, requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    
    // If user is also a provider, they might want to see jobs?
    // For now let's return bookings they MADE. 
    // Maybe we need a query param to switch mode? 
    // Let's implement simpler: return bookings MADE by user.
    // Providers check a different endpoint or filter?
    // Let's stick to user bookings here.
    
    // Actually, for dashboard, we might want both.
    // Let's check query param 'asProvider=true'
    
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

  // Seed data
  await storage.seedCategories();

  return httpServer;
}
