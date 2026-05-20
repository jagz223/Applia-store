import {
  users,
  categories,
  providers,
  services,
  bookings,
  type User,
  type Category,
  type Provider,
  type Service,
  type Booking,
  type InsertCategory,
  type InsertProvider,
  type InsertService,
  type InsertBooking,
  type ProviderWithUser,
  type ServiceWithProvider,
} from "@shared/schema";
import { calcCommission, calcProviderNet, roundToCents } from "@shared/platform-commission";
import { getPlatformCommissionRate } from "./platform-commission-rate";
import { hasAdminPrivileges } from "@shared/roles";
import { eq, and, like, desc } from "drizzle-orm";
import type { IUserStorage, IRoleStorage, ICatalogStorage, IBookingStorage } from "./storage-contracts";
import type { ProfessionalVerification, VerifyingStatus, ProfessionalVerificationState } from "@shared/professional-verification";
import { isProfessionalVerificationLocked } from "@shared/professional-verification";
import {
  PROMO_CODE_MSG_ALREADY_REDEEMED_BY_USER,
  PROMO_CODE_MSG_NO_LONGER_AVAILABLE,
  userHasRedeemedPromotionalCode,
} from "@shared/promotional-code-utils";
import { aggregateAdminDashboardStats, type AdminDashboardStatsResult } from "./admin-dashboard-stats";
import { countVerificationsAwaitingAdminReview } from "./associate-verification-admin";
import { canAffordOffPlatformCommission, PROVIDER_WALLET_FLOOR_USD } from "@shared/wallet-limits";
import { isOffPlatformServiceBookingPayment } from "@shared/booking-payment";
import { FEATURE_OFF_PLATFORM_COMMISSION_ENABLED } from "@shared/feature-flags";
import { CHAT_SYSTEM_SENDER_ID } from "@shared/chat-constants";
import { getGenfebStatsMonthKey } from "@shared/ecuador-calendar";
import { bookingTransitionCountsForMonthlySubcategoryDemand } from "@shared/subcategory-monthly-demand";
import { DEFAULT_CATEGORIES } from "@shared/default-categories";
const getDb = async () => (await import("./db")).db;

/**
 * Definición de un rol (catálogo de roles del sistema).
 * El campo `code` es el identificador único (ej. "admin", "professional", "client").
 */
export interface RoleDefinition {
  code: string;
  name: string;
  description?: string;
  isSystem?: boolean;
  sortOrder?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type NewRoleDefinition = Omit<RoleDefinition, "createdAt" | "updatedAt">;

/**
 * Contrato de almacenamiento de dominio - GenFeb
 * Implementa segregación de interfaces (SOLID): IUserStorage, IRoleStorage, ICatalogStorage, IBookingStorage
 * están en storage-contracts.ts; IStorage los compone y añade el resto del dominio.
 */
export interface IStorage
  extends IUserStorage,
    IRoleStorage,
    ICatalogStorage,
    IBookingStorage {
  // Pagos Escrow
  getPaymentsByUser(userId: string): Promise<any[]>;
  getEscrowPayments(userId: string): Promise<any[]>;
  createEscrowPayment(payment: any): Promise<any>;
  releaseEscrowPayment(paymentId: number, release: boolean, reason?: string): Promise<any>;
  getUserBalance(userId: string): Promise<{ available: number; escrow: number; pending: number }>;
  
  // Documentos (Bóveda)
  getDocumentsByUser(userId: string, type?: string): Promise<any[]>;
  createDocument(doc: any): Promise<any>;
  deleteDocument(id: number, userId: string): Promise<void>;
  
  // Conversaciones y Mensajes
  getConversationsByUser(userId: string): Promise<any[]>;
  createConversation(conv: any): Promise<any>;
  /** before = createdAt en ms del mensaje más antiguo que ya tenemos (cursor para cargar más) */
  getMessagesByConversation(conversationId: number, options: { limit: number; before?: number }): Promise<{ messages: any[]; hasMore: boolean }>;
  getLastMessageByConversation(conversationId: number): Promise<any | null>;
  getUnreadCountByConversation(conversationId: number, userId: string): Promise<number>;
  createMessage(msg: any): Promise<any>;
  markMessageAsRead(messageId: number): Promise<void>;
  markConversationAsRead(conversationId: number, userId: string): Promise<void>;
  /** Oculta una conversación del historial de usuarios (sin borrar BD). */
  hideConversationForUsers(conversationId: number, userIds: string[]): Promise<void>;
  /** Actualiza campos de una conversación (p. ej. bookingId, período de gracia tras fin de servicio). */
  patchConversation(conversationId: number, patch: Record<string, unknown>): Promise<void>;
  /**
   * Busca conversación de chat vinculada a una reserva solo por bookingId (sin reutilizar hilos de reservas anteriores).
   */
  findConversationForServiceBooking(booking: {
    id: number;
    userId?: string;
    providerId?: number;
    serviceId?: number;
  }): Promise<any | null>;
  /** Lista conversaciones para auditoría admin (sin filtro de gracia ni hiddenForUserIds). */
  listConversationsForAdmin(opts?: { limit?: number }): Promise<any[]>;
  /** Marca hilos de viaje Go no completados cuyo plazo de 24 h ya venció. */
  sweepStaleMobilityRideChats?(): Promise<number>;

  // Roles de Usuario (perfil del usuario, no catálogo de roles)
  getUserRole(userId: string): Promise<any | undefined>;
  updateUserRole(userId: string, data: any): Promise<any>;

  // Reportes Financieros
  getFinancialReports(userId: string, period?: string): Promise<any[]>;
  createFinancialReport(data: any): Promise<any>;
  updateFinancialReportStatus(id: number | string, status: string): Promise<void>;
  getFinancialReport(id: number | string): Promise<any | null>;
  getKPIs(userId: string): Promise<any>;
  
  // Notificaciones
  getNotifications(userId: string, unreadOnly?: boolean): Promise<any[]>;
  createNotification(notification: { userId: string; type: string; data: Record<string, unknown> }): Promise<any>;
  markNotificationAsRead(notificationId: number): Promise<void>;
  /** Marca todas las notificaciones del usuario como leídas (panel campana / «Limpiar»). */
  markAllNotificationsAsReadForUser(userId: string): Promise<void>;

  // Peticiones de cambio de cuenta (correo/nombre/teléfono/vehículo Go)
  createAccountChangeRequest(input: {
    userId: string;
    field: "email" | "name" | "phone" | "vehicle";
    reason: string;
    proposal?: unknown;
  }): Promise<any>;
  getMyAccountChangeRequests(userId: string): Promise<any[]>;
  getPendingAccountChangeRequests(): Promise<any[]>;
  resolveAccountChangeRequest(args: { id: number; action: "approve" | "reject"; adminUserId: string }): Promise<any>;
  
  // Integración ManGo
  syncWithMango(userId: string, mangoUserId: string): Promise<any>;
  getMangoSyncStatus(userId: string): Promise<any | undefined>;
  
  // Reseñas y Ratings
  getReviews(params: { targetId?: string; targetType?: string; limit?: number; offset?: number }): Promise<any[]>;
  getReviewStats(targetId: string, targetType: string): Promise<any | undefined>;
  createReview(review: any): Promise<any>;
  replyToReview(reviewId: number, response: string, responderId: string, responderName: string): Promise<any>;
  markReviewHelpful(reviewId: number): Promise<any>;
  deleteReview(reviewId: number, userId: string, actingUserRole?: string): Promise<void>;
  updateReviewStats(targetId: string, targetType: string): Promise<void>;
  
  // ==================== NUEVOS MÉTODOS (BookingDo) ====================
  
  // Estados de Reserva Personalizables
  getBookingStatuses(): Promise<any[]>;
  createBookingStatus(status: any): Promise<any>;
  updateBookingStatusCustom(id: number, data: any): Promise<any | undefined>;
  deleteBookingStatus(id: number): Promise<void>;
  
  // Impuestos (Taxes)
  getTaxes(): Promise<any[]>;
  createTax(tax: any): Promise<any>;
  updateTax(id: number, data: any): Promise<any | undefined>;
  deleteTax(id: number): Promise<void>;
  calculateTaxes(amount: number, taxIds: number[]): Promise<{ subtotal: number; taxes: any[]; total: number }>;
  
  // Códigos promocionales / tickets
  getPromotionalCodes(): Promise<any[]>;
  getPromotionalCodeById(id: number): Promise<any | undefined>;
  getPromotionalCodeByCode(code: string): Promise<any | undefined>;
  createPromotionalCode(data: {
    code: string;
    expirationType: string;
    expiresAt?: Date | null;
    maxUses?: number | null;
    benefitType: string;
    benefitValue: string;
  }): Promise<any>;
  updatePromotionalCode(
    id: number,
    data: {
      code: string;
      expirationType: string;
      expiresAt?: Date | null;
      maxUses?: number | null;
      benefitType: string;
      benefitValue: string;
    },
  ): Promise<any | undefined>;
  deletePromotionalCode(id: number): Promise<void>;
  incrementPromotionalCodeUsedCount(id: number, userId?: string): Promise<any | undefined>;

  // Cupones/Descuentos
  getCoupons(userId: string): Promise<any[]>;
  createCoupon(coupon: any): Promise<any>;
  updateCoupon(id: number, data: any): Promise<any | undefined>;
  deleteCoupon(id: number): Promise<void>;
  validateCoupon(code: string, serviceId?: number, categoryId?: number, amount?: number, userId?: string): Promise<{ valid: boolean; discount: number; message: string }>;
  
  // Servicios Adicionales (Add-ons)
  getServiceAddons(serviceId: number): Promise<any[]>;
  createServiceAddon(addon: any): Promise<any>;
  updateServiceAddon(id: number, data: any): Promise<any | undefined>;
  deleteServiceAddon(id: number): Promise<void>;
  
  // Reservas con Add-ons
  calculateBookingTotal(serviceId: number, addonIds: number[], couponCode?: string, userId?: string): Promise<any>;
  getBookingAddons(bookingId: number): Promise<any[]>;
  addBookingAddon(bookingAddon: any): Promise<any>;
  
  // Payment Vouchers
  createPaymentVoucher(data: {
    userId: string;
    bankId: string;
    bankName: string;
    bankAccount: string;
    voucherNumber: string;
    date: Date;
    time: string;
    amount: number;
    serviceName: string;
    notes?: string;
    status: string;
  }): Promise<any>;
  getPaymentVouchersByUser(userId: string): Promise<any[]>;
  updatePaymentVoucherStatus(id: number, status: string): Promise<any | null>;

  // Wallet & transfers
  createTransfer(transfer: {
    userId: string;
    fromUserId?: string | null;
    amount: number;
    transferType: "service_payment" | "recharge";
    status?: "pending_approval" | "completed" | "rejected";
    description?: string;
    referenceId?: string;
    currency?: string;
  }): Promise<any>;
  getTransfersByUser(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      transferType?: "service_payment" | "recharge" | "withdrawal" | "payment";
      status?: "pending_approval" | "completed" | "rejected";
      description?: string;
      dateFrom?: string;
      dateTo?: string;
      amountMin?: number;
      amountMax?: number;
    }
  ): Promise<{ transfers: any[]; total: number }>;
  /** Listar todas las transferencias de la plataforma (solo admin). */
  getAllTransfers(): Promise<{ transfers: any[]; total: number }>;
  /** Actualizar estado de una transferencia; si es recarga y pasa a completed, acredita el saldo al usuario. */
  updateTransferStatus(transferId: string, status: "pending_approval" | "completed" | "rejected"): Promise<any>;
  getWalletTransfer(id: number | string): Promise<any | null>;
  getTotalPlatformBalance(): Promise<number>;
  /**
   * Solicitar retiro (escrow solo para retiros): debita wallet y acredita withdrawingFunds. Atómico.
   * withdrawingFunds es el "pending balance" exclusivo de retiros; no se usa pendingBalance (este último es solo escrow de reservas del cliente).
   * Falla si wallet < amount o si withdrawingFunds > 0 (evita colisiones hasta que admin procese).
   */
  requestWithdraw(userId: string, amount: number): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  /** Lista usuarios con withdrawingFunds > 0 (solicitudes de retiro pendientes). */
  getUsersWithPendingWithdrawals(): Promise<Array<{ id: string; name: string; lastName: string; email: string; bankName?: string; accountNumber?: string; withdrawingFunds: number }>>;
  /**
   * Aprobar retiro: pone withdrawingFunds en 0 y registra transferencia "Retiro Completado". Atómico.
   * Asume que el admin ya realizó la transferencia bancaria externa.
   */
  processWithdrawalApproval(userId: string, adminUserId: string): Promise<{ transfer: any; user: any }>;
  /**
   * Rechazar retiro: devuelve el monto de withdrawingFunds al wallet del usuario. Atómico. Retorna el monto rechazado para registrar en historial.
   */
  processWithdrawalRejection(userId: string): Promise<{ user: any; amount: number }>;
  /** Registrar un retiro rechazado en el historial (para listar en admin). */
  recordWithdrawalRejection(userId: string, amount: number, adminUserId: string, bankName?: string, accountNumber?: string): Promise<void>;
  /** Historial de retiros (pendientes, aprobados, rechazados). Paginado y filtrable por estado. */
  getWithdrawalHistory(options: {
    page: number;
    limit: number;
    status: "all" | "pending" | "approved" | "rejected";
  }): Promise<{ items: Array<{
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    bankName?: string;
    accountNumber?: string;
    amount: number;
    status: "pending" | "approved" | "rejected";
    processedAt: Date | null;
    processedByAdminId?: string;
    processedByAdminName?: string;
  }>; total: number }>;

  // Calificaciones (valoración 1-5 tras completar reserva)
  getPendingBookingRatings(userId: string): Promise<Array<{
    bookingId: number;
    rateeUserId: string;
    rateeName: string;
    roleRated: "professional" | "client";
    serviceTitle?: string;
    completedAt?: Date;
  }>>;
  submitBookingRating(
    raterUserId: string,
    bookingId: number,
    ratedUserId: string,
    roleRated: "professional" | "client",
    stars: number
  ): Promise<void>;

  // ==================== VERIFICACIÓN DE PROFESIONALES ====================
  getProfessionalVerificationByUserId(userId: string): Promise<ProfessionalVerification | null>;
  upsertProfessionalVerificationImage(userId: string, imageUrl: string): Promise<ProfessionalVerification>;
  upsertProfessionalVerificationCredential(
    userId: string,
    professionalCredentialUrl: string
  ): Promise<ProfessionalVerification>;
  upsertProfessionalVerificationPayment(
    userId: string,
    data: {
      transferReceiptCode: string;
      transferDate: string;
      subscriptionMonths: number;
      subscriptionMonthlyUsd?: number;
      promotionalCode?: string | null;
      promotionalDiscountPercent?: number | null;
      subscriptionOriginalTotalUsd?: number | null;
      subscriptionDiscountedTotalUsd?: number | null;
    },
  ): Promise<ProfessionalVerification>;

