// GenFeb S.A.S. - Base de Datos Extendida
// Incluye roles de usuario y integración con App ManGo

import { pgTable, text, serial, integer, boolean, timestamp, varchar, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === ROLES DE USUARIO ===
export type UserRole = "admin" | "professional" | "client";

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

// === PAGOS ESCROW ===
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

// === SCHEMAS DE INSERCIÓN (ZOD) ===
export const insertUserRoleSchema = createInsertSchema(userRoles);
export const insertDocumentSchema = createInsertSchema(documents);
export const insertEscrowPaymentSchema = createInsertSchema(escrowPayments);
export const insertConversationSchema = createInsertSchema(conversations);
export const insertMessageSchema = createInsertSchema(messages);
export const insertNotificationSchema = createInsertSchema(notifications);
export const insertFinancialReportSchema = createInsertSchema(financialReports);

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
