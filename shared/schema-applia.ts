// Applia - Base de Datos Extendida
// Incluye roles de usuario, integración con App ManGo y nuevas funcionalidades

import { pgTable, text, serial, integer, boolean, timestamp, varchar, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Import original schema types (to avoid duplicates)
export { bookings, services, categories } from "./schema";

// === ROLES DE USUARIO ===
export type UserRole = "admin" | "tiSupport" | "professional" | "client" | "central" | "employee";

export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  role: varchar("role", { length: 20 }).notNull().$type<UserRole>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  
  // Campos adicionales para perfil
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }).default("Ecuador"),
  avatar: text("avatar"),
  bio: text("bio"),
  language: varchar("language", { length: 10 }).default("es"),
  
  // Estado de cuenta
  isActive: boolean("is_active").default(true),
  isVerified: boolean("is_verified").default(false),
  emailVerified: boolean("email_verified").default(false),
  
  // Configuración de notificaciones
  notifications: jsonb("notifications").$type<{
    email: boolean;
    push: boolean;
    sms: boolean;
  }>().default({ email: true, push: true, sms: false }),
});

// === INTEGRACIÓN CON APP MANGO ===
export const mangoSync = pgTable("mango_sync", {
  id: serial("id").primaryKey(),
  mangoUserId: varchar("mango_user_id").notNull().unique(),
  localUserId: varchar("local_user_id").notNull(),
  lastSyncAt: timestamp("last_sync_at").defaultNow(),
  syncStatus: varchar("sync_status", { length: 20 }).default("pending"),
  syncData: jsonb("sync_data").$type<{
    contacts: boolean;
    bookings: boolean;
    payments: boolean;
  }>().default({ contacts: false, bookings: false, payments: false }),
});

// === DOCUMENTOS Y CONTRATOS (BÓVEDA) ===
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // contract, invoice, identity, legal, insurance
  encryptedPath: text("encrypted_path").notNull(),
  encryptionKey: text("encryption_key"), // Stored encrypted
  size: integer("size").notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  status: varchar("status", { length: 20 }).default("pending"), // pending, verified, expired
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  verifiedAt: timestamp("verified_at"),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata"),
});

