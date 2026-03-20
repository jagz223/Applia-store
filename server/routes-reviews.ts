import type { Express } from "express";
import type { Server } from "http";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { genFebStorage } from "./storage-genfeb";

// ============== ESQUEMAS ==============

const createReviewSchema = z.object({
  bookingId: z.number().optional(),
  targetId: z.string(),
  targetType: z.enum(["service", "provider"]),
  rating: z.number().min(1).max(5),
  title: z.string().max(200).optional(),
  content: z.string().optional(),
  aspects: z.object({
    calidad: z.number().min(1).max(5).optional(),
    punctualidad: z.number().min(1).max(5).optional(),
    profesionalismo: z.number().min(1).max(5).optional(),
    precio: z.number().min(1).max(5).optional(),
    comunicacion: z.number().min(1).max(5).optional(),
  }).optional(),
});

const replyReviewSchema = z.object({
  response: z.string().min(1).max(1000),
});

// ============== MIDDLEWARE ==============

function authenticateJWT(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token requerido" });
  }
  const token = authHeader.substring(7);
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET || "genfeb-jwt-secret-key-2024");
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
}

// ============== REGISTRO DE RUTAS ==============

export async function registerReviewRoutes(
  httpServer: Server,
  app: Express
): Promise<void> {
  
  // GET /api/reviews - Listar reseñas
  app.get("/api/reviews", async (req, res) => {
    try {
      const { targetId, targetType, limit = "10", offset = "0" } = req.query;
      
      const reviews = await genFebStorage.getReviews({
        targetId: targetId as string,
        targetType: targetType as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
      
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ message: "Error interno" });
    }
  });
  
  // GET /api/reviews/stats/:targetType/:targetId - Obtener estadísticas
  app.get("/api/reviews/stats/:targetType/:targetId", async (req, res) => {
    try {
      const { targetType, targetId } = req.params;
      
      const stats = await genFebStorage.getReviewStats(targetId, targetType);
      
      res.json(stats || {
        averageRating: 0,
        totalReviews: 0,
        distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
      });
    } catch (error) {
      console.error("Error fetching review stats:", error);
      res.status(500).json({ message: "Error interno" });
    }
  });
  
  // POST /api/reviews - Crear reseña
  app.post("/api/reviews", authenticateJWT, async (req: any, res) => {
    try {
      const data = createReviewSchema.parse(req.body);
      
      const review = await genFebStorage.createReview({
        ...data,
        reviewerId: req.user.id,
        reviewerName: `${req.user.name} ${req.user.lastName}`,
      });
      
      // Actualizar estadísticas
      await genFebStorage.updateReviewStats(data.targetId, data.targetType);
      
      res.status(201).json(review);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error creating review:", error);
      res.status(500).json({ message: "Error interno" });
    }
  });
  
  // POST /api/reviews/:id/response - Responder a reseña
  app.post("/api/reviews/:id/response", authenticateJWT, async (req: any, res) => {
    try {
      const data = replyReviewSchema.parse(req.body);
      const reviewId = parseInt(req.params.id);
      
      const review = await genFebStorage.replyToReview(
        reviewId,
        data.response,
        req.user.id,
        `${req.user.name} ${req.user.lastName}`
      );
      
      res.json(review);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error responding to review:", error);
      res.status(500).json({ message: "Error interno" });
    }
  });
  
  // POST /api/reviews/:id/helpful - Marcar como útil
  app.post("/api/reviews/:id/helpful", async (req, res) => {
    try {
      const reviewId = parseInt(req.params.id);
      
      const review = await genFebStorage.markReviewHelpful(reviewId);
      
      res.json(review);
    } catch (error) {
      console.error("Error marking review helpful:", error);
      res.status(500).json({ message: "Error interno" });
    }
  });
  
  // DELETE /api/reviews/:id - Eliminar reseña (solo autor o admin)
  app.delete("/api/reviews/:id", authenticateJWT, async (req: any, res) => {
    try {
      const reviewId = parseInt(req.params.id);
      
      await genFebStorage.deleteReview(reviewId, req.user.id, req.user.role);
      
      res.json({ message: "Reseña eliminada" });
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({ message: "Error interno" });
    }
  });
  
  console.log("✅ Review routes registered");
}