  // ==================== verifying_status (nueva colección) ====================
  getVerifyingStatusByUserId(userId: string): Promise<VerifyingStatus | null>;
  getPendingVerifyingStatuses(): Promise<VerifyingStatus[]>;
  upsertVerifyingStatusIdentificationPending(
    userId: string,
    requestType?: "onboarding" | "renewal",
  ): Promise<VerifyingStatus>;
  upsertVerifyingStatusTransactionPending(
    userId: string,
    transactionDate: string,
    requestType?: "onboarding" | "renewal",
  ): Promise<VerifyingStatus>;
  setVerifyingStatusIdentification(userId: string, status: ProfessionalVerificationState): Promise<VerifyingStatus>;
  setVerifyingStatusTransaction(userId: string, status: ProfessionalVerificationState): Promise<VerifyingStatus>;
  /** Tras reemplazar documento en revisión (máx. 1 por tipo). */
  incrementPendingIdResubmitCount(userId: string): Promise<void>;
  incrementPendingCredentialResubmitCount(userId: string): Promise<void>;
  /** Canje meses gratis antes de completar documentos: marca cola admin + auditoría. */
  upsertVerifyingStatusPrefundPromoAwaitingDossier(
    userId: string,
    args: { code: string; monthsGranted: number },
  ): Promise<VerifyingStatus>;
  clearVerifyingStatusPrefundPromoAwaitingDossier(userId: string): Promise<void>;
  mergeProfessionalVerificationFreeMonthsPrefundPlaceholder(
    userId: string,
    data: {
      transferReceiptCode: string;
      transferDate: string;
      subscriptionMonths: number;
      promotionalCode: string | null;
    },
  ): Promise<ProfessionalVerification>;

  getAdminDashboardStats(params: { from: Date; to: Date }): Promise<AdminDashboardStatsResult>;

  /** Car Go: al completar viaje, aplica comisiones y movimientos de wallet. */
  applyMobilityRideSettlement(input: {
    rideId: string;
    riderUserId: string;
    driverUserId: string;
    estimatedUsd: number;
    paymentMethod: "genfeb" | "cash" | "bank_transfer";
  }): Promise<void>;
}

// Almacenamiento en memoria para desarrollo
// Nota: En producción, usar DatabaseStorage con PostgreSQL o Firestore

export class InMemoryStorage implements IStorage {
  private bookings: any[] = [];
  /** monthKey `YYYY-MM` → subcategoryId → conteo (misma semántica que Firestore). */
  private subcategoryMonthlyBookingCounts = new Map<string, Map<number, number>>();
  private users: any[] = [];
  private userIdCounter = 1;
  
  // ==================== USUARIOS (AUTH JWT) ====================
  
  async getUserById(id: string, includeDeleted?: boolean): Promise<any | undefined> {
    const user = this.users.find(u => u.id === id);
    if (!includeDeleted && user?.deletedAt) return undefined;
    return user;
  }
  
  async getUserByEmail(email: string, includeDeleted?: boolean): Promise<any | undefined> {
    const n = (email ?? "").trim().toLowerCase();
    if (!n) return undefined;
    const user = this.users.find((u) => (u.email ?? "").trim().toLowerCase() === n);
    if (!includeDeleted && user?.deletedAt) return undefined;
    return user;
  }

  private normalizePhone(raw: string): string {
    const s = (raw ?? "").trim();
    if (!s) return "";
    // Mantener un + inicial y solo dígitos.
    const hasPlus = s.startsWith("+");
    const digits = s.replace(/[^\d]/g, "");
    return hasPlus ? `+${digits}` : digits;
  }

  async getUserByPhone(phone: string, includeDeleted?: boolean): Promise<any | undefined> {
    const n = this.normalizePhone(phone);
    if (!n) return undefined;
    const user = this.users.find((u) => this.normalizePhone(u.phone ?? "") === n);
    if (!includeDeleted && user?.deletedAt) return undefined;
    return user;
  }

  async getUsers(params: { role?: string; name?: string; email?: string; lastName?: string; search?: string; page: number; limit: number }): Promise<{ users: any[]; total: number }> {
    let list = [...this.users];
    const { role, name, email, lastName, search, page, limit } = params;
    if (role?.trim()) list = list.filter(u => (u.role || "").toLowerCase() === role.trim().toLowerCase());
    if (search?.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(u => {
        const name = (u.name ?? (u as { firstName?: string }).firstName ?? "").toString();
        const lastName = (u.lastName ?? "").toString();
        const email = (u.email ?? "").toString();
        return name.toLowerCase().includes(s) || lastName.toLowerCase().includes(s) || email.toLowerCase().includes(s);
      });
    } else {
      if (name?.trim()) {
        const n = name.trim().toLowerCase();
        list = list.filter(u => {
          const fullName = String(u.name ?? (u as { firstName?: string }).firstName ?? "");
          return fullName.toLowerCase().includes(n);
        });
      }
      if (email?.trim()) {
        const e = email.trim().toLowerCase();
        list = list.filter(u => (u.email || "").toLowerCase().includes(e));
      }
      if (lastName?.trim()) {
        const l = lastName.trim().toLowerCase();
        list = list.filter(u => (u.lastName || "").toLowerCase().includes(l));
      }
    }
    const total = list.length;
    const start = (page - 1) * limit;
    const users = list.slice(start, start + limit).map(({ password: _p, ...u }) => u);
    return { users, total };
  }
  
  async createUser(user: any): Promise<any> {
    const emailNorm = (user.email ?? "").trim().toLowerCase();
    if (!emailNorm) throw new Error("El email es obligatorio");
    const phoneNorm = this.normalizePhone(user.phone ?? "");
    if (!phoneNorm) throw new Error("El teléfono es obligatorio");

    const existingUser = this.users.find(
      (u) => (u.email ?? "").trim().toLowerCase() === emailNorm
    );
    if (existingUser) {
      if (!existingUser.deletedAt) {
        throw new Error("Este correo electrónico ya está registrado.");
      }

      // Reactivar usuario eliminado
      const now = new Date();
      Object.assign(existingUser, user, {
        email: emailNorm,
        deletedAt: null,
        isActive: true,
        updatedAt: now,
      });
      return existingUser;
    }

    const existingPhone = this.users.find(
      (u) => this.normalizePhone(u.phone ?? "") === phoneNorm
    );
    if (existingPhone) {
      throw new Error("Este teléfono ya está registrado.");
    }

    const role = user.role || "client";
    const newUser = {
      id: String(this.userIdCounter++),
      ...user,
      email: emailNorm,
      phone: phoneNorm,
      ...(role === "professional"
        ? { acceptedProviderTermsOfUse: user.acceptedProviderTermsOfUse ?? false }
        : {}),
      wallet: user.wallet ?? 0,
      totalEarnings: user.totalEarnings ?? 0,
      pendingBalance: user.pendingBalance ?? 0,
      rating: user.rating ?? 5,
      ratingCount: user.ratingCount ?? 0,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(newUser);
    return newUser;
  }
  
  async updateUser(id: string, data: any): Promise<any | undefined> {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) return undefined;

    // No permitir que actualizaciones genéricas (perfil, etc.) modifiquen campos financieros.
    // Solo los métodos dedicados (createTransfer, requestWithdraw, confirmBookingByClient, etc.) deben alterarlos.
    const { wallet: _w, totalEarnings: _te, pendingBalance: _pb, withdrawingFunds: _wf, ...safeData } = data;
    this.users[index] = {
      ...this.users[index],
      ...safeData,
      updatedAt: new Date(),
    };
    return this.users[index];
  }
  
  async updateUserPassword(id: string, password: string): Promise<void> {
    const user = this.users.find(u => u.id === id);
    if (user) {
      user.password = password;
      user.updatedAt = new Date();
    }
  }

  async deleteUser(id: string): Promise<void> {
    const user = this.users.find(u => u.id === id);
    if (user) {
      user.isActive = false;
      user.deletedAt = new Date();
      user.updatedAt = new Date();
    }
  }
  private payments: any[] = [];
  private documents: any[] = [];
  private conversations: any[] = [];
  private messages: any[] = [];
  private userRoles: any[] = [];
  private notifications: any[] = [];
  private accountChangeRequests: any[] = [];
  private accountChangeRequestIdCounter = 1;
  private mangoSyncs: any[] = [];
  private paymentIdCounter = 1;
  private documentIdCounter = 1;
  private conversationIdCounter = 1;
  private messageIdCounter = 1;

  // ============== RESERVAS ==============
  
  async getBookingsByUser(userId: string, status?: string): Promise<any[]> {
    let result = this.bookings.filter(b => b.userId === userId);
    if (status) {
      result = result.filter(b => b.status === status);
    }
    // Ordenar por más reciente: primero por createdAt (si existe), luego por date.
    result.sort((a, b) => {
      const aCreated = (a as { createdAt?: Date }).createdAt ?? (a as { date?: Date }).date ?? new Date(0);
      const bCreated = (b as { createdAt?: Date }).createdAt ?? (b as { date?: Date }).date ?? new Date(0);
      return (bCreated as Date).getTime() - (aCreated as Date).getTime();
    });
    return result;
  }
  
  async getBookingsByProvider(providerId: number): Promise<any[]> {
    return this.bookings.filter(b => b.providerId === providerId);
  }
  
  async getBooking(id: number): Promise<any | undefined> {
    return this.bookings.find(b => b.id === id);
  }
  
  async createBooking(booking: any): Promise<any> {
    const cost = 0;
    const newBooking = { ...booking, id: this.bookings.length + 1, cost, confirmedByClient: false };
    this.bookings.push(newBooking);
    return newBooking;
  }

  async incrementSubcategoryMonthlyBookingCount(subcategoryId: number | null | undefined): Promise<void> {
    const id = subcategoryId != null ? Number(subcategoryId) : NaN;
    if (!Number.isFinite(id) || id <= 0) return;
    const monthKey = getGenfebStatsMonthKey();
    let inner = this.subcategoryMonthlyBookingCounts.get(monthKey);
    if (!inner) {
      inner = new Map();
      this.subcategoryMonthlyBookingCounts.set(monthKey, inner);
    }
    inner.set(id, (inner.get(id) ?? 0) + 1);
  }

  async getMonthlyPopularSubcategoryBookingCounts(
    monthKey: string,
    limit: number
  ): Promise<{ subcategoryId: number; count: number }[]> {
    const inner = this.subcategoryMonthlyBookingCounts.get(monthKey);
    if (!inner || inner.size === 0) return [];
    const lim = Math.min(50, Math.max(1, Math.floor(limit)));
    const rows = [...inner.entries()].map(([subcategoryId, count]) => ({ subcategoryId, count }));
    rows.sort((a, b) => b.count - a.count || a.subcategoryId - b.subcategoryId);
    return rows.slice(0, lim);
  }
  
  async updateBookingStatus(id: number, status: string): Promise<any | undefined> {
    const booking = this.bookings.find(b => b.id === id);
    if (!booking) return undefined;
    const prev = String((booking as { status?: string }).status ?? "pending");
    const countNow = bookingTransitionCountsForMonthlySubcategoryDemand(
      prev,
      status,
      (booking as { monthlyDemandStatsCounted?: boolean }).monthlyDemandStatsCounted === true
    );
    (booking as { status: string }).status = status;
    if (status === "completed") (booking as { completedAt?: Date }).completedAt = new Date();
    if (countNow) {
      (booking as { monthlyDemandStatsCounted?: boolean }).monthlyDemandStatsCounted = true;
      const svc = await this.getService(Number((booking as { serviceId?: number }).serviceId));
      const subId = (svc as { subcategoryId?: number | null } | undefined)?.subcategoryId;
      await this.incrementSubcategoryMonthlyBookingCount(
        subId != null && Number.isFinite(Number(subId)) ? Number(subId) : null
      );
    }
    return booking;
  }

