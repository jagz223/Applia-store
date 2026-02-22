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
const getDb = async () => (await import("./db")).db;

/**
 * Contrato de almacenamiento de dominio - GenFeb S.A.S.
 * 
 * Este archivo contiene las definiciones de almacenamiento necesarias para
 * la plataforma de GenFeb S.A.S. incluyendo:
 * - Reservas (Bookings)
 * - Pagos (Payments/Escrow)
 * - Documentos (Vault)
 * - Mensajes (Chat)
 * - Roles de usuario
 * - Reportes financieros
 * - Integración con ManGo
 */
export interface IStorage {
  // Usuarios (Auth JWT)
  getUserById(id: string): Promise<any | undefined>;
  getUserByEmail(email: string): Promise<any | undefined>;
  createUser(user: any): Promise<any>;
  updateUser(id: string, data: any): Promise<any | undefined>;
  updateUserPassword(id: string, password: string): Promise<void>;
  
  // Categorías
  getCategories(): Promise<Category[]>;
  
  // Proveedores
  getAllProviders(profession?: string): Promise<Provider[]>;
  getProvider(id: number): Promise<Provider | undefined>;
  getProviderByUserId(userId: string): Promise<Provider | undefined>;
  createProvider(provider: InsertProvider): Promise<Provider>;
  
  // Servicios
  getAllServices(categoryId?: number, search?: string): Promise<ServiceWithProvider[]>;
  getService(id: number): Promise<ServiceWithProvider | undefined>;
  createService(service: InsertService): Promise<Service>;
  
  // Reservas (Bookings)
  getBookingsByUser(userId: string, status?: string): Promise<(Booking & { service: ServiceWithProvider })[]>;
  getBookingsByProvider(providerId: number): Promise<(Booking & { service: ServiceWithProvider, user: User })[]>;
  getBooking(id: number): Promise<Booking | undefined>;
  createBooking(booking: InsertBooking & { status: string }): Promise<Booking>;
  updateBookingStatus(id: number, status: string): Promise<Booking | undefined>;
  
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
  
  // Roles de Usuario
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
  
  // Seed
  seedCategories(): Promise<void>;
}

// Almacenamiento en memoria para desarrollo
// Nota: En producción, usar DatabaseStorage con PostgreSQL

class InMemoryStorage implements IStorage {
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
    return [];
  }

  async getAllProviders(profession?: string): Promise<Provider[]> {
    return [];
  }

  async getProvider(id: number): Promise<Provider | undefined> {
    return undefined;
  }

  async getProviderByUserId(userId: string): Promise<Provider | undefined> {
    return undefined;
  }

  async createProvider(insertProvider: InsertProvider): Promise<Provider> {
    return {} as Provider;
  }

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
}

/**
 * Inicialización de almacenamiento
 */
export const storage: IStorage = new InMemoryStorage();

// Alias para compatibilidad
export const genFebStorage = storage;
