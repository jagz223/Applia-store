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
import { eq, and, like, desc } from "drizzle-orm";
import type { IUserStorage, IRoleStorage, ICatalogStorage, IBookingStorage } from "./storage-contracts";
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
 * Contrato de almacenamiento de dominio - GenFeb S.A.S.
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
  getMessagesByConversation(conversationId: number): Promise<any[]>;
  createMessage(msg: any): Promise<any>;
  markMessageAsRead(messageId: number): Promise<void>;
  
  // Roles de Usuario (perfil del usuario, no catálogo de roles)
  getUserRole(userId: string): Promise<any | undefined>;
  updateUserRole(userId: string, data: any): Promise<any>;

  // Reportes Financieros
  getFinancialReports(userId: string, period?: string): Promise<any[]>;
  getKPIs(userId: string): Promise<any>;
  
  // Notificaciones
  getNotifications(userId: string, unreadOnly?: boolean): Promise<any[]>;
  markNotificationAsRead(notificationId: number): Promise<void>;
  
  // Integración ManGo
  syncWithMango(userId: string, mangoUserId: string): Promise<any>;
  getMangoSyncStatus(userId: string): Promise<any | undefined>;
  
  // Reseñas y Ratings
  getReviews(params: { targetId?: string; targetType?: string; limit?: number; offset?: number }): Promise<any[]>;
  getReviewStats(targetId: string, targetType: string): Promise<any | undefined>;
  createReview(review: any): Promise<any>;
  replyToReview(reviewId: number, response: string, responderId: string, responderName: string): Promise<any>;
  markReviewHelpful(reviewId: number): Promise<any>;
  deleteReview(reviewId: number, userId: string): Promise<void>;
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
}

// Almacenamiento en memoria para desarrollo
// Nota: En producción, usar DatabaseStorage con PostgreSQL o Firestore

export class InMemoryStorage implements IStorage {
  private bookings: any[] = [];
  private users: any[] = [];
  private userIdCounter = 1;
  
  // ==================== USUARIOS (AUTH JWT) ====================
  
  async getUserById(id: string): Promise<any | undefined> {
    return this.users.find(u => u.id === id);
  }
  
  async getUserByEmail(email: string): Promise<any | undefined> {
    return this.users.find(u => u.email === email);
  }

  async getUsers(params: { role?: string; name?: string; email?: string; lastName?: string; page: number; limit: number }): Promise<{ users: any[]; total: number }> {
    let list = [...this.users];
    const { role, name, email, lastName, page, limit } = params;
    if (role?.trim()) list = list.filter(u => (u.role || "").toLowerCase() === role.trim().toLowerCase());
    if (name?.trim()) {
      const n = name.trim().toLowerCase();
      list = list.filter(u => (u.name || "").toLowerCase().includes(n));
    }
    if (email?.trim()) {
      const e = email.trim().toLowerCase();
      list = list.filter(u => (u.email || "").toLowerCase().includes(e));
    }
    if (lastName?.trim()) {
      const l = lastName.trim().toLowerCase();
      list = list.filter(u => (u.lastName || "").toLowerCase().includes(l));
    }
    const total = list.length;
    const start = (page - 1) * limit;
    const users = list.slice(start, start + limit).map(({ password: _p, ...u }) => u);
    return { users, total };
  }
  