  async completeBookingAndReleaseEscrow(bookingId: number): Promise<any | undefined> {
    const booking = this.bookings.find(b => b.id === bookingId) as { status?: string; userId?: string; providerId?: number; cost?: number; confirmedByClient?: boolean } | undefined;
    if (!booking) return undefined;
    if (booking.status === "completed") return booking;
    const isOffPlatform = isOffPlatformServiceBookingPayment((booking as any).paymentMethod);
    if (booking.confirmedByClient !== true && !isOffPlatform) {
      throw new Error("El servicio requiere confirmación previa del cliente para procesar los fondos retenidos");
    }
    const cost = typeof booking.cost === "number" ? booking.cost : Number(booking.cost) || 0;
    if (cost <= 0) {
      const prev = String(booking.status ?? "pending");
      const countNow = bookingTransitionCountsForMonthlySubcategoryDemand(
        prev,
        "completed",
        (booking as { monthlyDemandStatsCounted?: boolean }).monthlyDemandStatsCounted === true
      );
      (booking as { status: string }).status = "completed";
      (booking as { completedAt?: Date }).completedAt = new Date();
      if (countNow) {
        (booking as { monthlyDemandStatsCounted?: boolean }).monthlyDemandStatsCounted = true;
        const svc = await this.getService(Number((booking as { serviceId?: number }).serviceId));
        const subId = (svc as { subcategoryId?: number | null } | undefined)?.subcategoryId;
        await this.incrementSubcategoryMonthlyBookingCount(
          subId != null && Number.isFinite(Number(subId)) ? Number(subId) : null
        );
      }
      return booking;
    }
    const commissionRate = await getPlatformCommissionRate();
    const commission = calcCommission(cost, commissionRate);
    const providerNet = calcProviderNet(cost, commissionRate);
    const client = this.users.find((u: { id?: string }) => u.id === booking.userId);
    if (!client) throw new Error("Usuario cliente no encontrado");
    const clientPending = typeof (client as { pendingBalance?: number }).pendingBalance === "number" ? (client as { pendingBalance: number }).pendingBalance : 0;
    if (!isOffPlatform && clientPending < cost) throw new Error("Fondos en espera del cliente insuficientes para este servicio");

    const provider = this.providers.find((p: { id?: number }) => p.id === booking.providerId);
    if (!provider) throw new Error("Profesional no encontrado");
    const providerUserId = (provider as { userId?: string }).userId;
    if (!providerUserId) throw new Error("Profesional sin usuario asociado");
    const providerUser = this.users.find((u: { id?: string }) => u.id === providerUserId);
    if (!providerUser) throw new Error("Usuario del profesional no encontrado");
    const providerWallet = typeof (providerUser as { wallet?: number }).wallet === "number" ? (providerUser as { wallet: number }).wallet : 0;
    const providerTotalEarnings = typeof (providerUser as { totalEarnings?: number }).totalEarnings === "number" ? (providerUser as { totalEarnings: number }).totalEarnings : 0;

    const adminUser = this.users.find((u: { role?: string }) => hasAdminPrivileges(u.role));
    if (!adminUser) throw new Error("No existe usuario admin o soporte TI para registrar la comisión de plataforma");
    const adminUserWallet = typeof (adminUser as { wallet?: number }).wallet === "number" ? (adminUser as { wallet: number }).wallet : 0;
    const adminUserTotalEarnings =
      typeof (adminUser as { totalEarnings?: number }).totalEarnings === "number" ? (adminUser as { totalEarnings: number }).totalEarnings : 0;

    if (!isOffPlatform) {
      (client as { pendingBalance: number }).pendingBalance = clientPending - cost;
      (providerUser as { wallet: number }).wallet = providerWallet + providerNet;
      (providerUser as { totalEarnings: number }).totalEarnings = providerTotalEarnings + providerNet;
      (adminUser as { wallet: number }).wallet = adminUserWallet + commission;
      (adminUser as { totalEarnings: number }).totalEarnings = adminUserTotalEarnings + commission;
    } else {
      if (FEATURE_OFF_PLATFORM_COMMISSION_ENABLED) {
        if (!canAffordOffPlatformCommission(providerWallet, commission)) {
          throw new Error(
            `No se puede completar: la comisión de plataforma te dejaría por debajo del límite de ${PROVIDER_WALLET_FLOOR_USD} USD. Recarga tu saldo o coordina pago con Saldo GenFeb.`
          );
        }
        (providerUser as { wallet: number }).wallet = providerWallet - commission;
        (providerUser as { totalEarnings: number }).totalEarnings = providerTotalEarnings + cost;
        (adminUser as { wallet: number }).wallet = adminUserWallet + commission;
        (adminUser as { totalEarnings: number }).totalEarnings = adminUserTotalEarnings + commission;
      } else {
        (providerUser as { totalEarnings: number }).totalEarnings = providerTotalEarnings + cost;
      }
    }
    const prevStatusForDemand = String(booking.status ?? "pending");
    (booking as { status: string }).status = "completed";
    (booking as { completedAt?: Date }).completedAt = new Date();
    const countDemandOnComplete = bookingTransitionCountsForMonthlySubcategoryDemand(
      prevStatusForDemand,
      "completed",
      (booking as { monthlyDemandStatsCounted?: boolean }).monthlyDemandStatsCounted === true
    );
    if (countDemandOnComplete) {
      (booking as { monthlyDemandStatsCounted?: boolean }).monthlyDemandStatsCounted = true;
      const svc = await this.getService(Number((booking as { serviceId?: number }).serviceId));
      const subId = (svc as { subcategoryId?: number | null } | undefined)?.subcategoryId;
      await this.incrementSubcategoryMonthlyBookingCount(
        subId != null && Number.isFinite(Number(subId)) ? Number(subId) : null
      );
    }

    const now = new Date();
    const refId = String(bookingId);

    if (!isOffPlatform) {
      const clientTransferRecord = {
        id: this.walletTransferIdCounter++,
        userId: booking.userId,
        fromUserId: null,
        amount: cost,
        transferType: "payment",
        status: "completed",
        description: "Pago por servicio",
        referenceId: refId,
        currency: "USD",
        createdAt: now,
      };
      this.walletTransfers.push(clientTransferRecord);
    }

    if (!isOffPlatform) {
      const providerTransferRecord = {
        id: this.walletTransferIdCounter++,
        userId: providerUserId,
        fromUserId: null,
        amount: providerNet,
        transferType: "service_payment",
        status: "completed",
        description: "Pago por servicio completado (neto)",
        referenceId: refId,
        currency: "USD",
        createdAt: now,
      };
      const commissionTransferRecord = {
        id: this.walletTransferIdCounter++,
        userId: adminUser.id,
        fromUserId: null,
        amount: commission,
        transferType: "service_payment",
        status: "completed",
        description: "Comisión de plataforma por servicio (Wallet)",
        referenceId: refId,
        currency: "USD",
        createdAt: now,
      };
      this.walletTransfers.push(providerTransferRecord);
      this.walletTransfers.push(commissionTransferRecord);
    } else if (FEATURE_OFF_PLATFORM_COMMISSION_ENABLED) {
      const providerTransferRecord = {
        id: this.walletTransferIdCounter++,
        userId: providerUserId,
        fromUserId: null,
        amount: commission,
        transferType: "service_payment",
        status: "completed",
        description: "Comisión de plataforma por servicio en efectivo o transferencia",
        referenceId: refId,
        currency: "USD",
        createdAt: now,
      };
      const commissionTransferRecord = {
        id: this.walletTransferIdCounter++,
        userId: adminUser.id,
        fromUserId: null,
        amount: commission,
        transferType: "service_payment",
        status: "completed",
        description: "Comisión de plataforma por servicio (fuera de wallet)",
        referenceId: refId,
        currency: "USD",
        createdAt: now,
      };
      this.walletTransfers.push(providerTransferRecord);
      this.walletTransfers.push(commissionTransferRecord);
    }

    return { ...booking, status: "completed" };
  }

  async applyMobilityRideSettlement(input: {
    rideId: string;
    riderUserId: string;
    driverUserId: string;
    estimatedUsd: number;
    paymentMethod: "genfeb" | "cash" | "bank_transfer";
  }): Promise<void> {
    const cost = roundToCents(
      typeof input.estimatedUsd === "number" ? input.estimatedUsd : Number(input.estimatedUsd) || 0
    );
    if (cost <= 0) throw new Error("Importe del viaje no definido");
    const commissionRate = await getPlatformCommissionRate();
    const commission = calcCommission(cost, commissionRate);
    const providerNet = calcProviderNet(cost, commissionRate);

    const adminUser = this.users.find((u: { role?: string }) => hasAdminPrivileges(u.role));
    if (!adminUser) throw new Error("No existe usuario admin o soporte TI para registrar la comisión de plataforma");
    const adminId = adminUser.id;
    const adminUserWallet = typeof (adminUser as { wallet?: number }).wallet === "number" ? (adminUser as { wallet: number }).wallet : 0;
    const adminUserTotalEarnings =
      typeof (adminUser as { totalEarnings?: number }).totalEarnings === "number" ? (adminUser as { totalEarnings: number }).totalEarnings : 0;

    const driverUser = this.users.find((u: { id?: string }) => u.id === input.driverUserId);
    if (!driverUser) throw new Error("Conductor no encontrado");
    const driverWallet = typeof (driverUser as { wallet?: number }).wallet === "number" ? (driverUser as { wallet: number }).wallet : 0;
    const driverEarnings = typeof (driverUser as { totalEarnings?: number }).totalEarnings === "number" ? (driverUser as { totalEarnings: number }).totalEarnings : 0;
    const driverTrips = typeof (driverUser as { completedTrips?: number }).completedTrips === "number" ? (driverUser as { completedTrips: number }).completedTrips : 0;

    const refId = `cargo:${input.rideId}`;
    const now = new Date();

    if (input.paymentMethod === "genfeb") {
      const rider = this.users.find((u: { id?: string }) => u.id === input.riderUserId);
      if (!rider) throw new Error("Pasajero no encontrado");
      const riderWallet = typeof (rider as { wallet?: number }).wallet === "number" ? (rider as { wallet: number }).wallet : 0;
      if (riderWallet < cost) throw new Error("Saldo insuficiente del pasajero (Saldo GenFeb).");
      (rider as { wallet: number }).wallet = riderWallet - cost;
      (driverUser as { wallet: number }).wallet = driverWallet + providerNet;
      (driverUser as { totalEarnings: number }).totalEarnings = driverEarnings + providerNet;
      (driverUser as { completedTrips: number }).completedTrips = driverTrips + 1;
      (adminUser as { wallet: number }).wallet = adminUserWallet + commission;
      (adminUser as { totalEarnings: number }).totalEarnings = adminUserTotalEarnings + commission;

      this.walletTransfers.push({
        id: this.walletTransferIdCounter++,
        userId: input.riderUserId,
        fromUserId: null,
        amount: cost,
        transferType: "payment",
        status: "completed",
        description: "Pago viaje Car Go (Saldo GenFeb)",
        referenceId: refId,
        currency: "USD",
        createdAt: now,
      });
      this.walletTransfers.push({
        id: this.walletTransferIdCounter++,
        userId: input.driverUserId,
        fromUserId: null,
        amount: providerNet,
        transferType: "service_payment",
        status: "completed",
        description: "Ingreso neto viaje Car Go",
        referenceId: refId,
        currency: "USD",
        createdAt: now,
      });
      this.walletTransfers.push({
        id: this.walletTransferIdCounter++,
        userId: adminId,
        fromUserId: null,
        amount: commission,
        transferType: "service_payment",
        status: "completed",
        description: "Comisión de plataforma (Car Go, genfeb)",
        referenceId: refId,
        currency: "USD",
        createdAt: now,
      });
    } else {
      if (FEATURE_OFF_PLATFORM_COMMISSION_ENABLED) {
        if (!canAffordOffPlatformCommission(driverWallet, commission)) {
          throw new Error(
            `No se puede completar: la comisión te dejaría por debajo del límite de ${PROVIDER_WALLET_FLOOR_USD} USD. Acepta viajes con Saldo GenFeb o recarga.`
          );
        }
        (driverUser as { wallet: number }).wallet = driverWallet - commission;
        (driverUser as { totalEarnings: number }).totalEarnings = driverEarnings + cost;
        (driverUser as { completedTrips: number }).completedTrips = driverTrips + 1;
        (adminUser as { wallet: number }).wallet = adminUserWallet + commission;
        (adminUser as { totalEarnings: number }).totalEarnings = adminUserTotalEarnings + commission;
        this.walletTransfers.push({
          id: this.walletTransferIdCounter++,
          userId: input.driverUserId,
          fromUserId: null,
          amount: commission,
          transferType: "service_payment",
          status: "completed",
          description: `Comisión de plataforma (Car Go, ${input.paymentMethod})`,
          referenceId: refId,
          currency: "USD",
          createdAt: now,
        });
        this.walletTransfers.push({
          id: this.walletTransferIdCounter++,
          userId: adminId,
          fromUserId: null,
          amount: commission,
          transferType: "service_payment",
          status: "completed",
          description: `Comisión de plataforma (Car Go, ${input.paymentMethod}) — plataforma`,
          referenceId: refId,
          currency: "USD",
          createdAt: now,
        });
      } else {
        (driverUser as { totalEarnings: number }).totalEarnings = driverEarnings + cost;
        (driverUser as { completedTrips: number }).completedTrips = driverTrips + 1;
      }
    }
  }

  async cancelBookingAndRefundClientEscrow(bookingId: number): Promise<any | undefined> {
    const booking = this.bookings.find(b => b.id === bookingId) as any;
    if (!booking) return undefined;

    // Si el cliente no confirmó el pago o es pago en efectivo, solo marcar cancelado.
    if (booking.confirmedByClient !== true || isOffPlatformServiceBookingPayment(booking.paymentMethod)) {
      (booking as { status: string }).status = "cancelled";
      (booking as { cancelledAt?: Date }).cancelledAt = new Date();
      return { ...booking, status: "cancelled" };
    }

    const cost = typeof booking.cost === "number" ? booking.cost : Number(booking.cost) || 0;
    if (cost <= 0) {
      (booking as { status: string }).status = "cancelled";
      (booking as { cancelledAt?: Date }).cancelledAt = new Date();
      return { ...booking, status: "cancelled" };
    }
    const client = this.users.find((u: { id?: string }) => u.id === booking.userId);
    if (!client) throw new Error("Usuario cliente no encontrado");
    const clientWallet = typeof (client as { wallet?: number }).wallet === "number" ? (client as { wallet: number }).wallet : 0;
    const clientPending = typeof (client as { pendingBalance?: number }).pendingBalance === "number" ? (client as { pendingBalance: number }).pendingBalance : 0;
    if (clientPending < cost) throw new Error("Fondos retenidos insuficientes para revertir el pago al cliente");

    (client as { wallet: number }).wallet = clientWallet + cost;
    (client as { pendingBalance: number }).pendingBalance = clientPending - cost;
    (booking as { status: string }).status = "cancelled";
    (booking as { cancelledAt?: Date }).cancelledAt = new Date();

    // Registrar movimiento en wallet_transfers para que el cliente vea el reembolso en "Movimientos".
    const now = new Date();
    const clientRefundTransferRecord = {
      id: this.walletTransferIdCounter++,
      userId: booking.userId,
      fromUserId: null,
      amount: cost,
      transferType: "recharge",
      status: "completed",
      description: "Reembolso por cancelación de servicio",
      referenceId: String(bookingId),
      currency: "USD",
      createdAt: now,
    };
    this.walletTransfers.push(clientRefundTransferRecord);

    return { ...booking, status: "cancelled" };
  }

  async updateBookingCost(id: number, cost: number): Promise<any | undefined> {
    const booking = this.bookings.find(b => b.id === id);
    if (!booking) return undefined;
    (booking as { cost?: number }).cost = Number(cost);
    (booking as { pendingClientAcknowledgment?: boolean }).pendingClientAcknowledgment = true;
    return booking;
  }

  async updateBookingSchedule(id: number, date: Date): Promise<any | undefined> {
    const booking = this.bookings.find(b => b.id === id);
    if (!booking) return undefined;
    (booking as { date?: Date }).date = date;
    (booking as { pendingClientAcknowledgment?: boolean }).pendingClientAcknowledgment = true;
    return booking;
  }

  async acknowledgeBookingProChanges(bookingId: number, clientUserId: string): Promise<any | undefined> {
    const booking = this.bookings.find(b => b.id === bookingId);
    if (!booking) return undefined;
    if ((booking as { userId?: string }).userId !== clientUserId) return undefined;
    (booking as { pendingClientAcknowledgment?: boolean }).pendingClientAcknowledgment = false;
    return booking;
  }

