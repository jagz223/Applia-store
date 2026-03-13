/**
 * Implementación de almacenamiento con Firestore
 * GenFeb S.A.S.
 * 
 * Este módulo proporciona una implementación de IStorage usando
 * Google Cloud Firestore como base de datos.
 */

import {
  getFirestore,
  FIRESTORE_COLLECTIONS,
  initializeFirebase,
} from "./firebase-admin";
import type { 
  Category, 
  Provider, 
  Service, 
  Booking,
  InsertCategory,
  InsertProvider,
  InsertService,
  InsertBooking,
  ProviderWithUser,
  ServiceWithProvider,
} from "@shared/schema";
import type { IStorage, RoleDefinition, NewRoleDefinition } from "./storage-genfeb";

interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  lastName: string;
  phone?: string;
  role: string;
  avatar?: string;
  address?: string;
  city?: string;
  country?: string;
  bio?: string;
  language?: string;
  isActive?: boolean;
  isVerified?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Formato de "rol/perfil" que devuelve getUserRole (alineado con user_roles en schema). */
export interface UserRoleRecord {
  userId: string;
  role: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  avatar?: string;
  bio?: string;
  language?: string;
  isActive?: boolean;
  isVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Firestore implementa el contrato completo IStorage (todo en Firestore, sin híbrido). */
export type FirestoreStorage = IStorage;

const COUNTERS_DOC = "_counters";

class FirestoreStorageImpl implements IStorage {
  private db = getFirestore();