  async createUser(user: any): Promise<any> {
    // Verificar si el email ya existe
    const existingUser = this.users.find(u => u.email === user.email);
    if (existingUser) {
      throw new Error("El usuario con este email ya existe");
    }
    
    const newUser = {
      id: String(this.userIdCounter++),
      ...user,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(newUser);
    return newUser;
  }
  
  async updateUser(id: string, data: any): Promise<any | undefined> {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) return undefined;
    
    this.users[index] = {
      ...this.users[index],
      ...data,
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
  private payments: any[] = [];
  private documents: any[] = [];
  private conversations: any[] = [];
  private messages: any[] = [];
  private userRoles: any[] = [];
  private notifications: any[] = [];
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
    return result;
  }
  
  async getBookingsByProvider(providerId: number): Promise<any[]> {
    return this.bookings.filter(b => b.providerId === providerId);
  }
  
  async getBooking(id: number): Promise<any | undefined> {
    return this.bookings.find(b => b.id === id);
  }
  
  async createBooking(booking: any): Promise<any> {
    const newBooking = { ...booking, id: this.bookings.length + 1 };
    this.bookings.push(newBooking);
    return newBooking;
  }
  
  async updateBookingStatus(id: number, status: string): Promise<any | undefined> {
    const booking = this.bookings.find(b => b.id === id);
    if (booking) {
      booking.status = status;
    }
    return booking;
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
  
  async getConversationsByUser(userId: string): Promise<any[]> {
    return this.conversations.filter(c => 
      c.participant1Id === userId || c.participant2Id === userId
    );
  }
  
  async createConversation(conv: any): Promise<any> {
    const newConv = { 
      ...conv, 
      id: this.conversationIdCounter++,
      createdAt: new Date(),
      lastMessageAt: new Date()
    };
    this.conversations.push(newConv);
    return newConv;
  }
  
  async getMessagesByConversation(conversationId: number): Promise<any[]> {
    return this.messages.filter(m => m.conversationId === conversationId);
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
    { code: "professional", name: "Profesional", description: "Proveedor de servicios", isSystem: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
    { code: "client", name: "Cliente", description: "Usuario que contrata servicios", isSystem: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
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
    if (this.roleDefinitions.length >= 3) return;
    this.roleDefinitions = [
      { code: "admin", name: "Administrador", description: "Acceso total al sistema", isSystem: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
      { code: "professional", name: "Profesional", description: "Proveedor de servicios", isSystem: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
      { code: "client", name: "Cliente", description: "Usuario que contrata servicios", isSystem: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
    ];
  }

  // ============== REPORTES ==============
  
  async getFinancialReports(userId: string, period?: string): Promise<any[]> {
    // Mock data para reportes financieros
    const now = new Date();
    const reports = [];
    
    for (let i = 0; i < 6; i++) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - i);
      reports.push({
        id: i + 1,
        userId,
        type: 'income',
        period: period || 'monthly',
        amount: Math.floor(Math.random() * 5000) + 1000,
        currency: 'USD',
        status: 'completed',
        description: `Ingresos del mes ${date.toLocaleString('es', { month: 'long' })}`,
        createdAt: date
      });
    }
    
    return reports;
  }
  
  async getKPIs(userId: string): Promise<any> {
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
  
  async markNotificationAsRead(notificationId: number): Promise<void> {
    const notif = this.notifications.find(n => n.id === notificationId);
    if (notif) {
      notif.read = true;
      notif.readAt = new Date();
    }
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
    return [
      { id: 1, name: "Plomería", slug: "plumbing", type: "technical", icon: "Wrench", imageUrl: "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&q=80" },
      { id: 2, name: "Electricidad", slug: "electrical", type: "technical", icon: "Zap", imageUrl: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80" },
      { id: 3, name: "Limpieza", slug: "cleaning", type: "technical", icon: "SprayCan", imageUrl: "https://images.unsplash.com/photo-1581578731117-104f2a41272c?auto=format&fit=crop&q=80" },
      { id: 4, name: "Tutorías", slug: "tutoring", type: "profession", icon: "BookOpen", imageUrl: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80" },
      { id: 5, name: "Belleza", slug: "beauty", type: "profession", icon: "Scissors", imageUrl: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80" },
      { id: 6, name: "Mudanzas", slug: "moving", type: "technical", icon: "Truck", imageUrl: "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&q=80" },
    ];
  }

  async getAllProviders(profession?: string): Promise<Provider[]> {
    if (profession) {
      return this.providers.filter(p => p.profession.toLowerCase().includes(profession.toLowerCase()));
    }
    return this.providers;
  }

  async getProvider(id: number): Promise<Provider | undefined> {
    return this.providers.find(p => p.id === id);
  }

  async getProviderByUserId(userId: string): Promise<Provider | undefined> {
    return this.providers.find(p => p.userId === userId);
  }

  async createProvider(insertProvider: InsertProvider): Promise<Provider> {
    const newProvider = {
      id: this.providerIdCounter++,
      userId: insertProvider.userId,
      profession: insertProvider.profession,
      bio: insertProvider.bio || "",
      yearsExperience: insertProvider.yearsExperience || 0,
      hourlyRate: insertProvider.hourlyRate || null,
      isVerified: false,
      rating: "0",
      reviewCount: 0,
      createdAt: new Date(),
    };
    this.providers.push(newProvider);
    return newProvider as Provider;
  }

  private providers: any[] = [];
  private providerIdCounter = 1;

  async getAllServices(categoryId?: number, search?: string): Promise<ServiceWithProvider[]> {
    return [];
  }

  async getService(id: number): Promise<ServiceWithProvider | undefined> {
    return undefined;
  }

  async createService(service: InsertService): Promise<Service> {
    return {} as Service;
  }

  async seedCategories(): Promise<void> {}
  
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
  
  async getPaymentVouchersByUser(userId: string): Promise<any[]> {
    return this.paymentVouchers.filter(v => v.userId === userId);
  }
  
  async updatePaymentVoucherStatus(id: number, status: string): Promise<any | null> {
    const voucher = this.paymentVouchers.find(v => v.id === id);
    if (!voucher) return null;
    voucher.status = status;
    return voucher;
  }

  // ==================== RESEÑAS (MOCK) ====================

  private reviews: any[] = [];
  private reviewIdCounter = 1;

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

  async deleteReview(reviewId: number, userId: string): Promise<void> {
    const index = this.reviews.findIndex(r => r.id === reviewId && r.reviewerId === userId);
    if (index === -1) throw new Error("Review not found or unauthorized");
    this.reviews.splice(index, 1);
  }

  async updateReviewStats(targetId: string, targetType: string): Promise<void> {
    // Stats are calculated dynamically in getReviewStats
  }
}

// Instancia activa y setter en storage-instance.ts para evitar errores del bundler en deploy.
export { setGenFebStorage, genFebStorage, storage } from "./storage-instance";