  async confirmBookingByClient(bookingId: number): Promise<any> {
    const booking = this.bookings.find(b => b.id === bookingId) as { status?: string; userId?: string; providerId?: number; cost?: number; confirmedByClient?: boolean } | undefined;
    if (!booking) throw new Error("Reserva no encontrada");
    if ((booking.status || "pending") !== "confirmed") {
      throw new Error("Solo puedes confirmar el pago cuando el profesional haya confirmado la reserva");
    }
    if (booking.confirmedByClient === true) throw new Error("Esta reserva ya fue confirmada por el cliente");
    const cost = typeof booking.cost === "number" ? booking.cost : Number(booking.cost) || 0;
    const clientUserId = booking.userId;
    const providerId = booking.providerId;
    if (!clientUserId) throw new Error("Reserva sin cliente asociado");
    if (providerId == null) throw new Error("Reserva sin profesional asociado");

    if (cost <= 0) {
      (booking as { confirmedByClient: boolean }).confirmedByClient = true;
      return { ...booking, confirmedByClient: true };
    }

    if (isOffPlatformServiceBookingPayment((booking as { paymentMethod?: string }).paymentMethod)) {
      (booking as { confirmedByClient: boolean }).confirmedByClient = true;
      return { ...booking, confirmedByClient: true };
    }

    const client = this.users.find((u: { id?: string }) => u.id === clientUserId);
    if (!client) throw new Error("Usuario cliente no encontrado");
    const clientWallet = typeof (client as { wallet?: number }).wallet === "number" ? (client as { wallet: number }).wallet : 0;
    const clientPending = typeof (client as { pendingBalance?: number }).pendingBalance === "number" ? (client as { pendingBalance: number }).pendingBalance : 0;
    if (clientWallet < cost) throw new Error("Saldo insuficiente. Añade saldo a tu Saldo Genfeb para confirmar el pago.");

    (client as { wallet: number }).wallet = clientWallet - cost;
    (client as { pendingBalance: number }).pendingBalance = clientPending + cost;
    (booking as { confirmedByClient: boolean }).confirmedByClient = true;
    return { ...booking, confirmedByClient: true };
  }

  // ============== PAGOS ==============
  
  async getPaymentsByUser(userId: string): Promise<any[]> {
    return this.payments.filter(p => p.clientId === userId || p.providerId === userId);
  }
  
  async getEscrowPayments(userId: string): Promise<any[]> {
    return this.payments.filter(p => 
      (p.clientId === userId || p.providerId === userId) && 
      p.status === 'held'
    );
  }
  
  async createEscrowPayment(payment: any): Promise<any> {
    const newPayment = { 
      ...payment, 
      id: this.paymentIdCounter++,
      status: 'pending',
      createdAt: new Date()
    };
    this.payments.push(newPayment);
    return newPayment;
  }
  
  async releaseEscrowPayment(paymentId: number, release: boolean, reason?: string): Promise<any> {
    const payment = this.payments.find(p => p.id === paymentId);
    if (payment) {
      payment.status = release ? 'released' : 'disputed';
      if (reason) payment.disputeReason = reason;
      if (release) payment.releasedAt = new Date();
    }
    return payment;
  }
  
  async getUserBalance(userId: string): Promise<{ available: number; escrow: number; pending: number }> {
    const userPayments = this.payments.filter(p => 
      p.clientId === userId || p.providerId === userId
    );
    
    const completed = userPayments.filter(p => p.status === 'released');
    const escrow = userPayments.filter(p => p.status === 'held');
    const pending = userPayments.filter(p => p.status === 'pending');
    
    return {
      available: completed.reduce((sum, p) => sum + Number(p.amount), 0),
      escrow: escrow.reduce((sum, p) => sum + Number(p.amount), 0),
      pending: pending.reduce((sum, p) => sum + Number(p.amount), 0)
    };
  }

  // ============== DOCUMENTOS ==============
  
  async getDocumentsByUser(userId: string, type?: string): Promise<any[]> {
    let result = this.documents.filter(d => d.userId === userId);
    if (type) {
      result = result.filter(d => d.type === type);
    }
    return result;
  }
  
  async createDocument(doc: any): Promise<any> {
    const newDoc = { 
      ...doc, 
      id: this.documentIdCounter++,
      uploadedAt: new Date()
    };
    this.documents.push(newDoc);
    return newDoc;
  }
  
  async deleteDocument(id: number, userId: string): Promise<void> {
    const index = this.documents.findIndex(d => d.id === id && d.userId === userId);
    if (index >= 0) {
      this.documents.splice(index, 1);
    }
  }

  // ============== CONVERSACIONES ==============
  
  private serviceChatHideAtMs(c: any): number | null {
    const t = c?.serviceChatHideFromUsersAt;
    if (t == null) return null;
    if (t instanceof Date) return t.getTime();
    if (typeof t?.getTime === "function") return t.getTime();
    if (typeof t === "number") return t;
    if (typeof t === "string") {
      const d = new Date(t);
      return Number.isNaN(d.getTime()) ? null : d.getTime();
    }
    return null;
  }

  async getConversationsByUser(userId: string): Promise<any[]> {
    const uid = String(userId ?? "");
    const now = Date.now();
    return this.conversations.filter((c: any) => {
      if (c.participant1Id !== uid && c.participant2Id !== uid) return false;
      const hiddenFor = Array.isArray(c.hiddenForUserIds) ? c.hiddenForUserIds.map((x: any) => String(x)) : [];
      if (hiddenFor.includes(uid)) return false;
      const hideMs = this.serviceChatHideAtMs(c);
      if (hideMs != null && now > hideMs) return false;
      return true;
    });
  }
  
  async createConversation(conv: any): Promise<any> {
    const newConv = { 
      ...conv, 
      id: this.conversationIdCounter++,
      createdAt: new Date(),
      lastMessageAt: new Date(),
      hiddenForUserIds: [],
    };
    this.conversations.push(newConv);
    return newConv;
  }
  
  private messageCreatedAtTime(m: any): number {
    const t = m?.createdAt;
    if (t instanceof Date) return t.getTime();
    if (typeof t?.toMillis === "function") return t.toMillis();
    if (typeof t?.getTime === "function") return t.getTime();
    if (typeof t === "number") return t;
    return 0;
  }