  /** Obtiene el siguiente ID numérico para una colección (transacción atómica). */
  private async getNextId(collectionKey: string): Promise<number> {
    if (!this.db) throw new Error("Firestore no configurado");
    const ref = this.db.collection(FIRESTORE_COLLECTIONS._COUNTERS).doc(collectionKey);
    return this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const current = (snap.data()?.count ?? 0) as number;
      const next = current + 1;
      t.set(ref, { count: next });
      return next;
    });
  }

  // ============ USUARIOS ============

  async getUserById(id: string): Promise<User | undefined> {
    if (!this.db) return undefined;
    
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc(id).get();
    if (!doc.exists) return undefined;
    
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
    } as User;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!this.db) return undefined;
    
    const snapshot = await this.db.collection(FIRESTORE_COLLECTIONS.USERS)
      .where("email", "==", email)
      .limit(1)
      .get();
    
    if (snapshot.empty) return undefined;
    
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    } as User;
  }

  async getUsers(params: { role?: string; name?: string; email?: string; lastName?: string; page: number; limit: number }): Promise<{ users: User[]; total: number }> {
    if (!this.db) return { users: [], total: 0 };
    const snapshot = await this.db.collection(FIRESTORE_COLLECTIONS.USERS).get();
    let list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User));
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
    const users = list.slice(start, start + limit).map(({ password: _p, ...u }) => u as User);
    return { users, total };
  }

  async createUser(user: Partial<User>): Promise<User> {
    if (!this.db) throw new Error("Firestore no configurado");
    
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc();
    const now = new Date();
    
    const newUser: User = {
      id: docRef.id,
      email: user.email!,
      password: user.password!,
      name: user.name!,
      lastName: user.lastName!,
      phone: user.phone,
      role: user.role || "client",
      avatar: user.avatar,
      createdAt: now,
      updatedAt: now,
    };
    
    await docRef.set(newUser);
    return newUser;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    if (!this.db) return undefined;
    
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) return undefined;
    
    await docRef.update({
      ...data,
      updatedAt: new Date(),
    });
    
    const updated = await docRef.get();
    return { id: updated.id, ...updated.data() } as User;
  }

  async updateUserPassword(id: string, password: string): Promise<void> {
    if (!this.db) return;
    
    await this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc(id).update({
      password,
      updatedAt: new Date(),
    });
  }

  async getUserRole(userId: string): Promise<UserRoleRecord | undefined> {
    const user = await this.getUserById(userId);
    if (!user) return undefined;
    return {
      userId: user.id,
      role: user.role,
      phone: user.phone,
      address: user.address,
      city: user.city,
      country: user.country,
      avatar: user.avatar,
      bio: user.bio,
      language: user.language,
      isActive: user.isActive,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async updateUserRole(userId: string, data: Partial<UserRoleRecord>): Promise<UserRoleRecord> {
    if (!this.db) throw new Error("Firestore no configurado");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc(userId);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Usuario no encontrado");
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.role !== undefined) updateData.role = data.role;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.country !== undefined) updateData.country = data.country;
    if (data.avatar !== undefined) updateData.avatar = data.avatar;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.language !== undefined) updateData.language = data.language;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.isVerified !== undefined) updateData.isVerified = data.isVerified;
    await docRef.update(updateData);
    const updated = await this.getUserRole(userId);
    if (!updated) throw new Error("Error al leer rol actualizado");
    return updated;
  }

  // ============ CATEGORÍAS ============

  async getCategories(): Promise<Category[]> {
    if (!this.db) return [];
    
    const snapshot = await this.db.collection(FIRESTORE_COLLECTIONS.CATEGORIES).get();
    return snapshot.docs.map(doc => ({
      id: parseInt(doc.id),
      ...doc.data(),
    } as Category));
  }

  // ============ PROVEEDORES ============

  async getAllProviders(profession?: string, category?: string, categoryId?: number): Promise<Provider[]> {
    if (!this.db) return [];
    const coll = this.db.collection(FIRESTORE_COLLECTIONS.PROVIDERS);
    let query: import("firebase-admin").firestore.Query = coll;
    if (profession && !category && categoryId == null) {
      query = coll.where("profession", "==", profession);
    } else if (category && !profession && categoryId == null) {
      query = coll.where("category", "==", category);
    } else if (categoryId != null && !Number.isNaN(Number(categoryId))) {
      query = coll.where("categoryId", "==", Number(categoryId));
    }
    const snapshot = await query.get();
    let list = snapshot.docs.map(doc => ({ id: parseInt(doc.id), ...doc.data() } as Provider));
    if (profession && (category || categoryId != null)) {
      list = list.filter(
        (p) =>
          p.profession === profession &&
          (categoryId != null
            ? (p as { categoryId?: number }).categoryId === categoryId
            : (p.category ?? null) === category)
      );
    }
    return list;
  }

  async getProvider(id: number | null | undefined): Promise<Provider | undefined> {
    if (!this.db) return undefined;
    const safeId = id != null && !Number.isNaN(Number(id)) ? Number(id) : null;
    if (safeId === null) return undefined;

    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.PROVIDERS).doc(String(safeId)).get();
    if (!doc.exists) return undefined;

    return {
      id: parseInt(doc.id, 10),
      ...doc.data(),
    } as Provider;
  }

  /** Enriquece un proveedor con los datos del usuario (para ServiceWithProvider). */
  private async enrichProviderWithUser(provider: Provider): Promise<ProviderWithUser> {
    const raw = await this.getUserById(provider.userId);
    const user = raw
      ? {
          ...raw,
          firstName: (raw as { firstName?: string }).firstName ?? (raw as { name?: string }).name ?? "Usuario",
          lastName: (raw as { lastName?: string }).lastName ?? "",
        }
      : {
          id: provider.userId,
          firstName: "Usuario",
          lastName: "",
          email: null,
          profileImageUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
    return { ...provider, user } as ProviderWithUser;
  }

  async getProviderByUserId(userId: string): Promise<Provider | undefined> {
    if (!this.db) return undefined;
    
    const snapshot = await this.db.collection(FIRESTORE_COLLECTIONS.PROVIDERS)
      .where("userId", "==", userId)
      .limit(1)
      .get();
    
    if (snapshot.empty) return undefined;
    
    const doc = snapshot.docs[0];
    return {
      id: parseInt(doc.id),
      ...doc.data(),
    } as Provider;
  }

  async createProvider(provider: InsertProvider): Promise<Provider> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("providers");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.PROVIDERS).doc(id.toString());
    const newProvider = {
      id,
      ...provider,
      categoryId: (provider as { categoryId?: number }).categoryId ?? null,
      category: provider.category ?? null,
      isVerified: provider.isVerified ?? false,
      rating: provider.rating ?? "0",
      reviewCount: provider.reviewCount ?? 0,
    };
    await docRef.set(newProvider);
    return newProvider as Provider;
  }

  async updateProvider(id: number, data: import("./storage-contracts").ProviderUpdate): Promise<Provider | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.PROVIDERS).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) updates[k] = v;
    }
    if (Object.keys(updates).length === 0) {
      return { id: parseInt(doc.id), ...doc.data() } as Provider;
    }
    await docRef.update(updates);
    const updated = await docRef.get();
    return { id: parseInt(updated.id), ...updated.data() } as Provider;
  }

  async deleteProvider(id: number): Promise<boolean> {
    if (!this.db) return false;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.PROVIDERS).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return false;
    await docRef.delete();
    return true;
  }

  // ============ SERVICIOS ============

  async getAllServices(
    categoryId?: number,
    search?: string,
    providerCategoryId?: number
  ): Promise<ServiceWithProvider[]> {
    if (!this.db) return [];
    let query = this.db.collection(FIRESTORE_COLLECTIONS.SERVICES);
    if (categoryId) {
      query = query.where("categoryId", "==", categoryId) as any;
    }
    const snapshot = await query.get();
    const services = snapshot.docs.map((doc) => ({
      id: parseInt(doc.id, 10),
      ...doc.data(),
    } as Service));

    const providerIdValid = (id: unknown): id is number =>
      id != null && typeof id === "number" && !Number.isNaN(id);

    const allCategories = await this.getCategories();
    let servicesWithProviders: ServiceWithProvider[] = [];
    for (const service of services) {
      const provider = providerIdValid(service.providerId)
        ? await this.getProvider(service.providerId)
        : undefined;
      const providerWithUser = provider ? await this.enrichProviderWithUser(provider) : undefined;
      const category = allCategories.find((c) => c.id === service.categoryId);
      servicesWithProviders.push({
        ...service,
        provider: providerWithUser ?? undefined,
        category: category ?? (allCategories[0] as Category),
      } as ServiceWithProvider);
    }

    if (providerCategoryId != null && !Number.isNaN(providerCategoryId)) {
      servicesWithProviders = servicesWithProviders.filter((s) => {
        const p = s.provider as { categoryId?: number } | undefined;
        return p?.categoryId === providerCategoryId;
      });
    }
    if (search) {
      const searchLower = search.toLowerCase();
      return servicesWithProviders.filter(
        (s) =>
          s.title?.toLowerCase().includes(searchLower) ||
          s.description?.toLowerCase().includes(searchLower)
      );
    }
    return servicesWithProviders;
  }

  async getService(id: number): Promise<ServiceWithProvider | undefined> {
    if (!this.db) return undefined;
    const safeId = id != null && !Number.isNaN(Number(id)) ? Number(id) : null;
    if (safeId === null) return undefined;

    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.SERVICES).doc(String(safeId)).get();
    if (!doc.exists) return undefined;

    const service = {
      id: parseInt(doc.id, 10),
      ...doc.data(),
    } as Service;

    const providerIdValid = (id: unknown): id is number =>
      id != null && typeof id === "number" && !Number.isNaN(id);
    const provider = providerIdValid(service.providerId)
      ? await this.getProvider(service.providerId)
      : undefined;
    const providerWithUser = provider ? await this.enrichProviderWithUser(provider) : undefined;
    const allCategories = await this.getCategories();
    const category = allCategories.find((c) => c.id === service.categoryId) ?? (allCategories[0] as Category | undefined);

    return {
      ...service,
      provider: providerWithUser ?? undefined,
      category: category ?? ({} as Category),
    } as ServiceWithProvider;
  }

  async createService(service: InsertService): Promise<Service> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("services");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.SERVICES).doc(id.toString());
    const newService = {
      id,
      ...service,
      isActive: service.isActive ?? true,
    };
    await docRef.set(newService);
    return newService as Service & { createdAt?: Date };
  }

  async updateService(
    id: number,
    data: import("./storage-contracts").ServiceUpdate
  ): Promise<Service | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.SERVICES).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) updates[k] = v;
    }
    if (Object.keys(updates).length === 0) {
      return { id: parseInt(doc.id), ...doc.data() } as Service;
    }
    await docRef.update(updates);
    const updated = await docRef.get();
    return { id: parseInt(updated.id), ...updated.data() } as Service;
  }

  async deleteService(id: number): Promise<boolean> {
    if (!this.db) return false;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.SERVICES).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return false;
    await docRef.delete();
    return true;
  }

  // ============ RESERVAS ============

  async getBookingsByUser(userId: string, status?: string): Promise<(Booking & { service: ServiceWithProvider })[]> {
    if (!this.db) return [];
    
    let query = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS)
      .where("userId", "==", userId);
    
    const snapshot = await query.get();
    
    const bookings: (Booking & { service: ServiceWithProvider })[] = [];
    
    for (const doc of snapshot.docs) {
      const booking = {
        id: parseInt(doc.id),
        ...doc.data(),
      } as Booking;
      
      if (status && booking.status !== status) continue;
      
      const service = await this.getService(booking.serviceId);
      bookings.push({
        ...booking,
        service: service!,
      });
    }
    
    return bookings;
  }

  async getBookingsByProvider(providerId: number): Promise<(Booking & { service: ServiceWithProvider, user: User })[]> {
    if (!this.db) return [];
    
    const snapshot = await this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS)
      .where("providerId", "==", providerId)
      .get();
    
    const bookings: (Booking & { service: ServiceWithProvider, user: User })[] = [];
    
    for (const doc of snapshot.docs) {
      const booking = {
        id: parseInt(doc.id),
        ...doc.data(),
      } as Booking;
      
      const service = await this.getService(booking.serviceId);
      if (!service) continue;
      const rawUser = await this.getUserById(booking.userId);
      const user = rawUser
        ? {
            ...rawUser,
            firstName: (rawUser as { firstName?: string }).firstName ?? (rawUser as { name?: string }).name ?? "Cliente",
            lastName: (rawUser as { lastName?: string }).lastName ?? "",
          }
        : { id: booking.userId, firstName: "Cliente", lastName: "", email: null, profileImageUrl: null, createdAt: new Date(), updatedAt: new Date() } as User;
      
      bookings.push({
        ...booking,
        service,
        user,
      });
    }
    
    return bookings;
  }

  async getBooking(id: number): Promise<Booking | undefined> {
    if (!this.db) return undefined;
    
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).doc(id.toString()).get();
    if (!doc.exists) return undefined;
    
    return {
      id: parseInt(doc.id),
      ...doc.data(),
    } as Booking;
  }

  async createBooking(booking: InsertBooking): Promise<Booking> {
    if (!this.db) throw new Error("Firestore no configurado");
    const service = await this.getService(booking.serviceId);
    const providerId = service?.provider?.id ?? (service as any)?.providerId;
    const id = await this.getNextId("bookings");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).doc(id.toString());
    const newBooking = {
      id,
      ...booking,
      providerId: providerId ?? (booking as any).providerId,
      notes: booking.notes ?? null,
      status: "pending",
      createdAt: new Date(),
    };
    await docRef.set(newBooking);
    return newBooking as Booking;
  }

  async updateBookingStatus(id: number, status: string): Promise<Booking | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    await docRef.update({ status });
    const updated = await docRef.get();
    return { id: parseInt(updated.id), ...updated.data() } as Booking;
  }

  // ============ PAGOS ESCROW ============
  async getPaymentsByUser(userId: string): Promise<any[]> {
    if (!this.db) return [];
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.ESCROW_PAYMENTS)
      .where("clientId", "==", userId).get();
    const snap2 = await this.db.collection(FIRESTORE_COLLECTIONS.ESCROW_PAYMENTS)
      .where("providerId", "==", userId).get();
    const map = new Map<string, any>();
    [...snap.docs, ...snap2.docs].forEach(d => map.set(d.id, { id: parseInt(d.id) || d.id, ...d.data() }));
    return Array.from(map.values());
  }
  async getEscrowPayments(userId: string): Promise<any[]> {
    const all = await this.getPaymentsByUser(userId);
    return all.filter((p: any) => p.status === "held");
  }
  async createEscrowPayment(payment: any): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("escrow_payments");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.ESCROW_PAYMENTS).doc(id.toString());
    const data = { id, ...payment, status: payment.status || "pending", createdAt: new Date() };
    await docRef.set(data);
    return data;
  }
  async releaseEscrowPayment(paymentId: number, release: boolean, reason?: string): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.ESCROW_PAYMENTS).doc(paymentId.toString());
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Pago no encontrado");
    await docRef.update({
      status: release ? "released" : "disputed",
      releasedAt: release ? new Date() : undefined,
      disputeReason: reason,
    });
    const updated = await docRef.get();
    return { id: paymentId, ...updated.data() };
  }
  async getUserBalance(userId: string): Promise<{ available: number; escrow: number; pending: number }> {
    const payments = await this.getPaymentsByUser(userId);
    const toNum = (p: any) => Number(p.amount) || 0;
    return {
      available: payments.filter((p: any) => p.status === "released").reduce((s, p) => s + toNum(p), 0),
      escrow: payments.filter((p: any) => p.status === "held").reduce((s, p) => s + toNum(p), 0),
      pending: payments.filter((p: any) => p.status === "pending").reduce((s, p) => s + toNum(p), 0),
    };
  }

  // ============ DOCUMENTOS (BÓVEDA) ============
  async getDocumentsByUser(userId: string, type?: string): Promise<any[]> {
    if (!this.db) return [];
    let q = this.db.collection(FIRESTORE_COLLECTIONS.DOCUMENTS).where("userId", "==", userId) as any;
    if (type) q = q.where("type", "==", type);
    const snap = await q.get();
    return snap.docs.map(d => ({ id: parseInt(d.id) || d.id, ...d.data() }));
  }
  async createDocument(doc: any): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("documents");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.DOCUMENTS).doc(id.toString());
    const data = { id, ...doc, uploadedAt: new Date() };
    await docRef.set(data);
    return data;
  }
  async deleteDocument(id: number, userId: string): Promise<void> {
    if (!this.db) return;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.DOCUMENTS).doc(id.toString());
    const doc = await docRef.get();
    if (doc.exists && (doc.data() as any)?.userId === userId) await docRef.delete();
  }

  // ============ CONVERSACIONES Y MENSAJES ============
  async getConversationsByUser(userId: string): Promise<any[]> {
    if (!this.db) return [];
    const snap1 = await this.db.collection(FIRESTORE_COLLECTIONS.CONVERSATIONS).where("participant1Id", "==", userId).get();
    const snap2 = await this.db.collection(FIRESTORE_COLLECTIONS.CONVERSATIONS).where("participant2Id", "==", userId).get();
    const map = new Map<string, any>();
    [...snap1.docs, ...snap2.docs].forEach(d => map.set(d.id, { id: parseInt(d.id) || d.id, ...d.data() }));
    return Array.from(map.values());
  }
  async createConversation(conv: any): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("conversations");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.CONVERSATIONS).doc(id.toString());
    const data = { id, ...conv, createdAt: new Date(), lastMessageAt: new Date() };
    await docRef.set(data);
    return data;
  }
  private messageCreatedAtMs(d: any): number {
    const t = d?.createdAt;
    if (t?.toMillis) return t.toMillis();
    if (t instanceof Date) return t.getTime();
    if (typeof t?.getTime === "function") return t.getTime();
    if (typeof t === "number") return t;
    return 0;
  }

  async getMessagesByConversation(conversationId: number, options: { limit: number; before?: number }): Promise<{ messages: any[]; hasMore: boolean }> {
    if (!this.db) return { messages: [], hasMore: false };
    const { limit, before } = options;
    // Sin orderBy para no requerir índice compuesto; ordenamos y paginamos en memoria
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.MESSAGES)
      .where("conversationId", "==", conversationId)
      .get();
    const list = snap.docs.map(d => ({ id: parseInt(d.id) || d.id, ...d.data() }));
    list.sort((a, b) => this.messageCreatedAtMs(b) - this.messageCreatedAtMs(a));
    let slice = list;
    if (before != null) {
      slice = list.filter(m => this.messageCreatedAtMs(m) < before);
    }
    const hasMore = slice.length > limit;
    const page = slice.slice(0, limit);
    const messages = page.reverse();
    return { messages, hasMore };
  }

  async getLastMessageByConversation(conversationId: number): Promise<any | null> {
    if (!this.db) return null;
    // Sin orderBy para no requerir índice compuesto; ordenamos en memoria
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.MESSAGES)
      .where("conversationId", "==", conversationId)
      .get();
    if (snap.empty) return null;
    let latestDoc: import("firebase-admin").firestore.QueryDocumentSnapshot | null = null;
    for (const doc of snap.docs) {
      const t = this.messageCreatedAtMs(doc.data());
      if (latestDoc == null || t > this.messageCreatedAtMs(latestDoc.data())) {
        latestDoc = doc;
      }
    }
    if (!latestDoc) return null;
    const d = latestDoc;
    return { id: parseInt(d.id) || d.id, ...d.data() };
  }

  async getUnreadCountByConversation(conversationId: number, userId: string): Promise<number> {
    if (!this.db) return 0;
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.MESSAGES)
      .where("conversationId", "==", conversationId)
      .get();
    return snap.docs.filter(doc => {
      const d = doc.data() as { senderId?: string; status?: string };
      return d.senderId !== userId && d.status !== "read";
    }).length;
  }
  async createMessage(msg: any): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("messages");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.MESSAGES).doc(id.toString());
    const data = { id, ...msg, createdAt: new Date() };
    await docRef.set(data);
    const convRef = this.db.collection(FIRESTORE_COLLECTIONS.CONVERSATIONS).doc(String(msg.conversationId));
    await convRef.update({ lastMessageAt: new Date() });
    return data;
  }
  async markMessageAsRead(messageId: number): Promise<void> {
    if (!this.db) return;
    await this.db.collection(FIRESTORE_COLLECTIONS.MESSAGES).doc(messageId.toString()).update({ status: "read", readAt: new Date() });
  }

  async markConversationAsRead(conversationId: number, userId: string): Promise<void> {
    if (!this.db) return;
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.MESSAGES)
      .where("conversationId", "==", conversationId)
      .get();
    const batch = this.db.batch();
    const now = new Date();
    let hasWrites = false;
    snap.docs.forEach(doc => {
      const d = doc.data() as { senderId?: string; status?: string };
      if (d.senderId !== userId && d.status !== "read") {
        batch.update(doc.ref, { status: "read", readAt: now });
        hasWrites = true;
      }
    });
    if (hasWrites) await batch.commit();
  }

  // ============ REPORTES FINANCIEROS ============
  async getFinancialReports(userId: string, _period?: string): Promise<any[]> {
    if (!this.db) return [];
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.FINANCIAL_REPORTS).where("userId", "==", userId).get();
    return snap.docs.map(d => ({ id: parseInt(d.id) || d.id, ...d.data() }));
  }
  async getKPIs(_userId: string): Promise<any> {
    return { totalIncome: 0, totalExpenses: 0, completedServices: 0, activeClients: 0, pendingBookings: 0, monthlyGrowth: 0, averageRating: 0 };
  }

  // ============ NOTIFICACIONES ============
  async getNotifications(userId: string, unreadOnly?: boolean): Promise<any[]> {
    if (!this.db) return [];
    let q = this.db.collection(FIRESTORE_COLLECTIONS.NOTIFICATIONS).where("userId", "==", userId) as any;
    const snap = await q.get();
    let list = snap.docs.map(d => ({ id: parseInt(d.id) || d.id, ...d.data() }));
    if (unreadOnly) list = list.filter((n: any) => !n.read);
    const toMs = (x: any) => (x?.toMillis ? x.toMillis() : x ? new Date(x).getTime() : 0);
    return list.sort((a: any, b: any) => toMs(b.createdAt) - toMs(a.createdAt));
  }
  async createNotification(notification: { userId: string; type: string; data: Record<string, unknown> }): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("notifications");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.NOTIFICATIONS).doc(id.toString());
    const created = {
      id,
      userId: notification.userId,
      type: notification.type,
      data: notification.data,
      read: false,
      createdAt: new Date(),
    };
    await docRef.set(created);
    return created;
  }
  async markNotificationAsRead(notificationId: number): Promise<void> {
    if (!this.db) return;
    await this.db.collection(FIRESTORE_COLLECTIONS.NOTIFICATIONS).doc(notificationId.toString()).update({ read: true, readAt: new Date() });
  }

  // ============ MANGO SYNC ============
  async syncWithMango(userId: string, mangoUserId: string): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.MANGO_SYNC).where("localUserId", "==", userId).limit(1).get();
    const data = { localUserId: userId, mangoUserId, lastSyncAt: new Date(), syncStatus: "completed" };
    if (!snap.empty) {
      await snap.docs[0].ref.update(data);
      return { id: snap.docs[0].id, ...snap.docs[0].data(), ...data };
    }
    const id = await this.getNextId("mango_sync");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.MANGO_SYNC).doc(id.toString());
    await docRef.set({ id, ...data });
    return { id, ...data };
  }
  async getMangoSyncStatus(userId: string): Promise<any | undefined> {
    if (!this.db) return undefined;
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.MANGO_SYNC).where("localUserId", "==", userId).limit(1).get();
    return snap.empty ? undefined : { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  // ============ RESEÑAS ============
  async getReviews(params: { targetId?: string; targetType?: string; limit?: number; offset?: number }): Promise<any[]> {
    if (!this.db) return [];
    let q = this.db.collection(FIRESTORE_COLLECTIONS.REVIEWS) as any;
    if (params.targetId) q = q.where("targetId", "==", params.targetId);
    if (params.targetType) q = q.where("targetType", "==", params.targetType);
    const snap = await q.get();
    let list = snap.docs.map(d => ({ id: parseInt(d.id) || d.id, ...d.data() }));
    const off = params.offset ?? 0;
    const lim = params.limit ?? 10;
    return list.slice(off, off + lim);
  }
  async getReviewStats(targetId: string, targetType: string): Promise<any | undefined> {
    const reviews = await this.getReviews({ targetId, targetType, limit: 1000 });
    if (reviews.length === 0) return { averageRating: 0, totalReviews: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };
    const sum = reviews.reduce((s: number, r: any) => s + (r.rating ?? 0), 0);
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r: any) => { const v = Math.min(5, Math.max(1, r.rating)); distribution[v as keyof typeof distribution]++; });
    return { averageRating: sum / reviews.length, totalReviews: reviews.length, distribution };
  }
  async createReview(review: any): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("reviews");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.REVIEWS).doc(id.toString());
    const data = { id, ...review, createdAt: new Date(), helpfulCount: 0 };
    await docRef.set(data);
    return data;
  }
  async replyToReview(reviewId: number, response: string, responderId: string, responderName: string): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.REVIEWS).doc(reviewId.toString());
    await docRef.update({ response, respondedAt: new Date(), responderId, responderName });
    const doc = await docRef.get();
    return doc.exists ? { id: reviewId, ...doc.data() } : undefined;
  }
  async markReviewHelpful(reviewId: number): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.REVIEWS).doc(reviewId.toString());
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Review not found");
    const count = ((doc.data() as any)?.helpfulCount ?? 0) + 1;
    await docRef.update({ helpfulCount: count });
    return { id: reviewId, ...doc.data(), helpfulCount: count };
  }
  async deleteReview(reviewId: number, userId: string): Promise<void> {
    if (!this.db) return;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.REVIEWS).doc(reviewId.toString());
    const doc = await docRef.get();
    if (doc.exists && (doc.data() as any)?.reviewerId === userId) await docRef.delete();
  }
  async updateReviewStats(_targetId: string, _targetType: string): Promise<void> {}

  // ============ SEED ============
  async seedCategories(): Promise<void> {
    if (!this.db) return;
    const { DEFAULT_CATEGORIES } = await import("@shared/default-categories");
    const coll = this.db.collection(FIRESTORE_COLLECTIONS.CATEGORIES);
    const snapshot = await coll.get();
    const bySlug = new Set(snapshot.docs.map((d) => (d.data().slug as string) ?? ""));
    let maxId = 0;
    snapshot.docs.forEach((d) => {
      const n = parseInt(d.id, 10);
      if (!Number.isNaN(n)) maxId = Math.max(maxId, n);
    });
    for (const cat of DEFAULT_CATEGORIES) {
      if (bySlug.has(cat.slug)) continue;
      maxId += 1;
      await coll.doc(String(maxId)).set({
        id: maxId,
        name: cat.name,
        slug: cat.slug,
        type: cat.type,
        icon: cat.icon,
        imageUrl: cat.imageUrl ?? null,
      });
    }
  }

  // ============ ESTADOS DE RESERVA ============
  async getBookingStatuses(): Promise<any[]> {
    if (!this.db) return [];
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.BOOKING_STATUSES).get();
    let list = snap.docs.map(d => ({ id: parseInt(d.id) || d.id, ...d.data() }));
    if (list.length === 0) return [
      { id: 1, name: "Nueva", type: 1, color: "#3B82F6", icon: "sparkles", isDefault: true, isSystem: true, sortOrder: 1 },
      { id: 2, name: "Confirmada", type: 1, color: "#8B5CF6", icon: "check-circle", isSystem: true, sortOrder: 2 },
      { id: 3, name: "En Proceso", type: 2, color: "#F59E0B", icon: "loader", isSystem: true, sortOrder: 3 },
      { id: 4, name: "Completada", type: 3, color: "#10B981", icon: "check", isDefault: true, isSystem: true, sortOrder: 4 },
      { id: 5, name: "Cancelada", type: 4, color: "#EF4444", icon: "x-circle", isDefault: true, isSystem: true, sortOrder: 5 },
    ];
    return list.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }
  async createBookingStatus(status: any): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("booking_statuses");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKING_STATUSES).doc(id.toString());
    const data = { id, ...status, isSystem: false, createdAt: new Date(), updatedAt: new Date() };
    await docRef.set(data);
    return data;
  }
  async updateBookingStatusCustom(id: number, data: any): Promise<any | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKING_STATUSES).doc(id.toString());
    await docRef.update({ ...data, updatedAt: new Date() });
    const doc = await docRef.get();
    return doc.exists ? { id, ...doc.data() } : undefined;
  }
  async deleteBookingStatus(id: number): Promise<void> {
    if (!this.db) return;
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.BOOKING_STATUSES).doc(id.toString()).get();
    if (doc.exists && (doc.data() as any)?.isSystem) throw new Error("No se puede eliminar un estado del sistema");
    await this.db.collection(FIRESTORE_COLLECTIONS.BOOKING_STATUSES).doc(id.toString()).delete();
  }

  // ============ IMPUESTOS ============
  async getTaxes(): Promise<any[]> {
    if (!this.db) return [];
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.TAXES).get();
    let list = snap.docs.map(d => ({ id: parseInt(d.id) || d.id, ...d.data() })).filter((t: any) => t.isActive !== false);
    if (list.length === 0) return [
      { id: 1, name: "IVA 12%", description: "Impuesto al Valor Agregado", rate: "12.00", type: "percentage", isDefault: true, country: "Ecuador", region: "Nacional", isActive: true },
      { id: 2, name: "IVA 0%", description: "Tarifa 0%", rate: "0.00", type: "percentage", isDefault: false, country: "Ecuador", isActive: true },
    ];
    return list;
  }
  async createTax(tax: any): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("taxes");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.TAXES).doc(id.toString());
    const data = { id, ...tax, createdAt: new Date(), updatedAt: new Date() };
    await docRef.set(data);
    return data;
  }
  async updateTax(id: number, data: any): Promise<any | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.TAXES).doc(id.toString());
    await docRef.update({ ...data, updatedAt: new Date() });
    const doc = await docRef.get();
    return doc.exists ? { id, ...doc.data() } : undefined;
  }
  async deleteTax(id: number): Promise<void> {
    if (!this.db) return;
    await this.db.collection(FIRESTORE_COLLECTIONS.TAXES).doc(id.toString()).delete();
  }
  async calculateTaxes(amount: number, taxIds: number[]): Promise<{ subtotal: number; taxes: any[]; total: number }> {
    const taxes = await this.getTaxes();
    const selected = taxes.filter((t: any) => taxIds.includes(t.id));
    let totalTax = 0;
    const taxDetails = selected.map((t: any) => {
      const amt = (amount * parseFloat(String(t.rate ?? 0))) / 100;
      totalTax += amt;
      return { name: t.name, rate: t.rate, amount: amt };
    });
    return { subtotal: amount, taxes: taxDetails, total: amount + totalTax };
  }

  // ============ CUPONES ============
  async getCoupons(_userId: string): Promise<any[]> {
    if (!this.db) return [];
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.COUPONS).get();
    return snap.docs.map(d => ({ id: parseInt(d.id) || d.id, ...d.data() }));
  }
  async createCoupon(coupon: any): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("coupons");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.COUPONS).doc(id.toString());
    const data = { id, ...coupon, usedCount: 0, usedByUsers: [], createdAt: new Date(), updatedAt: new Date() };
    await docRef.set(data);
    return data;
  }
  async updateCoupon(id: number, data: any): Promise<any | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.COUPONS).doc(id.toString());
    await docRef.update({ ...data, updatedAt: new Date() });
    const doc = await docRef.get();
    return doc.exists ? { id, ...doc.data() } : undefined;
  }
  async deleteCoupon(id: number): Promise<void> {
    if (!this.db) return;
    await this.db.collection(FIRESTORE_COLLECTIONS.COUPONS).doc(id.toString()).delete();
  }
  async validateCoupon(code: string, _serviceId?: number, _categoryId?: number, amount?: number, userId?: string): Promise<{ valid: boolean; discount: number; message: string }> {
    const coupons = await this.getCoupons(userId ?? "");
    const coupon = coupons.find((c: any) => String(c.code).toUpperCase() === code.toUpperCase());
    if (!coupon) return { valid: false, discount: 0, message: "Cupón no encontrado" };
    if (!coupon.isActive) return { valid: false, discount: 0, message: "Cupón inactivo" };
    const now = new Date();
    if (coupon.validFrom && now < new Date(coupon.validFrom)) return { valid: false, discount: 0, message: "Cupón aún no válido" };
    if (coupon.validUntil && now > new Date(coupon.validUntil)) return { valid: false, discount: 0, message: "Cupón expirado" };
    if (coupon.maxUses && (coupon.usedCount ?? 0) >= coupon.maxUses) return { valid: false, discount: 0, message: "Cupón agotado" };
    let discount = coupon.discountType === "percentage" ? (amount ?? 0) * parseFloat(String(coupon.discountValue)) / 100 : parseFloat(String(coupon.discountValue));
    if (coupon.maxDiscount && discount > parseFloat(String(coupon.maxDiscount))) discount = parseFloat(String(coupon.maxDiscount));
    return { valid: true, discount, message: "Cupón aplicado correctamente" };
  }

  // ============ SERVICIOS ADICIONALES ============
  async getServiceAddons(serviceId: number): Promise<any[]> {
    if (!this.db) return [];
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.SERVICE_ADDONS).where("serviceId", "==", serviceId).get();
    return snap.docs.map(d => ({ id: parseInt(d.id) || d.id, ...d.data() })).filter((a: any) => a.isActive !== false);
  }
  async createServiceAddon(addon: any): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("service_addons");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.SERVICE_ADDONS).doc(id.toString());
    const data = { id, ...addon, createdAt: new Date(), updatedAt: new Date() };
    await docRef.set(data);
    return data;
  }
  async updateServiceAddon(id: number, data: any): Promise<any | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.SERVICE_ADDONS).doc(id.toString());
    await docRef.update({ ...data, updatedAt: new Date() });
    const doc = await docRef.get();
    return doc.exists ? { id, ...doc.data() } : undefined;
  }
  async deleteServiceAddon(id: number): Promise<void> {
    if (!this.db) return;
    await this.db.collection(FIRESTORE_COLLECTIONS.SERVICE_ADDONS).doc(id.toString()).update({ isActive: false });
  }

  // ============ RESERVAS CON ADD-ONS ============
  async calculateBookingTotal(serviceId: number, addonIds: number[], couponCode?: string, userId?: string): Promise<any> {
    const service = await this.getService(serviceId);
    if (!service) throw new Error("Servicio no encontrado");
    let subtotal = parseFloat(String(service.price));
    const selectedAddons: any[] = [];
    if (addonIds.length) {
      const addons = await this.getServiceAddons(serviceId);
      const sel = addons.filter((a: any) => addonIds.includes(a.id));
      subtotal += sel.reduce((s, a) => s + parseFloat(String(a.price)), 0);
      selectedAddons.push(...sel);
    }
    let discount = 0;
    if (couponCode) {
      const v = await this.validateCoupon(couponCode, serviceId, service.categoryId, subtotal, userId);
      if (v.valid) discount = v.discount;
    }
    const taxCalc = await this.calculateTaxes(subtotal - discount, [1]);
    return { service: { id: service.id, name: service.title, price: service.price }, addons: selectedAddons, subtotal, discount, taxes: taxCalc.taxes, taxAmount: taxCalc.total - (subtotal - discount), total: taxCalc.total, currency: "USD" };
  }
  async getBookingAddons(bookingId: number): Promise<any[]> {
    if (!this.db) return [];
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.BOOKING_ADDONS).where("bookingId", "==", bookingId).get();
    return snap.docs.map(d => ({ id: parseInt(d.id) || d.id, ...d.data() }));
  }
  async addBookingAddon(bookingAddon: any): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("booking_addons");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKING_ADDONS).doc(id.toString());
    const data = { id, ...bookingAddon, createdAt: new Date() };
    await docRef.set(data);
    return data;
  }

  // ============ PAYMENT VOUCHERS ============
  async createPaymentVoucher(data: any): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("invoices");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.INVOICES).doc(id.toString());
    const voucher = { id, ...data, createdAt: new Date() };
    await docRef.set(voucher);
    return voucher;
  }
  async getPaymentVouchersByUser(userId: string): Promise<any[]> {
    if (!this.db) return [];
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.INVOICES).where("userId", "==", userId).get();
    return snap.docs.map(d => ({ id: parseInt(d.id) || d.id, ...d.data() }));
  }
  async updatePaymentVoucherStatus(id: number, status: string): Promise<any | null> {
    if (!this.db) return null;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.INVOICES).doc(id.toString());
    await docRef.update({ status });
    const doc = await docRef.get();
    return doc.exists ? { id, ...doc.data() } : null;
  }

  // ============ DEFINICIÓN DE ROLES (CRUD) ============
  async getRoles(): Promise<RoleDefinition[]> {
    if (!this.db) return [];
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.ROLES).get();
    const list = snap.docs.map(d => ({ ...d.data(), code: d.id } as RoleDefinition));
    return list.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  }

  async getRoleByCode(code: string): Promise<RoleDefinition | undefined> {
    if (!this.db) return undefined;
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.ROLES).doc(code).get();
    if (!doc.exists) return undefined;
    return { ...doc.data(), code: doc.id } as RoleDefinition;
  }

  async createRole(role: NewRoleDefinition): Promise<RoleDefinition> {
    if (!this.db) throw new Error("Firestore no configurado");
    const code = role.code.trim().toLowerCase().replace(/\s+/g, "_");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.ROLES).doc(code);
    const existing = await docRef.get();
    if (existing.exists) throw new Error("Ya existe un rol con ese código");
    const data: RoleDefinition = {
      ...role,
      code,
      isSystem: role.isSystem ?? false,
      sortOrder: role.sortOrder ?? 99,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await docRef.set(data);
    return data;
  }

  async updateRole(code: string, data: Partial<RoleDefinition>): Promise<RoleDefinition | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.ROLES).doc(code);
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    const { code: _c, createdAt: _t, ...rest } = data as Partial<RoleDefinition> & { code?: string; createdAt?: Date };
    await docRef.update({ ...rest, updatedAt: new Date() });
    const updated = await docRef.get();
    return updated.exists ? { ...updated.data(), code: updated.id } as RoleDefinition : undefined;
  }

  async deleteRole(code: string): Promise<void> {
    if (!this.db) return;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.ROLES).doc(code);
    const doc = await docRef.get();
    if (!doc.exists) return;
    const role = doc.data() as RoleDefinition;
    if (role?.isSystem) throw new Error("No se puede eliminar un rol del sistema");
    await docRef.delete();
  }

  async seedRoles(): Promise<void> {
    if (!this.db) return;
    const adminRef = this.db.collection(FIRESTORE_COLLECTIONS.ROLES).doc("admin");
    const adminSnap = await adminRef.get();
    if (adminSnap.exists) return;
    const defaults: RoleDefinition[] = [
      { code: "admin", name: "Administrador", description: "Acceso total al sistema", isSystem: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
      { code: "professional", name: "Profesional", description: "Proveedor de servicios", isSystem: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
      { code: "client", name: "Cliente", description: "Usuario que contrata servicios", isSystem: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
    ];
    for (const r of defaults) {
      await this.db.collection(FIRESTORE_COLLECTIONS.ROLES).doc(r.code).set(r);
    }
  }
}

// Instancia singleton
let firestoreStorage: FirestoreStorageImpl | null = null;

/**
 * Obtiene la instancia de Firestore Storage
 */
export function getFirestoreStorage(): FirestoreStorageImpl {
  if (!firestoreStorage) {
    firestoreStorage = new FirestoreStorageImpl();
  }
  return firestoreStorage;
}

/**
 * Inicializa Firebase y retorna el storage
 */
export async function initializeFirestoreStorage(): Promise<FirestoreStorage> {
  const initialized = initializeFirebase();
  
  if (!initialized) {
    console.log("⚠️ Usando almacenamiento en memoria (Firebase no configurado)");
    // Retorna el storage en memoria
    const { genFebStorage } = await import("./storage-genfeb");
    return genFebStorage as unknown as FirestoreStorage;
  }
  
  return getFirestoreStorage();
}

export type { FirestoreStorage };
