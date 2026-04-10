// Reseñas y Ratings para GenFeb

import { pgTable, text, serial, integer, boolean, timestamp, varchar, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== RESEÑAS ====================
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  
  // Relación con booking (opcional)
  bookingId: integer("booking_id"),
  
  // Usuario que hace la reseña
  reviewerId: varchar("reviewer_id").notNull(),
  reviewerName: varchar("reviewer_name").notNull(),
  
  // Usuario que recibe la reseña
  targetId: varchar("target_id").notNull(),
  targetType: varchar("target_type", { length: 20 }).notNull(), // "service" | "provider"
  
  // Calificación (1-5 estrellas)
  rating: integer("rating").notNull(),
  
  // Título y contenido
  title: varchar("title", { length: 200 }),
  content: text("content"),
  
  // Aspectos evaluados
  aspects: jsonb("aspects").$type<{
    calidad?: number;
    punctualidad?: number;
    profesionalismo?: number;
    precio?: number;
    comunicacion?: number;
  }>(),
  
  // Estado
  isVerified: boolean("is_verified").default(false),
  isPublic: boolean("is_public").default(true),
  
  // Respuesta del profesional
  response: text("response"),
  respondedAt: timestamp("responded_at"),
  
  // helpful votes
  helpfulCount: integer("helpful_count").default(0),
  
  // Fechas
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ==================== TIPOS ====================
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export const insertReviewSchema = createInsertSchema(reviews);

// ==================== SCHEMA ZOD ====================
export const createReviewSchema = z.object({
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

export const replyReviewSchema = z.object({
  response: z.string().min(1).max(1000),
});

// ==================== ESTADÍSTICAS ====================
export const reviewStats = pgTable("review_stats", {
  id: serial("id").primaryKey(),
  targetId: varchar("target_id").notNull(),
  targetType: varchar("target_type", { length: 20 }).notNull(),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }).default("0"),
  totalReviews: integer("total_reviews").default(0),
  fiveStars: integer("five_stars").default(0),
  fourStars: integer("four_stars").default(0),
  threeStars: integer("three_stars").default(0),
  twoStars: integer("two_stars").default(0),
  oneStar: integer("one_star").default(0),
  aspectsAvg: jsonb("aspects_avg"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export type ReviewStats = typeof reviewStats.$inferSelect;