  async getMessagesByConversation(conversationId: number, options: { limit: number; before?: number }): Promise<{ messages: any[]; hasMore: boolean }> {
    const { limit, before } = options;
    let list = this.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => this.messageCreatedAtTime(a) - this.messageCreatedAtTime(b));
    if (before != null) {
      list = list.filter((m) => this.messageCreatedAtTime(m) < before);
    }
    const hasMore = list.length > limit;
    const messages = list.slice(-limit);
    return { messages, hasMore };
  }

  async getLastMessageByConversation(conversationId: number): Promise<any | null> {
    const list = this.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => this.messageCreatedAtTime(b) - this.messageCreatedAtTime(a));
    return list.length > 0 ? list[0] : null;
  }

  async getUnreadCountByConversation(conversationId: number, userId: string): Promise<number> {
    return this.messages.filter((m) => {
      if (m.conversationId !== conversationId) return false;
      if (m.type === "system" || m.senderId === CHAT_SYSTEM_SENDER_ID) return false;
      return m.senderId !== userId && m.status !== "read";
    }).length;
  }
  
  async createMessage(msg: any): Promise<any> {
    const newMsg = { 
      ...msg, 
      id: this.messageIdCounter++,
      createdAt: new Date()
    };
    this.messages.push(newMsg);
    
    // Actualizar última mensaje de conversación
    const conv = this.conversations.find(c => c.id === msg.conversationId);
    if (conv) {
      conv.lastMessageAt = new Date();
    }
    
    return newMsg;
  }
  
  async markMessageAsRead(messageId: number): Promise<void> {
    const msg = this.messages.find(m => m.id === messageId);
    if (msg) {
      msg.status = 'read';
      msg.readAt = new Date();
    }
  }

  async markConversationAsRead(conversationId: number, userId: string): Promise<void> {
    this.messages
      .filter(
        (m) =>
          m.conversationId === conversationId &&
          m.senderId !== userId &&
          m.status !== "read" &&
          m.type !== "system" &&
          m.senderId !== CHAT_SYSTEM_SENDER_ID
      )
      .forEach(m => {
        m.status = 'read';
        (m as any).readAt = new Date();
      });
  }

  async hideConversationForUsers(conversationId: number, userIds: string[]): Promise<void> {
    const id = Number(conversationId);
    if (!Number.isFinite(id) || id <= 0) return;
    const conv = this.conversations.find((c: any) => Number(c?.id) === id);
    if (!conv) return;
    const next = new Set<string>(
      Array.isArray((conv as any).hiddenForUserIds) ? (conv as any).hiddenForUserIds.map((x: any) => String(x)) : [],
    );
    for (const u of userIds ?? []) {
      const s = String(u ?? "").trim();
      if (s) next.add(s);
    }
    (conv as any).hiddenForUserIds = Array.from(next);
    (conv as any).hiddenAt = new Date();
  }

  async patchConversation(conversationId: number, patch: Record<string, unknown>): Promise<void> {
    const id = Number(conversationId);
    if (!Number.isFinite(id) || id <= 0) return;
    const conv = this.conversations.find((c: any) => Number(c?.id) === id);
    if (!conv) return;
    Object.assign(conv, patch);
  }

  async sweepStaleMobilityRideChats(): Promise<number> {
    const now = Date.now();
    let n = 0;
    for (const conv of this.conversations) {
      if (String((conv as any).kind ?? "") !== "mobility_ride") continue;
      if ((conv as any).mobilityRideCompleted === true) continue;
      const hideMs = this.serviceChatHideAtMs(conv);
      const created = (conv as any).createdAt instanceof Date ? (conv as any).createdAt.getTime() : now;
      const expired =
        (hideMs != null && now > hideMs) ||
        (hideMs == null && now > created + 24 * 60 * 60 * 1000);
      if (!expired) continue;
      const hideAt = hideMs != null ? new Date(hideMs) : new Date(created + 24 * 60 * 60 * 1000);
      Object.assign(conv, {
        messagesLocked: true,
        serviceChatHideFromUsersAt: hideAt,
        mobilityRideInProgress: false,
      });
      n += 1;
    }
    return n;
  }

  async findConversationForServiceBooking(booking: {
    id: number;
    userId?: string;
    providerId?: number;
    serviceId?: number;
  }): Promise<any | null> {
    const bid = Number(booking.id);
    const byBooking = this.conversations.find((c: any) => Number(c?.bookingId) === bid);
    if (byBooking) return byBooking;
    return null;
  }

  async listConversationsForAdmin(opts?: { limit?: number }): Promise<any[]> {
    const lim = Math.min(Math.max(Number(opts?.limit) || 200, 1), 500);
    const sorted = [...this.conversations].sort((a: any, b: any) => {
      const ta = a.lastMessageAt instanceof Date ? a.lastMessageAt.getTime() : 0;
      const tb = b.lastMessageAt instanceof Date ? b.lastMessageAt.getTime() : 0;
      return tb - ta;
    });
    return sorted.slice(0, lim);
  }

  // ============== ROLES ==============
  
  async getUserRole(userId: string): Promise<any | undefined> {
    return this.userRoles.find(r => r.userId === userId);
  }
  
  async updateUserRole(userId: string, data: any): Promise<any> {
    const existingRole = this.userRoles.find(r => r.userId === userId);
    if (existingRole) {
      Object.assign(existingRole, data, { updatedAt: new Date() });
      return existingRole;
    } else {
      const newRole = { 
        userId, 
        role: data.role || 'client',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };
      this.userRoles.push(newRole);
      return newRole;
    }
  }

  // ============== DEFINICIÓN DE ROLES (CRUD) ==============
  private roleDefinitions: RoleDefinition[] = [
    { code: "admin", name: "Administrador", description: "Acceso total al sistema", isSystem: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    { code: "professional", name: "Profesional", description: "Asociado de servicios", isSystem: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
    { code: "client", name: "Cliente", description: "Usuario que contrata servicios", isSystem: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
    { code: "tiSupport", name: "Soporte TI", description: "Soporte técnico interno", isSystem: true, sortOrder: 4, createdAt: new Date(), updatedAt: new Date() },
  ];

  async getRoles(): Promise<RoleDefinition[]> {
    return [...this.roleDefinitions].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  }

  async getRoleByCode(code: string): Promise<RoleDefinition | undefined> {
    return this.roleDefinitions.find(r => r.code === code);
  }

  async createRole(role: NewRoleDefinition): Promise<RoleDefinition> {
    const existing = this.roleDefinitions.find(r => r.code === role.code);
    if (existing) throw new Error("Ya existe un rol con ese código");
    const normalized = role.code.trim().toLowerCase().replace(/\s+/g, "_");
    const newRole: RoleDefinition = {
      ...role,
      code: normalized,
      isSystem: false,
      sortOrder: role.sortOrder ?? 99,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.roleDefinitions.push(newRole);
    return newRole;
  }

  async updateRole(code: string, data: Partial<RoleDefinition>): Promise<RoleDefinition | undefined> {
    const idx = this.roleDefinitions.findIndex(r => r.code === code);
    if (idx === -1) return undefined;
    const { code: _c, ...rest } = data as Partial<RoleDefinition> & { code?: string };
    this.roleDefinitions[idx] = { ...this.roleDefinitions[idx], ...rest, updatedAt: new Date() };
    return this.roleDefinitions[idx];
  }

  async deleteRole(code: string): Promise<void> {
    const role = this.roleDefinitions.find(r => r.code === code);
    if (role?.isSystem) throw new Error("No se puede eliminar un rol del sistema");
    this.roleDefinitions = this.roleDefinitions.filter(r => r.code !== code);
  }

  async seedRoles(): Promise<void> {
    const defaults: RoleDefinition[] = [
      { code: "admin", name: "Administrador", description: "Acceso total al sistema", isSystem: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
      { code: "professional", name: "Profesional", description: "Asociado de servicios", isSystem: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
      { code: "client", name: "Cliente", description: "Usuario que contrata servicios", isSystem: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
      { code: "tiSupport", name: "Soporte TI", description: "Soporte técnico interno", isSystem: true, sortOrder: 4, createdAt: new Date(), updatedAt: new Date() },
    ];
    const existing = new Set(this.roleDefinitions.map((r) => r.code));
    for (const r of defaults) {
      if (!existing.has(r.code)) {
        this.roleDefinitions.push({ ...r, createdAt: new Date(), updatedAt: new Date() });
        existing.add(r.code);
      }
    }
  }

  // ============== REPORTES FINANCIEROS ==============
  private financialReports: any[] = [];
  private financialReportIdCounter = 1;

  async getFinancialReports(userId: string, period?: string): Promise<any[]> {
    return this.financialReports.filter(r => r.userId === userId);
  }

  async createFinancialReport(data: any): Promise<any> {
    const report = {
      id: this.financialReportIdCounter++,
      ...data,
      createdAt: data.createdAt || new Date(),
    };
    this.financialReports.push(report);
    return report;
  }

  async updateFinancialReportStatus(id: number | string, status: string): Promise<void> {
    // In memory id is number, but we convert because Firestore uses string
    const report = this.financialReports.find(r => String(r.id) === String(id));
    if (report) {
      report.status = status;
      report.updatedAt = new Date();
      if (status === "completed") report.approvedAt = new Date();
    }
  }

  async getKPIs(_userId: string): Promise<any> {
    return {
      totalIncome: 45280,
      totalExpenses: 12400,
      completedServices: 156,
      activeClients: 89,
      pendingBookings: 23,
      monthlyGrowth: 12.5,
      averageRating: 4.9
    };
  }

  // ============== NOTIFICACIONES ==============
  
  async getNotifications(userId: string, unreadOnly?: boolean): Promise<any[]> {
    let result = this.notifications.filter(n => n.userId === userId);
    if (unreadOnly) {
      result = result.filter(n => !n.read);
    }
    return result.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  private notificationIdCounter = 1;

  async createNotification(notification: { userId: string; type: string; data: Record<string, unknown> }): Promise<any> {
    const id = this.notificationIdCounter++;
    const created = {
      id,
      userId: notification.userId,
      type: notification.type,
      data: notification.data,
      read: false,
      createdAt: new Date(),
    };
    this.notifications.push(created);
    return created;
  }

  async markNotificationAsRead(notificationId: number): Promise<void> {
    const notif = this.notifications.find(n => n.id === notificationId);
    if (notif) {
      notif.read = true;
      notif.readAt = new Date();
    }
  }

  async markAllNotificationsAsReadForUser(userId: string): Promise<void> {
    const now = new Date();
    for (const n of this.notifications) {
      if (n.userId === userId && !n.read) {
        n.read = true;
        n.readAt = now;
      }
    }
  }

  // ============== PETICIONES DE CAMBIO DE CUENTA ==============

  async createAccountChangeRequest(input: {
    userId: string;
    field: "email" | "name" | "phone" | "vehicle";
    reason: string;
    proposal?: unknown;
  }): Promise<any> {
    const userId = String(input.userId ?? "").trim();
    const field = input.field;
    const reason = String(input.reason ?? "").trim();
    if (!userId) throw new Error("userId requerido");
    if (!["email", "name", "phone", "vehicle"].includes(field)) throw new Error("field inválido");
    if (!reason) throw new Error("reason requerido");
    if (field === "vehicle") {
      if (this.accountChangeRequests.some((r) => r.userId === userId && r.status === "pending" && r.field === "vehicle")) {
        throw new Error("Ya tienes una solicitud de vehículo pendiente.");
      }
    }

    const created = {
      id: this.accountChangeRequestIdCounter++,
      userId,
      field,
      reason,
      status: "pending" as const,
      createdAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
      ...(field === "vehicle" && input.proposal != null ? { proposal: input.proposal } : {}),
    };
    this.accountChangeRequests.unshift(created);
    return created;
  }

  async getMyAccountChangeRequests(userId: string): Promise<any[]> {
    const uid = String(userId ?? "").trim();
    return this.accountChangeRequests.filter((r) => r.userId === uid);
  }

  async getPendingAccountChangeRequests(): Promise<any[]> {
    return this.accountChangeRequests.filter((r) => r.status === "pending");
  }

  async resolveAccountChangeRequest(args: { id: number; action: "approve" | "reject"; adminUserId: string }): Promise<any> {
    const id = Number(args.id);
    const action = args.action;
    const adminUserId = String(args.adminUserId ?? "").trim();
    if (!Number.isFinite(id)) throw new Error("id inválido");
    if (!adminUserId) throw new Error("adminUserId requerido");
    if (action !== "approve" && action !== "reject") throw new Error("action inválido");

    const idx = this.accountChangeRequests.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error("Petición no encontrada");
    const req = this.accountChangeRequests[idx];
    if (req.status !== "pending") throw new Error("La petición ya fue resuelta");

    const now = new Date();
    const nextStatus = action === "approve" ? "approved" : "rejected";
    const updated = { ...req, status: nextStatus, resolvedAt: now, resolvedBy: adminUserId };
    this.accountChangeRequests[idx] = updated;
    return updated;
  }

  // ============== MANGO SYNC ==============
  
  async syncWithMango(userId: string, mangoUserId: string): Promise<any> {
    const existing = this.mangoSyncs.find(s => s.localUserId === userId);
    if (existing) {
      existing.mangoUserId = mangoUserId;
      existing.lastSyncAt = new Date();
      existing.syncStatus = 'completed';
      return existing;
    }
    
    const newSync = {
      id: this.mangoSyncs.length + 1,
      userId,
      mangoUserId,
      lastSyncAt: new Date(),
      syncStatus: 'completed',
      syncData: { contacts: true, bookings: true, payments: true }
    };
    this.mangoSyncs.push(newSync);
    return newSync;
  }
  
  async getMangoSyncStatus(userId: string): Promise<any | undefined> {
    return this.mangoSyncs.find(s => s.localUserId === userId);
  }

  // ============== EXISTENTES ==============
  
  async getCategories(): Promise<Category[]> {
    /** Misma noción de categorías que el seed / Firestore; BecomePro filtra por slugs de DEFAULT_CATEGORIES. */
    return DEFAULT_CATEGORIES.map((c, i) => ({
      id: i + 1,
      name: c.name,
      slug: c.slug,
      type: c.type,
      icon: c.icon,
      imageUrl: c.imageUrl ?? null,
    })) as Category[];
  }

  async updateCategory(_id: number, _data: Partial<Category>): Promise<Category | undefined> {
    return undefined; // Dummy implementation
  }

  async getSubcategories(_categoryId: number): Promise<import("./storage-contracts").Subcategory[]> {
    return [];
  }

  async getSubcategoryById(_id: number): Promise<import("./storage-contracts").Subcategory | undefined> {
    return undefined;
  }

  async createSubcategory(data: Omit<import("./storage-contracts").Subcategory, "id">): Promise<import("./storage-contracts").Subcategory> {
    return { id: 999, ...data } as import("./storage-contracts").Subcategory;
  }

  async updateSubcategory(_id: number, _data: Partial<import("./storage-contracts").Subcategory>): Promise<import("./storage-contracts").Subcategory | undefined> {
    return undefined;
  }

  async getAllProviders(profession?: string, category?: string, categoryId?: number): Promise<Provider[]> {
    let list = this.providers;
    if (profession) {
      list = list.filter((p) => p.profession.toLowerCase().includes(profession.toLowerCase()));
    }
    if (categoryId != null && !Number.isNaN(categoryId)) {
      list = list.filter((p) => (p as any).categoryId === categoryId);
    } else if (category) {
      list = list.filter((p) => (p as any).category === category);
    }
    return list;
  }

  async getProvider(id: number | null | undefined): Promise<Provider | undefined> {
    if (id == null || Number.isNaN(Number(id))) return undefined;
    return this.providers.find(p => p.id === Number(id));
  }

  async getProviderByUserId(userId: string): Promise<Provider | undefined> {
    return this.providers.find(p => p.userId === userId);
  }

  async createProvider(insertProvider: InsertProvider): Promise<Provider> {
    const prepMerged =
      (insertProvider as { preparationLevel?: string | null }).preparationLevel?.trim() ||
      (insertProvider as { coursesCompleted?: string | null }).coursesCompleted?.trim() ||
      null;
    const newProvider = {
      id: this.providerIdCounter++,
      userId: insertProvider.userId,
      categoryId: (insertProvider as any).categoryId ?? null,
      category: insertProvider.category ?? null,
      subcategoryId: (insertProvider as any).subcategoryId ?? null,
      goBrands: (insertProvider as any).goBrands ?? null,
      goDriverOfferTitle: (insertProvider as any).goDriverOfferTitle ?? null,
      goDriverOfferDescription: (insertProvider as any).goDriverOfferDescription ?? null,
      dispatchCompanyId: (insertProvider as any).dispatchCompanyId ?? null,
      preparationLevel: prepMerged,
      coursesCompleted: prepMerged,
      certifications: (insertProvider as { certifications?: string | null }).certifications ?? null,
      profession: insertProvider.profession,
      bio: insertProvider.bio || "",
      yearsExperience: insertProvider.yearsExperience || 0,
      hourlyRate: insertProvider.hourlyRate || null,
      isVerified: false,
      rating: "0",
      reviewCount: 0,
      skills: (insertProvider as { skills?: string[] }).skills ?? [],
      createdAt: new Date(),
    };
    this.providers.push(newProvider);
    return newProvider as Provider;
  }

  async createProviderVehicle(input: {
    providerId: number;
    userId: string;
    vehicle: import("@shared/vehicle-schema").InsertProviderVehicle;
  }): Promise<{ id: number }> {
    const id = this.vehicleIdCounter++;
    this.vehicles.push({ id, ...input, vehicle: input.vehicle });
    return { id };
  }

  async getPrimaryVehicleByProviderId(providerId: number): Promise<{
    vehicle_type: string;
    brand?: string | null;
    model?: string | null;
    license_plate?: string | null;
    model_year?: number | null;
    is_pet_friendly?: boolean;
  } | null> {
    const row = this.vehicles.find(
      (v: { providerId?: number; vehicle?: import("@shared/vehicle-schema").InsertProviderVehicle }) =>
        v.providerId === providerId
    );
    const veh = row?.vehicle;
    const vt = veh?.vehicle_type;
    if (typeof vt !== "string") return null;
    return {
      vehicle_type: vt,
      brand: veh.brand ?? null,
      model: veh.model ?? null,
      license_plate: veh.license_plate ?? null,
      model_year: veh.model_year ?? null,
      is_pet_friendly: !!veh.is_pet_friendly,
    };
  }

  async getPrimaryVehicleByUserId(userId: string): Promise<{
    vehicle_type: string;
    brand?: string | null;
    model?: string | null;
    license_plate?: string | null;
    model_year?: number | null;
    is_pet_friendly?: boolean;
  } | null> {
    const row = this.vehicles.find((v: { userId?: string }) => v.userId === userId);
    const veh = row?.vehicle as import("@shared/vehicle-schema").InsertProviderVehicle | undefined;
    if (!veh) return null;
    const vt = veh.vehicle_type;
    if (typeof vt !== "string") return null;
    return {
      vehicle_type: vt,
      brand: veh.brand ?? null,
      model: veh.model ?? null,
      license_plate: veh.license_plate ?? null,
      model_year: veh.model_year ?? null,
      is_pet_friendly: !!veh.is_pet_friendly,
    };
  }

  async getPrimaryVehicleFullByUserId(userId: string): Promise<Record<string, unknown> | null> {
    const row = this.vehicles.find((v: { userId?: string }) => v.userId === userId);
    if (!row) return null;
    const veh = row.vehicle as import("@shared/vehicle-schema").InsertProviderVehicle | undefined;
    if (!veh) return null;
    return {
      id: row.id,
      providerId: row.providerId,
      userId: row.userId,
      ...veh,
    };
  }

  async upsertPrimaryProviderVehicle(input: {
    providerId: number;
    userId: string;
    vehicle: import("@shared/vehicle-schema").InsertProviderVehicle;
  }): Promise<{ id: number }> {
    const idx = this.vehicles.findIndex(
      (v: { userId?: string; providerId?: number }) => v.userId === input.userId && v.providerId === input.providerId
    );
    if (idx !== -1) {
      const id = this.vehicles[idx].id;
      this.vehicles[idx] = { ...this.vehicles[idx], vehicle: input.vehicle };
      return { id };
    }
    const j = this.vehicles.findIndex((v: { userId?: string }) => v.userId === input.userId);
    if (j !== -1) {
      const id = this.vehicles[j].id;
      this.vehicles[j] = { ...this.vehicles[j], providerId: input.providerId, vehicle: input.vehicle };
      return { id };
    }
    return this.createProviderVehicle(input);
  }

  async updateProvider(id: number, data: import("./storage-contracts").ProviderUpdate): Promise<Provider | undefined> {
    const idx = this.providers.findIndex(p => p.id === id);
    if (idx === -1) return undefined;
    const current = this.providers[idx] as any;
    const updated = { ...current, ...data };
    this.providers[idx] = updated;
    return updated as Provider;
  }

  async deleteProvider(id: number): Promise<boolean> {
    const idx = this.providers.findIndex(p => p.id === id);
    if (idx === -1) return false;
    this.providers.splice(idx, 1);
    return true;
  }

  private providers: any[] = [];
  private providerIdCounter = 1;
  private vehicles: any[] = [];
  private vehicleIdCounter = 1;

  async getAllServices(
    _categoryId?: number,
    _search?: string,
    _providerCategoryId?: number,
    _subcategoryId?: number,
    _includeUnverifiedForAdmin?: boolean
  ): Promise<ServiceWithProvider[]> {
    return [];
  }

  async getService(
    _id: number,
    _options?: { includeWhenListingUnpublished?: boolean },
  ): Promise<ServiceWithProvider | undefined> {
    return undefined;
  }

  async getServicesByProviderId(_providerId: number): Promise<ServiceWithProvider[]> {
    return [];
  }

  async createService(service: InsertService): Promise<Service> {
    return {} as Service;
  }

  async updateService(
    _id: number,
    _data: import("./storage-contracts").ServiceUpdate
  ): Promise<Service | undefined> {
    return undefined;
  }

  async deleteService(_id: number): Promise<boolean> {
    return false;
  }

  async seedCategories(): Promise<{ created: string[] }> {
    return { created: [] };
  }
  
  // ==================== ESTADOS DE RESERVA ====================
  
  private bookingStatuses: any[] = [
    { id: 1, name: "Nueva", type: 1, color: "#3B82F6", icon: "sparkles", isDefault: true, isSystem: true, sortOrder: 1 },
    { id: 2, name: "Confirmada", type: 1, color: "#8B5CF6", icon: "check-circle", isSystem: true, sortOrder: 2 },
    { id: 3, name: "En Proceso", type: 2, color: "#F59E0B", icon: "loader", isSystem: true, sortOrder: 3 },
    { id: 4, name: "Completada", type: 3, color: "#10B981", icon: "check", isDefault: true, isSystem: true, sortOrder: 4 },
    { id: 5, name: "Cancelada", type: 4, color: "#EF4444", icon: "x-circle", isDefault: true, isSystem: true, sortOrder: 5 },
  ];
  private bookingStatusIdCounter = 6;
  
  async getBookingStatuses(): Promise<any[]> {
    return this.bookingStatuses.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  
  async createBookingStatus(status: any): Promise<any> {
    const newStatus = {
      id: this.bookingStatusIdCounter++,
      ...status,
      isSystem: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.bookingStatuses.push(newStatus);
    return newStatus;
  }
  
  async updateBookingStatusCustom(id: number, data: any): Promise<any | undefined> {
    const index = this.bookingStatuses.findIndex(s => s.id === id);
    if (index === -1) return undefined;
    this.bookingStatuses[index] = { ...this.bookingStatuses[index], ...data, updatedAt: new Date() };
    return this.bookingStatuses[index];
  }
  
  async deleteBookingStatus(id: number): Promise<void> {
    const status = this.bookingStatuses.find(s => s.id === id);
    if (status?.isSystem) throw new Error("No se puede eliminar un estado del sistema");
    this.bookingStatuses = this.bookingStatuses.filter(s => s.id !== id);
  }
  
  // ==================== IMPUESTOS (TAXES) ====================
  
  private taxes: any[] = [
    { id: 1, name: "IVA 12%", description: "Impuesto al Valor Agregado", rate: "12.00", type: "percentage", isDefault: true, country: "Ecuador", region: "Nacional", isActive: true },
    { id: 2, name: "IVA 0%", description: "Tarifa 0%", rate: "0.00", type: "percentage", isDefault: false, country: "Ecuador", region: "Nacional", isActive: true },
  ];
  private taxIdCounter = 3;
  
  async getTaxes(): Promise<any[]> {
    return this.taxes.filter(t => t.isActive);
  }
  
  async createTax(tax: any): Promise<any> {
    const newTax = {
      id: this.taxIdCounter++,
      ...tax,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.taxes.push(newTax);
    return newTax;
  }
  
  async updateTax(id: number, data: any): Promise<any | undefined> {
    const index = this.taxes.findIndex(t => t.id === id);
    if (index === -1) return undefined;
    this.taxes[index] = { ...this.taxes[index], ...data, updatedAt: new Date() };
    return this.taxes[index];
  }
  
  async deleteTax(id: number): Promise<void> {
    this.taxes = this.taxes.filter(t => t.id !== id);
  }
  
  async calculateTaxes(amount: number, taxIds: number[]): Promise<{ subtotal: number; taxes: any[]; total: number }> {
    const selectedTaxes = this.taxes.filter(t => taxIds.includes(t.id) && t.isActive);
    let totalTax = 0;
    const taxDetails = selectedTaxes.map(tax => {
      const taxAmount = (parseFloat(String(amount)) * parseFloat(String(tax.rate))) / 100;
      totalTax += taxAmount;
      return { name: tax.name, rate: tax.rate, amount: taxAmount };
    });
    return {
      subtotal: parseFloat(String(amount)),
      taxes: taxDetails,
      total: parseFloat(String(amount)) + totalTax
    };
  }
  
  // ==================== CUPONES / DESCUENTOS ====================
  
  private coupons: any[] = [
    { 
      id: 1, 
      code: "BIENVENIDO10", 
      description: "10% de descuento para nuevos usuarios", 
      discountType: "percentage", 
      discountValue: "10.00", 
      minAmount: "50.00", 
      maxDiscount: "50.00",
      maxUses: 100,
      usedCount: 5,
      usedByUsers: [],
      isActive: true,
      validFrom: new Date("2024-01-01"),
      validUntil: new Date("2026-12-31"),
      applicableServices: [],
      applicableCategories: []
    }
  ];
  private couponIdCounter = 2;
  
  // ==================== CÓDIGOS PROMOCIONALES ====================

  private promotionalCodes: any[] = [];
  private promotionalCodeIdCounter = 1;

  async getPromotionalCodes(): Promise<any[]> {
    return [...this.promotionalCodes];
  }

  async getPromotionalCodeById(id: number): Promise<any | undefined> {
    return this.promotionalCodes.find((p) => p.id === id);
  }

  async getPromotionalCodeByCode(code: string): Promise<any | undefined> {
    const normalized = code.trim().toUpperCase();
    return this.promotionalCodes.find((p) => String(p.code).toUpperCase() === normalized);
  }

  async createPromotionalCode(data: {
    code: string;
    expirationType: string;
    expiresAt?: Date | null;
    maxUses?: number | null;
    benefitType: string;
    benefitValue: string;
  }): Promise<any> {
    const existing = await this.getPromotionalCodeByCode(data.code);
    if (existing) throw new Error("Ya existe un código promocional con este identificador");

    const newCode = {
      id: this.promotionalCodeIdCounter++,
      code: data.code.trim().toUpperCase(),
      expirationType: data.expirationType,
      expiresAt: data.expiresAt ?? null,
      maxUses: data.maxUses ?? null,
      usedCount: 0,
      usedByUserCounts: {} as Record<string, number>,
      benefitType: data.benefitType,
      benefitValue: data.benefitValue,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.promotionalCodes.push(newCode);
    return newCode;
  }

  async updatePromotionalCode(
    id: number,
    data: {
      code: string;
      expirationType: string;
      expiresAt?: Date | null;
      maxUses?: number | null;
      benefitType: string;
      benefitValue: string;
    },
  ): Promise<any | undefined> {
    const index = this.promotionalCodes.findIndex((p) => p.id === id);
    if (index === -1) return undefined;

    this.promotionalCodes[index] = {
      ...this.promotionalCodes[index],
      code: data.code.trim().toUpperCase(),
      expirationType: data.expirationType,
      expiresAt: data.expiresAt ?? null,
      maxUses: data.maxUses ?? null,
      benefitType: data.benefitType,
      benefitValue: data.benefitValue,
      updatedAt: new Date(),
    };
    return this.promotionalCodes[index];
  }

  async deletePromotionalCode(id: number): Promise<void> {
    this.promotionalCodes = this.promotionalCodes.filter((p) => p.id !== id);
  }

  async incrementPromotionalCodeUsedCount(id: number, userId?: string): Promise<any | undefined> {
    const index = this.promotionalCodes.findIndex((p) => p.id === id);
    if (index === -1) return undefined;
    const promo = this.promotionalCodes[index];
    const uid = userId != null ? String(userId) : "";

    if (userHasRedeemedPromotionalCode(promo.usedByUserCounts, uid)) {
      throw new Error(PROMO_CODE_MSG_ALREADY_REDEEMED_BY_USER);
    }

    const nextCount = (promo.usedCount ?? 0) + 1;
    if (promo.expirationType === "por_usos" && promo.maxUses != null && nextCount > promo.maxUses) {
      throw new Error(PROMO_CODE_MSG_NO_LONGER_AVAILABLE);
    }

    const counts = { ...(promo.usedByUserCounts ?? {}) } as Record<string, number>;
    if (uid) counts[uid] = (counts[uid] ?? 0) + 1;

    this.promotionalCodes[index] = {
      ...promo,
      usedCount: nextCount,
      usedByUserCounts: counts,
      updatedAt: new Date(),
    };
    return this.promotionalCodes[index];
  }

  async getCoupons(userId: string): Promise<any[]> {
    return this.coupons;
  }
  
  async createCoupon(coupon: any): Promise<any> {
    const existingCode = this.coupons.find(c => c.code === coupon.code);
    if (existingCode) throw new Error("Ya existe un cupón con este código");
    
    const newCoupon = {
      id: this.couponIdCounter++,
      ...coupon,
      usedCount: 0,
      usedByUsers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.coupons.push(newCoupon);
    return newCoupon;
  }
  
  async updateCoupon(id: number, data: any): Promise<any | undefined> {
    const index = this.coupons.findIndex(c => c.id === id);
    if (index === -1) return undefined;
    this.coupons[index] = { ...this.coupons[index], ...data, updatedAt: new Date() };
    return this.coupons[index];
  }
  
  async deleteCoupon(id: number): Promise<void> {
    this.coupons = this.coupons.filter(c => c.id !== id);
  }
  
  async validateCoupon(code: string, serviceId?: number, categoryId?: number, amount?: number, userId?: string): Promise<{ valid: boolean; discount: number; message: string }> {
    const coupon = this.coupons.find(c => c.code === code.toUpperCase());
    
    if (!coupon) return { valid: false, discount: 0, message: "Cupón no encontrado" };
    if (!coupon.isActive) return { valid: false, discount: 0, message: "Cupón inactivo" };
    
    const now = new Date();
    if (coupon.validFrom && now < new Date(coupon.validFrom)) {
      return { valid: false, discount: 0, message: "Cupón aún no válido" };
    }
    if (coupon.validUntil && now > new Date(coupon.validUntil)) {
      return { valid: false, discount: 0, message: "Cupón expirado" };
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return { valid: false, discount: 0, message: "Cupón agotado" };
    }
    if (userId && coupon.usedByUsers.includes(userId)) {
      return { valid: false, discount: 0, message: "Ya has usado este cupón" };
    }
    if (amount && coupon.minAmount && amount < parseFloat(String(coupon.minAmount))) {
      return { valid: false, discount: 0, message: `Monto mínimo requerido: ${coupon.minAmount}` };
    }
    
    // Calcular descuento
    let discount = 0;
    if (coupon.discountType === "percentage") {
      discount = (amount || 0) * parseFloat(String(coupon.discountValue)) / 100;
      if (coupon.maxDiscount && discount > parseFloat(String(coupon.maxDiscount))) {
        discount = parseFloat(String(coupon.maxDiscount));
      }
    } else {
      discount = parseFloat(String(coupon.discountValue));
    }
    
    return { valid: true, discount, message: "Cupón aplicado correctamente" };
  }
  
  // ==================== SERVICIOS ADICIONALES (ADD-ONS) ====================
  
  private serviceAddons: any[] = [
    { id: 1, serviceId: 1, name: "Materiales adicionales", description: "Materiales extra para el servicio", price: "25.00", duration: 0, isActive: true },
    { id: 2, serviceId: 1, name: "Servicio express", description: "Servicio en menor tiempo", price: "35.00", duration: -30, isActive: true },
    { id: 3, serviceId: 2, name: "Asesoría adicional", description: "30 min extra de asesoría", price: "20.00", duration: 30, isActive: true },
  ];
  private addonIdCounter = 4;
  
  async getServiceAddons(serviceId: number): Promise<any[]> {
    return this.serviceAddons.filter(a => a.serviceId === serviceId && a.isActive);
  }
  
  async createServiceAddon(addon: any): Promise<any> {
    const newAddon = {
      id: this.addonIdCounter++,
      ...addon,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.serviceAddons.push(newAddon);
    return newAddon;
  }
  
  async updateServiceAddon(id: number, data: any): Promise<any | undefined> {
    const index = this.serviceAddons.findIndex(a => a.id === id);
    if (index === -1) return undefined;
    this.serviceAddons[index] = { ...this.serviceAddons[index], ...data, updatedAt: new Date() };
    return this.serviceAddons[index];
  }
  
  async deleteServiceAddon(id: number): Promise<void> {
    const addon = this.serviceAddons.find(a => a.id === id);
    if (addon) addon.isActive = false;
  }
  
  // ==================== RESERVAS CON ADD-ONS ====================
  
  private bookingAddons: any[] = [];
  private bookingAddonIdCounter = 1;
  
  async calculateBookingTotal(serviceId: number, addonIds: number[], couponCode?: string, userId?: string): Promise<any> {
    // Obtener precio del servicio
    const service = await this.getService(serviceId);
    if (!service) throw new Error("Servicio no encontrado");
    
    let subtotal = parseFloat(String(service.price));
    let addonsTotal = 0;
    const selectedAddons: any[] = [];
    
    // Calcular add-ons
    if (addonIds.length > 0) {
      const addons = this.serviceAddons.filter(a => addonIds.includes(a.id) && a.isActive);
      addonsTotal = addons.reduce((sum, a) => sum + parseFloat(String(a.price)), 0);
      selectedAddons.push(...addons);
    }
    
    subtotal += addonsTotal;
    
    // Aplicar cupón
    let discount = 0;
    if (couponCode) {
      const validation = await this.validateCoupon(couponCode, serviceId, service.categoryId, subtotal, userId);
      if (validation.valid) {
        discount = validation.discount;
      }
    }
    
    // Calcular impuestos (default IVA 12%)
    const taxCalculation = await this.calculateTaxes(subtotal - discount, [1]);
    
    // Acceder correctamente las propiedades del servicio
    const serviceName = (service as any)?.name || (service as any)?.provider?.user?.name || "Servicio";
    
    return {
      service: { id: service.id, name: serviceName, price: service.price },
      addons: selectedAddons,
      subtotal: subtotal,
      discount: discount,
      taxes: taxCalculation.taxes,
      taxAmount: taxCalculation.total - (subtotal - discount),
      total: taxCalculation.total,
      currency: "USD"
    };
  }
  
  async getBookingAddons(bookingId: number): Promise<any[]> {
    return this.bookingAddons.filter(a => a.bookingId === bookingId);
  }
  
  async addBookingAddon(bookingAddon: any): Promise<any> {
    const newBookingAddon = {
      id: this.bookingAddonIdCounter++,
      ...bookingAddon,
      createdAt: new Date(),
    };
    this.bookingAddons.push(newBookingAddon);
    return newBookingAddon;
  }
  
  // ==================== PAYMENT VOUCHERS ====================
  
  private paymentVouchers: any[] = [];
  private voucherIdCounter = 1;
  
  async createPaymentVoucher(data: {
    userId: string;
    bankId: string;
    bankName: string;
    bankAccount: string;
    voucherNumber: string;
    date: Date;
    time: string;
    amount: number;
    serviceName: string;
    notes?: string;
    status: string;
  }): Promise<any> {
    const voucher = {
      id: this.voucherIdCounter++,
      userId: data.userId,
      bankId: data.bankId,
      bankName: data.bankName,
      bankAccount: data.bankAccount,
      voucherNumber: data.voucherNumber,
      date: data.date,
      time: data.time,
      amount: data.amount,
      serviceName: data.serviceName,
      notes: data.notes,
      status: data.status,
      createdAt: new Date(),
    };
    this.paymentVouchers.push(voucher);
    return voucher;
  }
  
  async getFinancialReport(id: number | string): Promise<any | null> {
    const numericId = typeof id === "string" ? parseInt(id, 10) : id;
    if (isNaN(numericId)) return null;
    return this.financialReports.find(r => r.id === numericId) || null;
  }

  async getPaymentVouchersByUser(userId: string): Promise<any[]> {
    return this.paymentVouchers.filter(v => v.userId === userId);
  }
  
  async updatePaymentVoucherStatus(id: number, status: string): Promise<any | null> {
    const voucher = this.paymentVouchers.find(v => v.id === id);
    if (!voucher) return null;
    voucher.status = status;
    return voucher;
  }

  // ==================== WALLET & TRANSFERS (in-memory stub) ====================

  private walletTransfers: any[] = [];
  private walletTransferIdCounter = 1;

  async createTransfer(transfer: {
    userId: string;
    fromUserId?: string | null;
    amount: number;
    transferType: "service_payment" | "recharge";
    status?: "pending_approval" | "completed" | "rejected";
    description?: string;
    referenceId?: string;
    currency?: string;
  }): Promise<any> {
    const user = this.users.find((u: any) => u.id === transfer.userId);
    if (!user) throw new Error("Usuario no encontrado");
    const id = this.walletTransferIdCounter++;
    const resolvedStatus = transfer.status ?? (transfer.transferType === "recharge" ? "pending_approval" : "completed");
    const record = {
      id,
      userId: transfer.userId,
      fromUserId: transfer.fromUserId ?? null,
      amount: transfer.amount,
      transferType: transfer.transferType,
      status: resolvedStatus,
      description: transfer.description,
      referenceId: transfer.referenceId,
      currency: transfer.currency ?? "USD",
      createdAt: new Date(),
    };
    this.walletTransfers.push(record);
    // Solo se acredita al beneficiario (userId). fromUserId (admin) nunca se descuenta.
    const isServicePaymentCompleted = transfer.transferType === "service_payment" && resolvedStatus === "completed";
    const isManualRechargeCompleted = transfer.transferType === "recharge" && resolvedStatus === "completed";
    if (isServicePaymentCompleted) {
      user.wallet = (typeof user.wallet === "number" ? user.wallet : 0) + transfer.amount;
      user.totalEarnings = (typeof user.totalEarnings === "number" ? user.totalEarnings : 0) + transfer.amount;
    } else if (isManualRechargeCompleted) {
      user.wallet = (typeof user.wallet === "number" ? user.wallet : 0) + transfer.amount;
    }
    user.updatedAt = new Date();
    return record;
  }

  async getWalletTransfer(id: number | string): Promise<any | null> {
    const numericId = typeof id === "string" ? parseInt(id, 10) : id;
    if (isNaN(numericId)) return null;
    return this.walletTransfers.find(t => t.id === numericId) || null;
  }

  async getTransfersByUser(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      transferType?: "service_payment" | "recharge" | "withdrawal" | "payment";
      status?: "pending_approval" | "completed" | "rejected";
      description?: string;
      dateFrom?: string;
      dateTo?: string;
      amountMin?: number;
      amountMax?: number;
    }
  ): Promise<{ transfers: any[]; total: number }> {
    let list = this.walletTransfers.filter((t: any) => t.userId === userId);
    if (options?.transferType) list = list.filter((t: any) => t.transferType === options.transferType);
    if (options?.status) list = list.filter((t: any) => t.status === options.status);
    if (options?.description?.trim()) {
      const term = options.description.trim().toLowerCase();
      list = list.filter((t: any) => (t.description ?? "").toLowerCase().includes(term));
    }
    if (options?.dateFrom) {
      const from = new Date(options.dateFrom).getTime();
      list = list.filter((t: any) => new Date(t.createdAt).getTime() >= from);
    }
    if (options?.dateTo) {
      const to = new Date(options.dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((t: any) => new Date(t.createdAt).getTime() <= to.getTime());
    }
    if (options?.amountMin != null) {
      const min = options.amountMin;
      list = list.filter((t: any) => t.amount >= min);
    }
    if (options?.amountMax != null) {
      const max = options.amountMax;
      list = list.filter((t: any) => t.amount <= max);
    }
    list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = list.length;
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 10));
    const start = (page - 1) * limit;
    const transfers = list.slice(start, start + limit);
    return { transfers, total };
  }

  async getAllTransfers(): Promise<{ transfers: any[]; total: number }> {
    const list = [...this.walletTransfers].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return { transfers: list, total: list.length };
  }

  async getAdminDashboardStats(params: { from: Date; to: Date }): Promise<AdminDashboardStatsResult> {
    const { transfers } = await this.getAllTransfers();
    const pendingVerificationCount = await countVerificationsAwaitingAdminReview(this);
    const pendingWithdrawalRequestsCount = (await this.getUsersWithPendingWithdrawals()).length;
    return aggregateAdminDashboardStats(
      {
        users: this.users,
        bookings: this.bookings,
        services: [],
        transfers,
        pendingVerificationCount,
        pendingWithdrawalRequestsCount,
      },
      params
    );
  }

  async updateTransferStatus(
    transferId: string,
    status: "pending_approval" | "completed" | "rejected"
  ): Promise<any> {
    const id = parseInt(transferId, 10);
    if (Number.isNaN(id)) throw new Error("Transferencia no encontrada");
    const transfer = this.walletTransfers.find((t: any) => t.id === id);
    if (!transfer) throw new Error("Transferencia no encontrada");
    const currentStatus = transfer.status;
    const isRechargeCompleted =
      transfer.transferType === "recharge" && status === "completed" && currentStatus !== "completed";
    if (isRechargeCompleted) {
      const user = this.users.find((u: any) => u.id === transfer.userId);
      if (!user) throw new Error("Usuario no encontrado");
      user.wallet = (typeof user.wallet === "number" ? user.wallet : 0) + transfer.amount;
      user.updatedAt = new Date();
    }
    transfer.status = status;
    return transfer;
  }

  async getTotalPlatformBalance(): Promise<number> {
    return this.users.reduce((sum: number, u: any) => sum + (typeof u.wallet === "number" ? u.wallet : 0), 0);
  }

  /**
   * Fondos en Tránsito (escrow): debita wallet y acredita withdrawingFunds de forma atómica (en memoria es secuencial).
   * El monto en withdrawingFunds no puede ser movido por el usuario hasta que admin apruebe o rechace.
   */
  async requestWithdraw(
    userId: string,
    amount: number
  ): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, code: "invalid_amount", message: "El monto debe ser mayor a cero" };
    }
    const user = this.users.find((u: any) => u.id === userId);
    if (!user) return { ok: false, code: "user_not_found", message: "Usuario no encontrado" };
    const bankName = typeof user.bankName === "string" ? user.bankName.trim() : "";
    const accountNumber = typeof user.accountNumber === "string" ? user.accountNumber.trim() : "";
    if (!bankName || !accountNumber) {
      return { ok: false, code: "missing_bank_data", message: "Complete los datos bancarios (banco y número de cuenta) en su perfil." };
    }
    const wallet = typeof user.wallet === "number" ? user.wallet : 0;
    const withdrawingFunds = typeof user.withdrawingFunds === "number" ? user.withdrawingFunds : 0;
    if (withdrawingFunds > 0) {
      return { ok: false, code: "withdraw_pending", message: "Ya existe un retiro en proceso. Espere a que el administrador lo procese." };
    }
    if (wallet < amount) {
      return { ok: false, code: "insufficient_balance", message: "Saldo insuficiente" };
    }
    user.wallet = wallet - amount;
    user.withdrawingFunds = withdrawingFunds + amount;
    user.updatedAt = new Date();
    return { ok: true };
  }

  async getUsersWithPendingWithdrawals(): Promise<
    Array<{ id: string; name: string; lastName: string; email: string; bankName?: string; accountNumber?: string; withdrawingFunds: number }>
  > {
    return this.users
      .filter((u: any) => (typeof u.withdrawingFunds === "number" ? u.withdrawingFunds : 0) > 0)
      .map((u: any) => ({
        id: u.id,
        name: u.name ?? u.firstName ?? "",
        lastName: u.lastName ?? "",
        email: u.email ?? "",
        bankName: u.bankName,
        accountNumber: u.accountNumber,
        withdrawingFunds: typeof u.withdrawingFunds === "number" ? u.withdrawingFunds : 0,
      }));
  }

  /**
   * Liquidación (aprobación): withdrawingFunds se setea a 0 y se registra un movimiento en historial con status completed.
   * El monto NO se transfiere a ninguna cuenta de administrador: la deuda se saldó por transferencia bancaria externa manual.
   */
  async processWithdrawalApproval(userId: string, adminUserId: string): Promise<{ transfer: any; user: any }> {
    const user = this.users.find((u: any) => u.id === userId);
    if (!user) throw new Error("Usuario no encontrado");
    const withdrawingFunds = typeof user.withdrawingFunds === "number" ? user.withdrawingFunds : 0;
    if (withdrawingFunds <= 0) throw new Error("No hay retiro pendiente");
    const id = this.walletTransferIdCounter++;
    const bankName = typeof user.bankName === "string" ? user.bankName : undefined;
    const accountNumber = typeof user.accountNumber === "string" ? user.accountNumber : undefined;
    const record = {
      id,
      userId,
      fromUserId: adminUserId,
      amount: withdrawingFunds,
      transferType: "withdrawal",
      status: "completed",
      description: "Retiro Completado",
      referenceId: null,
      currency: "USD",
      createdAt: new Date(),
      bankName,
      accountNumber,
    };
    this.walletTransfers.push(record);
    user.withdrawingFunds = 0;
    user.updatedAt = new Date();
    return { transfer: record, user: { ...user } };
  }

  /**
   * Rollback (rechazo): el valor de withdrawingFunds regresa íntegramente al wallet del profesional; luego withdrawingFunds = 0.
   */
  async processWithdrawalRejection(userId: string): Promise<{ user: any; amount: number }> {
    const user = this.users.find((u: any) => u.id === userId);
    if (!user) throw new Error("Usuario no encontrado");
    const withdrawingFunds = typeof user.withdrawingFunds === "number" ? user.withdrawingFunds : 0;
    if (withdrawingFunds <= 0) throw new Error("No hay retiro pendiente");
    const wallet = typeof user.wallet === "number" ? user.wallet : 0;
    user.wallet = wallet + withdrawingFunds;
    user.withdrawingFunds = 0;
    user.updatedAt = new Date();
    return { user: { ...user }, amount: withdrawingFunds };
  }

  private withdrawalRejections: Array<{
    id: number;
    userId: string;
    amount: number;
    rejectedAt: Date;
    rejectedByUserId: string;
    bankName?: string;
    accountNumber?: string;
  }> = [];
  private withdrawalRejectionIdCounter = 1;

  async recordWithdrawalRejection(
    userId: string,
    amount: number,
    adminUserId: string,
    bankName?: string,
    accountNumber?: string
  ): Promise<void> {
    this.withdrawalRejections.push({
      id: this.withdrawalRejectionIdCounter++,
      userId,
      amount,
      rejectedAt: new Date(),
      rejectedByUserId: adminUserId,
      bankName,
      accountNumber,
    });
  }

  async getWithdrawalHistory(options: {
    page: number;
    limit: number;
    status: "all" | "pending" | "approved" | "rejected";
  }): Promise<{
    items: Array<{
      id: string;
      userId: string;
      userName: string;
      userEmail: string;
      bankName?: string;
      accountNumber?: string;
      amount: number;
      status: "pending" | "approved" | "rejected";
      processedAt: Date | null;
      processedByAdminId?: string;
      processedByAdminName?: string;
    }>;
    total: number;
  }> {
    const pendingUsers = await this.getUsersWithPendingWithdrawals();
    const pending = pendingUsers.map((u) => ({
      id: `pending-${u.id}`,
      userId: u.id,
      amount: u.withdrawingFunds,
      status: "pending" as const,
      processedAt: null as Date | null,
      processedByAdminId: undefined as string | undefined,
      bankName: u.bankName,
      accountNumber: u.accountNumber,
      userName: [u.name, u.lastName].filter(Boolean).join(" ") || u.email || "—",
      userEmail: u.email ?? "—",
    }));
    const approved = this.walletTransfers
      .filter((t: any) => t.transferType === "withdrawal" && t.status === "completed")
      .map((t: any) => ({
        id: `approval-${t.id}`,
        userId: t.userId,
        amount: t.amount,
        status: "approved" as const,
        processedAt: t.createdAt as Date,
        processedByAdminId: t.fromUserId,
        bankName: t.bankName,
        accountNumber: t.accountNumber,
      }));
    const rejected = this.withdrawalRejections.map((r: any) => ({
      id: `rejection-${r.id}`,
      userId: r.userId,
      amount: r.amount,
      status: "rejected" as const,
      processedAt: r.rejectedAt as Date,
      processedByAdminId: r.rejectedByUserId,
      bankName: r.bankName,
      accountNumber: r.accountNumber,
    }));
    const sortByDate = (a: { processedAt: Date | null }, b: { processedAt: Date | null }) => {
      if (!a.processedAt) return -1;
      if (!b.processedAt) return 1;
      return new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime();
    };
    let list: Array<{
      id: string;
      userId: string;
      amount: number;
      status: "pending" | "approved" | "rejected";
      processedAt: Date | null;
      processedByAdminId?: string;
      bankName?: string;
      accountNumber?: string;
      userName?: string;
      userEmail?: string;
    }> = [];
    if (options.status === "pending") list = pending;
    else if (options.status === "approved") list = approved.sort(sortByDate);
    else if (options.status === "rejected") list = rejected.sort(sortByDate);
    else list = [...pending, ...approved.sort(sortByDate), ...rejected.sort(sortByDate)];
    const total = list.length;
    const page = Math.max(1, options.page);
    const limit = Math.min(50, Math.max(1, options.limit));
    const start = (page - 1) * limit;
    const slice = list.slice(start, start + limit);
    const items = await Promise.all(
      slice.map(async (row) => {
        if (row.status === "pending" && row.userName != null && row.userEmail != null) {
          return {
            id: row.id,
            userId: row.userId,
            userName: row.userName,
            userEmail: row.userEmail,
            bankName: row.bankName,
            accountNumber: row.accountNumber,
            amount: row.amount,
            status: row.status,
            processedAt: null as Date | null,
            processedByAdminId: undefined as string | undefined,
            processedByAdminName: undefined as string | undefined,
          };
        }
        const user = this.users.find((u: any) => u.id === row.userId);
        const admin = row.processedByAdminId ? this.users.find((u: any) => u.id === row.processedByAdminId) : null;
        const userName = user
          ? ([user.name, (user as any).firstName, (user as any).lastName].filter(Boolean).join(" ") || (user as any).email || "—")
          : "—";
        const userEmail = (user as any)?.email ?? "—";
        const adminName = admin
          ? ([(admin as any).name, (admin as any).firstName, (admin as any).lastName].filter(Boolean).join(" ") || (admin as any).email || "—")
          : "—";
        return {
          id: row.id,
          userId: row.userId,
          userName,
          userEmail,
          bankName: row.bankName,
          accountNumber: row.accountNumber,
          amount: row.amount,
          status: row.status,
          processedAt: row.processedAt,
          processedByAdminId: row.processedByAdminId,
          processedByAdminName: adminName,
        };
      })
    );
    return { items, total };
  }

  // ==================== CALIFICACIONES (BOOKING RATINGS) ====================

  async getPendingBookingRatings(_userId: string): Promise<Array<{
    bookingId: number;
    rateeUserId: string;
    rateeName: string;
    roleRated: "professional" | "client";
    serviceTitle?: string;
    completedAt?: Date;
  }>> {
    return [];
  }

  async submitBookingRating(
    _raterUserId: string,
    _bookingId: number,
    _ratedUserId: string,
    _roleRated: "professional" | "client",
    _stars: number
  ): Promise<void> {
    // Stub: en memoria no persiste; Firestore implementa la lógica.
  }

  // ==================== VERIFICACIÓN DE PROFESIONALES ====================

  async getProfessionalVerificationByUserId(userId: string): Promise<ProfessionalVerification | null> {
    return this.professionalVerifications.get(userId) ?? null;
  }

  async upsertProfessionalVerificationImage(userId: string, imageUrl: string): Promise<ProfessionalVerification> {
    const cur = this.professionalVerifications.get(userId);
    const next: ProfessionalVerification = {
      userId,
      imageUrl,
      imageVerified: false, // siempre false por ahora (luego lo actualizará el admin)
      transferReceiptCode: cur?.transferReceiptCode ?? null,
      transferDate: cur?.transferDate ?? null,
      createdAt: cur?.createdAt ? new Date(cur.createdAt as any) : new Date(),
      updatedAt: new Date(),
    };
    this.professionalVerifications.set(userId, next);
    return next;
  }

  async upsertProfessionalVerificationPayment(
    userId: string,
    data: {
      transferReceiptCode: string;
      transferDate: string;
      subscriptionMonths: number;
      subscriptionMonthlyUsd?: number;
      promotionalCode?: string | null;
      promotionalDiscountPercent?: number | null;
      subscriptionOriginalTotalUsd?: number | null;
      subscriptionDiscountedTotalUsd?: number | null;
    },
  ): Promise<ProfessionalVerification> {
    const cur = this.professionalVerifications.get(userId);
    const promoCode = data.promotionalCode?.trim().toUpperCase() || null;
    const next: ProfessionalVerification = {
      userId,
      imageUrl: cur?.imageUrl ?? null,
      imageVerified: false,
      transferReceiptCode: data.transferReceiptCode.trim(),
      transferDate: data.transferDate.trim(),
      subscriptionMonths: Math.max(1, Math.min(12, Math.trunc(data.subscriptionMonths))),
      subscriptionMonthlyUsd:
        typeof data.subscriptionMonthlyUsd === "number" && Number.isFinite(data.subscriptionMonthlyUsd)
          ? Math.max(0, data.subscriptionMonthlyUsd)
          : (cur as any)?.subscriptionMonthlyUsd ?? null,
      promotionalCode: promoCode,
      promotionalDiscountPercent:
        promoCode && typeof data.promotionalDiscountPercent === "number"
          ? data.promotionalDiscountPercent
          : null,
      subscriptionOriginalTotalUsd:
        promoCode && typeof data.subscriptionOriginalTotalUsd === "number"
          ? data.subscriptionOriginalTotalUsd
          : null,
      subscriptionDiscountedTotalUsd:
        promoCode && typeof data.subscriptionDiscountedTotalUsd === "number"
          ? data.subscriptionDiscountedTotalUsd
          : null,
      createdAt: cur?.createdAt ? new Date(cur.createdAt as any) : new Date(),
      updatedAt: new Date(),
    };
    this.professionalVerifications.set(userId, next);
    return next;
  }

  async upsertProfessionalVerificationCredential(
    userId: string,
    professionalCredentialUrl: string
  ): Promise<ProfessionalVerification> {
    const cur = this.professionalVerifications.get(userId);
    const next: ProfessionalVerification = {
      userId,
      imageUrl: cur?.imageUrl ?? null,
      imageVerified: cur?.imageVerified === true ? true : false,
      professionalCredentialUrl,
      transferReceiptCode: cur?.transferReceiptCode ?? null,
      transferDate: cur?.transferDate ?? null,
      createdAt: cur?.createdAt ? new Date(cur.createdAt as any) : new Date(),
      updatedAt: new Date(),
    };
    this.professionalVerifications.set(userId, next);
    return next;
  }

  // ==================== verifying_status (nueva colección) ====================

  async getVerifyingStatusByUserId(userId: string): Promise<VerifyingStatus | null> {
    return this.verifyingStatuses.get(userId) ?? null;
  }

  async upsertVerifyingStatusIdentificationPending(
    userId: string,
    requestType: "onboarding" | "renewal" = "onboarding",
  ): Promise<VerifyingStatus> {
    const cur = this.verifyingStatuses.get(userId);
    const resetAfterReject = cur?.identification_verified === "rejected";
    const next: VerifyingStatus = {
      user: userId,
      requestType,
      identification_verified: "pending",
      transacction_date: cur?.transacction_date ?? null,
      // No tocar el estado del pago al subir identificación: null sigue null, pending sigue pending, etc.
      transacction_verified: cur?.transacction_verified ?? null,
      pendingIdResubmitCount: resetAfterReject ? 0 : cur?.pendingIdResubmitCount,
      pendingCredentialResubmitCount: resetAfterReject ? 0 : cur?.pendingCredentialResubmitCount,
      prefundPromoAwaitingDossier: (cur as any)?.prefundPromoAwaitingDossier,
      prefundPromoCode: (cur as any)?.prefundPromoCode,
      prefundPromoMonths: (cur as any)?.prefundPromoMonths,
      createdAt: cur?.createdAt ? (cur.createdAt as any) : new Date(),
      updatedAt: new Date(),
    };
    this.verifyingStatuses.set(userId, next);
    return next;
  }

  async upsertVerifyingStatusTransactionPending(
    userId: string,
    transactionDate: string,
    requestType: "onboarding" | "renewal" = "onboarding",
  ): Promise<VerifyingStatus> {
    const cur = this.verifyingStatuses.get(userId);
    const next: VerifyingStatus = {
      user: userId,
      // Importante: si el pago es de renovación, debe reflejarse siempre.
      requestType,
      identification_verified: cur?.identification_verified ?? "rejected",
      transacction_date: transactionDate,
      transacction_verified: "pending",
      pendingIdResubmitCount: cur?.pendingIdResubmitCount,
      pendingCredentialResubmitCount: cur?.pendingCredentialResubmitCount,
      prefundPromoAwaitingDossier: false,
      prefundPromoCode: (cur as any)?.prefundPromoCode,
      prefundPromoMonths: (cur as any)?.prefundPromoMonths,
      createdAt: cur?.createdAt ? (cur.createdAt as any) : new Date(),
      updatedAt: new Date(),
    };
    this.verifyingStatuses.set(userId, next);
    return next;
  }

  async getPendingVerifyingStatuses(): Promise<VerifyingStatus[]> {
    return Array.from(this.verifyingStatuses.values()).filter(
      (s) =>
        s.identification_verified === "pending" ||
        s.transacction_verified === "pending" ||
        (s as { prefundPromoAwaitingDossier?: boolean }).prefundPromoAwaitingDossier === true,
    );
  }

  async setVerifyingStatusIdentification(userId: string, status: ProfessionalVerificationState): Promise<VerifyingStatus> {
    const cur = this.verifyingStatuses.get(userId);
    if (!cur) throw new Error("Verificación no encontrada");
    // Permitir que el admin revierta un rechazo anterior (rejected→verified) sin exigir que el usuario re-subiera.
    // Solo bloqueamos si ya está verificado.
    if (cur.identification_verified === "verified") throw new Error("La identificación ya fue verificada");
    const next: VerifyingStatus = {
      ...cur,
      identification_verified: status,
      updatedAt: new Date(),
      ...(status === "rejected"
        ? { pendingIdResubmitCount: 0, pendingCredentialResubmitCount: 0 }
        : {}),
    };
    this.verifyingStatuses.set(userId, next);
    return next;
  }

  async setVerifyingStatusTransaction(userId: string, status: ProfessionalVerificationState): Promise<VerifyingStatus> {
    const cur = this.verifyingStatuses.get(userId);
    if (!cur) throw new Error("Verificación no encontrada");
    // Permitir revertir rechazo anterior (rejected→verified). Solo bloquear si no hay envío (null) o ya está verificado.
    if (cur.transacction_verified == null) throw new Error("Aún no hay comprobante de pago");
    if (cur.transacction_verified === "verified") throw new Error("La transacción ya fue verificada");
    const next: VerifyingStatus = {
      ...cur,
      transacction_verified: status,
      updatedAt: new Date(),
      ...(status === "rejected"
        ? { pendingIdResubmitCount: 0, pendingCredentialResubmitCount: 0 }
        : {}),
    };
    this.verifyingStatuses.set(userId, next);
    return next;
  }

  async incrementPendingIdResubmitCount(userId: string): Promise<void> {
    const cur = this.verifyingStatuses.get(userId);
    if (!cur) return;
    this.verifyingStatuses.set(userId, {
      ...cur,
      pendingIdResubmitCount: 1,
      updatedAt: new Date(),
    });
  }

  async incrementPendingCredentialResubmitCount(userId: string): Promise<void> {
    const cur = this.verifyingStatuses.get(userId);
    if (!cur) return;
    this.verifyingStatuses.set(userId, {
      ...cur,
      pendingCredentialResubmitCount: 1,
      updatedAt: new Date(),
    });
  }

  async upsertVerifyingStatusPrefundPromoAwaitingDossier(
    userId: string,
    args: { code: string; monthsGranted: number },
  ): Promise<VerifyingStatus> {
    const cur = this.verifyingStatuses.get(userId);
    const code = args.code.trim().toUpperCase();
    const months = Math.max(1, Math.min(12, Math.trunc(args.monthsGranted)));
    const next: VerifyingStatus = {
      user: userId,
      requestType: cur?.requestType ?? "onboarding",
      identification_verified: cur?.identification_verified ?? "rejected",
      transacction_date: cur?.transacction_date ?? null,
      transacction_verified: cur?.transacction_verified ?? null,
      pendingIdResubmitCount: cur?.pendingIdResubmitCount,
      pendingCredentialResubmitCount: cur?.pendingCredentialResubmitCount,
      prefundPromoAwaitingDossier: true,
      prefundPromoCode: code,
      prefundPromoMonths: months,
      createdAt: cur?.createdAt ? (cur.createdAt as any) : new Date(),
      updatedAt: new Date(),
    } as VerifyingStatus;
    this.verifyingStatuses.set(userId, next);
    return next;
  }

  async clearVerifyingStatusPrefundPromoAwaitingDossier(userId: string): Promise<void> {
    const cur = this.verifyingStatuses.get(userId);
    if (!cur) return;
    this.verifyingStatuses.set(userId, {
      ...cur,
      prefundPromoAwaitingDossier: false,
      updatedAt: new Date(),
    } as VerifyingStatus);
  }

  async mergeProfessionalVerificationFreeMonthsPrefundPlaceholder(
    userId: string,
    data: {
      transferReceiptCode: string;
      transferDate: string;
      subscriptionMonths: number;
      promotionalCode: string | null;
    },
  ): Promise<ProfessionalVerification> {
    const cur = this.professionalVerifications.get(userId);
    const base: ProfessionalVerification = cur ?? {
      userId,
      imageUrl: null,
      imageVerified: false,
      professionalCredentialUrl: null,
      transferReceiptCode: null,
      transferDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const next: ProfessionalVerification = {
      ...base,
      transferReceiptCode: data.transferReceiptCode.trim(),
      transferDate: data.transferDate.trim(),
      subscriptionMonths: Math.max(1, Math.min(12, Math.trunc(data.subscriptionMonths))),
      promotionalCode: data.promotionalCode,
      promotionalDiscountPercent: null,
      subscriptionOriginalTotalUsd: null,
      subscriptionDiscountedTotalUsd: null,
      updatedAt: new Date(),
    };
    this.professionalVerifications.set(userId, next);
    return next;
  }

  // ==================== RESEÑAS (MOCK) ====================

  private reviews: any[] = [];
  private reviewIdCounter = 1;

  private professionalVerifications = new Map<string, ProfessionalVerification>();
  private verifyingStatuses = new Map<string, VerifyingStatus>();

  async getReviews(params: { targetId?: string; targetType?: string; limit?: number; offset?: number }): Promise<any[]> {
    let result = this.reviews;
    if (params.targetId) {
      result = result.filter(r => r.targetId === params.targetId);
    }
    if (params.targetType) {
      result = result.filter(r => r.targetType === params.targetType);
    }
    return result.slice(params.offset || 0, (params.offset || 0) + (params.limit || 10));
  }

  async getReviewStats(targetId: string, targetType: string): Promise<any | undefined> {
    const targetReviews = this.reviews.filter(r => r.targetId === targetId && r.targetType === targetType);
    if (targetReviews.length === 0) {
      return { averageRating: 0, totalReviews: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };
    }
    const avg = targetReviews.reduce((sum, r) => sum + r.rating, 0) / targetReviews.length;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    targetReviews.forEach(r => {
      if (r.rating >= 1 && r.rating <= 5) {
        distribution[r.rating as keyof typeof distribution]++;
      }
    });
    return { averageRating: avg, totalReviews: targetReviews.length, distribution };
  }

  async createReview(review: any): Promise<any> {
    const newReview = { ...review, id: this.reviewIdCounter++, createdAt: new Date(), helpfulCount: 0 };
    this.reviews.push(newReview);
    return newReview;
  }

  async replyToReview(reviewId: number, response: string, responderId: string, responderName: string): Promise<any> {
    const review = this.reviews.find(r => r.id === reviewId);
    if (!review) throw new Error("Review not found");
    review.response = { text: response, responderId, responderName, createdAt: new Date() };
    return review;
  }

  async markReviewHelpful(reviewId: number): Promise<any> {
    const review = this.reviews.find(r => r.id === reviewId);
    if (!review) throw new Error("Review not found");
    review.helpfulCount = (review.helpfulCount || 0) + 1;
    return review;
  }

  async deleteReview(reviewId: number, userId: string, actingUserRole?: string): Promise<void> {
    const index = this.reviews.findIndex((r) => r.id === reviewId);
    if (index === -1) throw new Error("Review not found");
    const review = this.reviews[index];
    const isAuthor = review.reviewerId === userId;
    if (!isAuthor && !hasAdminPrivileges(actingUserRole)) {
      throw new Error("Review not found or unauthorized");
    }
    this.reviews.splice(index, 1);
  }

  async updateReviewStats(targetId: string, targetType: string): Promise<void> {
    // Stats are calculated dynamically in getReviewStats
  }
}

// Almacenamiento activo: se asigna en memoria por defecto; si Firebase está configurado,
// index.ts lo reemplaza por Firestore.
let _storage: IStorage = new InMemoryStorage();

export function setGenFebStorage(s: IStorage): void {
  _storage = s;
}

export const storage: IStorage = new Proxy({} as IStorage, {
  get(_, prop: string) {
    return (_storage as any)[prop];
  },
});

// Alias para compatibilidad
export const genFebStorage = storage;
