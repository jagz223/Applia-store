import { pgTable, text, serial, integer, boolean, timestamp, varchar, decimal, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";
import { relations } from "drizzle-orm";
import type { ServiceListingProfileFields } from "./service-listing-profile";

export * from "./models/auth";

// === TABLE DEFINITIONS ===

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type").notNull(), // 'profession' or 'technical'
  icon: text("icon").notNull(), // Lucide icon name
  imageUrl: text("image_url"),
});

export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  /** Id de la categoría (tabla categories). Un solo sistema de categorías para servicios y proveedores. */
  categoryId: integer("category_id").references(() => categories.id),
  /** Slug/código de categoría; se mantiene en migración para compatibilidad. Preferir categoryId. */
  category: text("category"),
  profession: text("profession").notNull(),
  bio: text("bio").notNull(),
  yearsExperience: integer("years_experience").notNull(),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  isVerified: boolean("is_verified").default(false),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
  reviewCount: integer("review_count").default(0),
  /** Etiquetas cortas de habilidades (JSON string[] en Postgres / array en Firestore). */
  skills: json("skills").$type<string[] | null>(),
});

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull().references(() => providers.id),
  categoryId: integer("category_id").notNull().references(() => categories.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: text("image_url").notNull(),
  isActive: boolean("is_active").default(true),
  lastEditedAt: timestamp("last_edited_at"),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  serviceId: integer("service_id").notNull().references(() => services.id),
  date: timestamp("date").notNull(),
  status: text("status").notNull().default("pending"), // pending, confirmed, completed, cancelled
  notes: text("notes"),
  /** Costo numérico de la reserva/servicio. */
  cost: decimal("cost", { precision: 10, scale: 2 }),
  /** El cliente confirma el pago seguro; completed es inalcanzable si es false. */
  confirmedByClient: boolean("confirmed_by_client").default(false),
  paymentMethod: text("payment_method").notNull().default("wallet"), // 'wallet', 'cash'
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const providersRelations = relations(providers, ({ one, many }) => ({
  user: one(users, {
    fields: [providers.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [providers.categoryId],
    references: [categories.id],
  }),
  services: many(services),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  provider: one(providers, {
    fields: [services.providerId],
    references: [providers.id],
  }),
  category: one(categories, {
    fields: [services.categoryId],
    references: [categories.id],
  }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  user: one(users, {
    fields: [bookings.userId],
    references: [users.id],
  }),
  service: one(services, {
    fields: [bookings.serviceId],
    references: [services.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  providerProfile: one(providers, {
    fields: [users.id],
    references: [providers.userId],
  }),
  bookings: many(bookings),
}));


// === SCHEMAS ===

export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertProviderSchema = createInsertSchema(providers).omit({ id: true, rating: true, reviewCount: true, isVerified: true });

/** Biografía y enfoque profesional (`providers.bio`): no vacío ni demasiado corto; máx. 700 en UI y API. */
export const professionalBioFieldSchema = z
  .string()
  .trim()
  .min(50, { message: "Escribe al menos 50 caracteres (un poco más que un eslogan)." })
  .max(700, { message: "Máximo 700 caracteres." });
export const insertServiceSchema = createInsertSchema(services).omit({ id: true });
export const insertBookingSchema = createInsertSchema(bookings).omit({ id: true, createdAt: true, status: true });

// === TYPES ===

export type Category = typeof categories.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Booking = typeof bookings.$inferSelect;

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type InsertBooking = z.infer<typeof insertBookingSchema>;

export type ProviderWithUser = Provider & { user: typeof users.$inferSelect };
export type ServiceWithProvider = Service &
  ServiceListingProfileFields & {
    provider: ProviderWithUser;
    category: Category;
    /** Subcategoría enriquecida (ej. Servicios Legales) cuando el servicio tiene subcategoryId. */
    subcategory?: { id: number; name: string } | null;
  };