// === Pagos retenidos (legado: escrow_payments en migraciones) ===
export const escrowPayments = pgTable("escrow_payments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id"),
  clientId: varchar("client_id").notNull(),
  providerId: varchar("provider_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: varchar("status", { length: 20 }).default("pending"), // pending, held, released, disputed, refunded
  paymentMethod: varchar("payment_method"), // stripe, paypal, bank
  transactionId: varchar("transaction_id"),
  heldAt: timestamp("held_at"),
  releasedAt: timestamp("released_at"),
  releaseConditions: text("release_conditions"),
  disputeReason: text("dispute_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === MENSAJES (CHAT) ===
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  participant1Id: varchar("participant1_id").notNull(),
  participant2Id: varchar("participant2_id").notNull(),
  serviceId: integer("service_id"),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  senderId: varchar("sender_id").notNull(),
  content: text("content").notNull(),
  type: varchar("type", { length: 20 }).default("text"), // text, image, file, system
  status: varchar("status", { length: 20 }).default("sent"), // sending, sent, delivered, read
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === NOTIFICACIONES ===
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // booking, payment, message, system
  title: text("title").notNull(),
  body: text("body"),
  data: jsonb("data"),
  read: boolean("read").default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === REPORTES FINANCIEROS ===
export const financialReports = pgTable("financial_reports", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // income, expense, invoice, payout
  period: varchar("period", { length: 20 }), // monthly, weekly, yearly
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: varchar("status", { length: 20 }).default("completed"),
  description: text("description"),
  relatedId: integer("related_id"), // booking_id, payment_id, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// =====================================================
// NUEVAS FUNCIONALIDADES (Inspiradas en BookingDo SaaS)
// =====================================================

// === ESTADOS DE RESERVA PERSONALIZABLES ===
export type BookingStatusType = 1 | 2 | 3 | 4; // 1=nuevo, 2=procesando, 3=completado, 4=cancelado

export const bookingStatuses = pgTable("booking_statuses", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  description: text("description"),
  type: integer("type").notNull().$type<BookingStatusType>(), // 1=nuevo, 2=procesando, 3=completado, 4=cancelado
  color: varchar("color", { length: 7 }).default("#6B7280"), // Color hex para UI
  icon: varchar("icon", { length: 50 }), // Icono para UI
  isDefault: boolean("is_default").default(false),
  isAvailable: boolean("is_available").default(true),
  isSystem: boolean("is_system").default(false), // Si es un estado del sistema
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === IMPUESTOS (TAXES) ===
export const taxes = pgTable("taxes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  rate: decimal("rate", { precision: 5, scale: 2 }).notNull(), // Porcentaje: 12.00 = 12%
  type: varchar("type", { length: 20 }).default("percentage"), // percentage o fixed
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),
  country: varchar("country", { length: 100 }).default("Ecuador"),
  region: varchar("region", { length: 100 }), // Provincia/Estado
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === CÓDIGOS PROMOCIONALES / TICKETS ===
export const promotionalCodes = pgTable("promotional_codes", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  expirationType: varchar("expiration_type", { length: 20 }).notNull(), // por_tiempo | por_usos
  expiresAt: timestamp("expires_at"), // Obligatorio si expirationType = por_tiempo
  maxUses: integer("max_uses"), // Obligatorio si expirationType = por_usos
  usedCount: integer("used_count").default(0).notNull(),
  usedByUserCounts: jsonb("used_by_user_counts").$type<Record<string, number>>().default({}),
  benefitType: varchar("benefit_type", { length: 20 }).notNull(), // descuento | meses_gratuitos
  benefitValue: decimal("benefit_value", { precision: 10, scale: 2 }).notNull(),
  isPublic: boolean("is_public").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === CUPONES / DESCUENTOS ===
export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: text("description"),
  discountType: varchar("discount_type", { length: 20 }).notNull(), // percentage o fixed
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  minAmount: decimal("min_amount", { precision: 10, scale: 2 }), // Monto mínimo para aplicar
  maxDiscount: decimal("max_discount", { precision: 10, scale: 2 }), // Descuento máximo (para %)
  maxUses: integer("max_uses"), // Usos máximos (null = ilimitado)
  usedCount: integer("used_count").default(0),
  usedByUsers: jsonb("used_by_users").$type<string[]>().default([]), // IDs de usuarios que usaron
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  isActive: boolean("is_active").default(true),
  applicableServices: jsonb("applicable_services").$type<number[]>().default([]), // IDs de servicios (vacío = todos)
  applicableCategories: jsonb("applicable_categories").$type<number[]>().default([]), // IDs de categorías
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === SERVICIOS ADICIONALES (ADD-ONS) ===
export const serviceAddons = pgTable("service_addons", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  duration: integer("duration").default(0), // Duración extra en minutos
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === RESERVA CON SERVICIOS ADICIONALES ===
export const bookingAddons = pgTable("booking_addons", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  addonId: integer("addon_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

// === SCHEMAS DE INSERCIÓN (ZOD) ===
export const insertUserRoleSchema = createInsertSchema(userRoles);
export const insertDocumentSchema = createInsertSchema(documents);
export const insertEscrowPaymentSchema = createInsertSchema(escrowPayments);
export const insertConversationSchema = createInsertSchema(conversations);
export const insertMessageSchema = createInsertSchema(messages);
export const insertNotificationSchema = createInsertSchema(notifications);
export const insertFinancialReportSchema = createInsertSchema(financialReports);

// Nuevos esquemas
export const insertBookingStatusSchema = createInsertSchema(bookingStatuses);
export const insertTaxSchema = createInsertSchema(taxes);
export const insertPromotionalCodeSchema = createInsertSchema(promotionalCodes);
export const insertCouponSchema = createInsertSchema(coupons);
export const insertServiceAddonSchema = createInsertSchema(serviceAddons);
export const insertBookingAddonSchema = createInsertSchema(bookingAddons);

// === TIPOS TYPESCRIPT ===
export type UserRoleRecord = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type EscrowPayment = typeof escrowPayments.$inferSelect;
export type NewEscrowPayment = typeof escrowPayments.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type FinancialReport = typeof financialReports.$inferSelect;

// Nuevos tipos
export type BookingStatus = typeof bookingStatuses.$inferSelect;
export type NewBookingStatus = typeof bookingStatuses.$inferInsert;
export type Tax = typeof taxes.$inferSelect;
export type NewTax = typeof taxes.$inferInsert;
export type PromotionalCode = typeof promotionalCodes.$inferSelect;
export type NewPromotionalCode = typeof promotionalCodes.$inferInsert;
export type Coupon = typeof coupons.$inferSelect;
export type NewCoupon = typeof coupons.$inferInsert;
export type ServiceAddon = typeof serviceAddons.$inferSelect;
export type NewServiceAddon = typeof serviceAddons.$inferInsert;
export type BookingAddon = typeof bookingAddons.$inferSelect;
export type NewBookingAddon = typeof bookingAddons.$inferInsert;

// === RELACIONES ===
// Note: Relations for bookings, services, categories are defined in schema.ts
// Relations for Applia-specific tables:

export const bookingAddonsRelations = relations(bookingAddons, ({ one }) => ({
  addon: one(serviceAddons, {
    fields: [bookingAddons.addonId],
    references: [serviceAddons.id],
  }),
}));

export const serviceAddonsRelations = relations(serviceAddons, ({ one, many }) => ({
  bookings: many(bookingAddons),
}));

// === DATOS POR DEFECTO ===
export const defaultBookingStatuses = [
  { name: "Nueva", type: 1 as BookingStatusType, color: "#3B82F6", icon: "sparkles", isDefault: true, isSystem: true, sortOrder: 1 },
  { name: "Confirmada", type: 1 as BookingStatusType, color: "#8B5CF6", icon: "check-circle", isSystem: true, sortOrder: 2 },
  { name: "En Proceso", type: 2 as BookingStatusType, color: "#F59E0B", icon: "loader", isSystem: true, sortOrder: 3 },
  { name: "Completada", type: 3 as BookingStatusType, color: "#10B981", icon: "check", isDefault: true, isSystem: true, sortOrder: 4 },
  { name: "Cancelada", type: 4 as BookingStatusType, color: "#EF4444", icon: "x-circle", isDefault: true, isSystem: true, sortOrder: 5 },
];

export const defaultTaxes = [
  { name: "IVA 12%", description: "Impuesto al Valor Agregado", rate: "12.00", type: "percentage", isDefault: true, country: "Ecuador", region: "Nacional" },
  { name: "ICE", description: "Impuesto a los Consumos Especiales", rate: "0.00", type: "percentage", isDefault: false, country: "Ecuador" },
];
