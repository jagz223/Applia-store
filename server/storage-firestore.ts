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
import { calcCommission, calcProviderNet } from "@shared/platform-commission";
import { getPlatformCommissionRate } from "./platform-commission-rate";
import { isFullAdmin } from "@shared/roles";
import type { ProfessionalVerification, ProfessionalVerificationState } from "@shared/professional-verification";
import type { VerifyingStatus } from "@shared/professional-verification";
import { isProfessionalVerificationLocked } from "@shared/professional-verification";
import { aggregateAdminDashboardStats, type AdminDashboardStatsResult } from "./admin-dashboard-stats";

/** Transfer type: service_payment = earnings from a booking; recharge = top-up to wallet; withdrawal = payout (admin processed); payment = client paid for a service (outflow from pending to provider). */
export type WalletTransferType = "service_payment" | "recharge" | "withdrawal" | "payment";

/** Transfer status: only "completed" recharge adds to wallet; "pending_approval" waits for staff. */
export type WalletTransferStatus = "pending_approval" | "completed" | "rejected";

export interface WalletTransfer {
  id: number;
  /** Quien recibe el dinero (beneficiario). */
  userId: string;
  /** Quien realiza la transferencia (ej. admin en recargas). Nunca se le descuenta saldo. */
  fromUserId?: string | null;
  amount: number;
  transferType: WalletTransferType;
  status: WalletTransferStatus;
  description?: string;
  referenceId?: string;
  currency?: string;
  createdAt: Date;
}

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
  /** Current wallet balance (default 0). */
  wallet?: number;
  /** Sum of all service_payment transfers for this user (denormalized for reads). */
  totalEarnings?: number;
  /** Saldo pendiente (por defecto 0). */
  pendingBalance?: number;
  /** Metadatos financieros: banco y número de cuenta para retiros/pagos. */
  bankName?: string;
  accountNumber?: string;
  /** Fondos en proceso de retiro (escrow hasta que el admin procese el pago). Default 0. */
  withdrawingFunds?: number;
  /** Calificación promedio (1-5). Por defecto 5. */
  rating?: number;
  /** Cantidad de valoraciones recibidas (para calcular promedio). */
  ratingCount?: number;
  /**
   * Prestador ha aceptado el estatuto de condiciones de uso (campo en inglés en Firestore).
   * Solo aplica a `role === "professional"`; por defecto false al volverse profesional.
   */
  acceptedProviderTermsOfUse?: boolean;
  /** Timestamp of soft deletion (null if active). */
  deletedAt?: Date | null;
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

  async getUserById(id: string, includeDeleted?: boolean): Promise<User | undefined> {
    if (!this.db) return undefined;
    
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc(id).get();
    if (!doc.exists) return undefined;
    
    const data = doc.data();
    if (!includeDeleted && data?.deletedAt) return undefined;
    
    return {
      id: doc.id,
      ...data,
    } as User;
  }

  async getUserByEmail(email: string, includeDeleted?: boolean): Promise<User | undefined> {
    if (!this.db) return undefined;
    
    const snapshot = await this.db.collection(FIRESTORE_COLLECTIONS.USERS)
      .where("email", "==", email)
      .limit(1)
      .get();
    
    if (snapshot.empty) return undefined;
    
    const doc = snapshot.docs[0];
    const data = doc.data();
    if (!includeDeleted && data?.deletedAt) return undefined;

    return {
      id: doc.id,
      ...data,
    } as User;
  }

  async getUsers(params: { role?: string; name?: string; email?: string; lastName?: string; search?: string; page: number; limit: number }): Promise<{ users: User[]; total: number }> {
    if (!this.db) return { users: [], total: 0 };
    const snapshot = await this.db.collection(FIRESTORE_COLLECTIONS.USERS).get();
    let list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User));
    const { role, name, email, lastName, search, page, limit } = params;
    if (role?.trim()) list = list.filter(u => (u.role || "").toLowerCase() === role.trim().toLowerCase());
    if (search?.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(u => {
        const name = (u as { name?: string }).name ?? (u as { firstName?: string }).firstName ?? "";
        const lastName = (u as { lastName?: string }).lastName ?? "";
        const email = (u as { email?: string }).email ?? "";
        return name.toLowerCase().includes(s) || lastName.toLowerCase().includes(s) || email.toLowerCase().includes(s);
      });
    } else {
      if (name?.trim()) {
        const n = name.trim().toLowerCase();
        list = list.filter(u => {
          const fullName = String((u as { name?: string }).name ?? (u as { firstName?: string }).firstName ?? "");
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
    const users = list.slice(start, start + limit).map(({ password: _p, ...u }) => u as User);
    return { users, total };
  }

  async createUser(user: Partial<User>): Promise<User> {
    if (!this.db) throw new Error("Firestore no configurado");
    
    // Buscar si el usuario ya existe (incluyendo eliminados)
    const snapshot = await this.db.collection(FIRESTORE_COLLECTIONS.USERS)
      .where("email", "==", user.email)
      .limit(1)
      .get();
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const existingData = doc.data();
      
      // Si el usuario existe y NO está eliminado, error
      if (!existingData.deletedAt) {
        throw new Error("El usuario con este email ya existe");
      }
      
      // Si está eliminado, lo reactivamos
      const now = new Date();
      const reactivatedUser = {
        ...existingData,
        ...user, // Actualizar datos con lo nuevo (password, nombre, etc.)
        deletedAt: null,
        isActive: true,
        updatedAt: now,
      };
      
      await doc.ref.update(reactivatedUser);
      return { id: doc.id, ...reactivatedUser } as User;
    }

    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc();
    const now = new Date();
    
    const role = user.role || "client";
    const newUser: User = {
      id: docRef.id,
      email: user.email!,
      password: user.password!,
      name: user.name!,
      lastName: user.lastName!,
      phone: user.phone,
      role,
      avatar: user.avatar,
      wallet: user.wallet ?? 0,
      totalEarnings: user.totalEarnings ?? 0,
      pendingBalance: user.pendingBalance ?? 0,
      rating: user.rating ?? 5,
      ratingCount: user.ratingCount ?? 0,
      ...(role === "professional"
        ? { acceptedProviderTermsOfUse: user.acceptedProviderTermsOfUse ?? false }
        : {}),
      deletedAt: null,
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

    // No permitir que actualizaciones genéricas (perfil, etc.) modifiquen campos financieros ni rating.
    // Solo los métodos dedicados (createTransfer, applyUserRating, etc.) deben alterarlos.
    const { wallet, totalEarnings, pendingBalance, withdrawingFunds, rating, ratingCount, ...safeData } = data as Partial<User> & {
      wallet?: number;
      totalEarnings?: number;
      pendingBalance?: number;
      withdrawingFunds?: number;
      rating?: number;
      ratingCount?: number;
    };
    void wallet;
    void totalEarnings;
    void pendingBalance;
    void withdrawingFunds;
    void rating;
    void ratingCount;

    await docRef.update({
      ...safeData,
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

  async deleteUser(id: string): Promise<void> {
    if (!this.db) return;
    // Realizar soft delete: marcar como inactivo y establecer fecha de eliminación
    await this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc(id).update({
      isActive: false,
      deletedAt: new Date(),
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

  async getSubcategories(categoryId: number): Promise<import("./storage-contracts").Subcategory[]> {
    if (!this.db) return [];
    const snapshot = await this.db
      .collection(FIRESTORE_COLLECTIONS.SUB_CATEGORIES)
      .where("categoryId", "==", categoryId)
      .get();
    return snapshot.docs.map((doc) => {
      const d = doc.data();
      const id = typeof d?.id === "number" ? d.id : parseInt(doc.id, 10);
      return {
        id,
        name: (d?.name as string) ?? "",
        slug: (d?.slug as string) ?? "",
        categoryId: (d?.categoryId ?? d?.categoria) as number,
        categorySlug: d?.categorySlug as string | undefined,
        icon: d?.icon ?? null,
      } as import("./storage-contracts").Subcategory;
    });
  }

  async getSubcategoryById(id: number): Promise<import("./storage-contracts").Subcategory | undefined> {
    if (!this.db) return undefined;
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.SUB_CATEGORIES).doc(String(id)).get();
    if (!doc.exists) return undefined;
    const d = doc.data()!;
    return {
      id: typeof d?.id === "number" ? d.id : parseInt(doc.id, 10),
      name: (d?.name as string) ?? "",
      slug: (d?.slug as string) ?? "",
      categoryId: (d?.categoryId ?? d?.categoria) as number,
      categorySlug: d?.categorySlug as string | undefined,
      icon: d?.icon ?? null,
    } as import("./storage-contracts").Subcategory;
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

    const provider = { id: parseInt(doc.id, 10), ...doc.data() } as Provider;
    return this.enrichProviderWithSubcategory(provider);
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
    // Administrador como asociado: visible y "verificado" en catálogo sin pasar por verificación de plataforma.
    const ownerRole = raw ? (raw as { role?: string }).role : undefined;
    const isVerified = provider.isVerified === true || isFullAdmin(ownerRole);
    return { ...provider, isVerified, user } as ProviderWithUser;
  }

  async getProviderByUserId(userId: string): Promise<Provider | undefined> {
    if (!this.db) return undefined;
    const snapshot = await this.db.collection(FIRESTORE_COLLECTIONS.PROVIDERS)
      .where("userId", "==", userId)
      .limit(1)
      .get();
    if (snapshot.empty) return undefined;
    const doc = snapshot.docs[0];
    const provider = { id: parseInt(doc.id), ...doc.data() } as Provider;
    const enriched = await this.enrichProviderWithSubcategory(provider);
    const rawUser = await this.getUserById(userId);
    const isVerified =
      (enriched as { isVerified?: boolean }).isVerified === true ||
      isFullAdmin((rawUser as { role?: string } | null)?.role);
    return { ...enriched, isVerified } as Provider;
  }

  /** Añade subcategory { id, name } al proveedor cuando tiene subcategoryId. */
  private async enrichProviderWithSubcategory<T extends { subcategoryId?: number | null }>(provider: T): Promise<T & { subcategory?: { id: number; name: string } | null }> {
    const subId = (provider as { subcategoryId?: number | null }).subcategoryId;
    if (subId == null || Number.isNaN(Number(subId))) return provider as T & { subcategory?: null };
    const sub = await this.getSubcategoryById(Number(subId));
    return { ...provider, subcategory: sub ? { id: sub.id, name: sub.name } : null } as T & { subcategory?: { id: number; name: string } | null };
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
      subcategoryId: (provider as { subcategoryId?: number | null }).subcategoryId ?? null,
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
    providerCategoryId?: number,
    subcategoryId?: number
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
    const subcategoryCache = new Map<number, { id: number; name: string }>();
    let servicesWithProviders: ServiceWithProvider[] = [];
    for (const service of services) {
      const provider = providerIdValid(service.providerId)
        ? await this.getProvider(service.providerId)
        : undefined;
      const providerWithUser = provider ? await this.enrichProviderWithUser(provider) : undefined;
      // Solo mostramos servicios de proveedores verificados (isVerified = true).
      if (!providerWithUser?.isVerified) continue;
      const category = allCategories.find((c) => c.id === service.categoryId);
      const subId = (service as { subcategoryId?: number | null }).subcategoryId;
      let subcategory: { id: number; name: string } | null = null;
      if (subId != null && !Number.isNaN(Number(subId))) {
        if (!subcategoryCache.has(Number(subId))) {
          const sub = await this.getSubcategoryById(Number(subId));
          if (sub) subcategoryCache.set(sub.id, { id: sub.id, name: sub.name });
        }
        subcategory = subcategoryCache.get(Number(subId)) ?? null;
      }
      servicesWithProviders.push({
        ...service,
        provider: providerWithUser ?? undefined,
        category: category ?? (allCategories[0] as Category),
        subcategory,
      } as ServiceWithProvider);
    }

    if (providerCategoryId != null && !Number.isNaN(providerCategoryId)) {
      servicesWithProviders = servicesWithProviders.filter((s) => {
        const p = s.provider as { categoryId?: number } | undefined;
        return p?.categoryId === providerCategoryId;
      });
    }
    if (subcategoryId != null && !Number.isNaN(subcategoryId)) {
      servicesWithProviders = servicesWithProviders.filter((s) => {
        const subId = (s as { subcategoryId?: number | null }).subcategoryId;
        return subId != null && Number(subId) === subcategoryId;
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
    // Si el proveedor no está verificado, no exponemos el servicio.
    if (!providerWithUser?.isVerified) return undefined;
    const allCategories = await this.getCategories();
    const category = allCategories.find((c) => c.id === service.categoryId) ?? (allCategories[0] as Category | undefined);
    const subId = (service as { subcategoryId?: number | null }).subcategoryId;
    let subcategory: { id: number; name: string } | null = null;
    if (subId != null && !Number.isNaN(Number(subId))) {
      const sub = await this.getSubcategoryById(Number(subId));
      if (sub) subcategory = { id: sub.id, name: sub.name };
    }
    return {
      ...service,
      provider: providerWithUser ?? undefined,
      category: category ?? ({} as Category),
      subcategory,
    } as ServiceWithProvider;
  }

  async createService(service: InsertService): Promise<Service> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("services");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.SERVICES).doc(id.toString());
    const newService = {
      id,
      ...service,
      subcategoryId: (service as { subcategoryId?: number | null }).subcategoryId ?? null,
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

  /** Convierte createdAt/date de Firestore (Timestamp o { _seconds, _nanoseconds }) a ms. Nunca usa .getTime() sobre el valor crudo. */
  private timestampToMs(x: unknown): number {
    if (x == null) return 0;
    if (typeof x === "number" && !Number.isNaN(x)) return x;
    if (typeof x === "string") return new Date(x).getTime();
    if (typeof x === "object") {
      const o = x as Record<string, unknown>;
      const sec = o.seconds ?? o._seconds;
      if (typeof sec === "number" && !Number.isNaN(sec)) return sec * 1000;
      if (typeof o.toMillis === "function") return (o.toMillis as () => number)();
    }
    if (x instanceof Date) return x.getTime();
    return 0;
  }

  async getBookingsByUser(userId: string, status?: string): Promise<(Booking & { service: ServiceWithProvider })[]> {
    if (!this.db) return [];
    try {
      const query = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS)
        .where("userId", "==", userId);

      const snapshot = await query.get();

      const bookings: (Booking & { service: ServiceWithProvider })[] = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const numericId = parseInt(doc.id, 10);
        const booking = {
          id: Number.isNaN(numericId) ? 0 : numericId,
          ...data,
        } as Booking;

        if (status && booking.status !== status) continue;

        let service: ServiceWithProvider | undefined;
        try {
          service = await this.getService(booking.serviceId);
        } catch (_) {
          service = undefined;
        }
        const serviceFallback = service ?? ({ id: 0, title: "Servicio", provider: undefined, category: {} } as ServiceWithProvider);
        bookings.push({
          ...booking,
          service: serviceFallback,
        });
      }

      bookings.sort((a, b) => {
        const aMs = this.timestampToMs((a as any).createdAt ?? (a as any).date);
        const bMs = this.timestampToMs((b as any).createdAt ?? (b as any).date);
        return bMs - aMs;
      });

      return bookings;
    } catch (err) {
      console.error("[getBookingsByUser]", err);
      return [];
    }
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
    const costNum = (booking as { cost?: number }).cost ?? (service?.price != null ? Number(service.price) : 0);
    const newBooking = {
      id,
      ...booking,
      providerId: providerId ?? (booking as any).providerId,
      notes: booking.notes ?? null,
      cost: costNum,
      confirmedByClient: false,
      paymentMethod: (booking as any).paymentMethod ?? "wallet",
      status: "pending",
      createdAt: new Date(),
    };
    await docRef.set(newBooking);
    return newBooking as unknown as Booking;
  }

  async updateBookingStatus(id: number, status: string): Promise<Booking | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    const updates: Record<string, unknown> = { status };
    if (status === "completed") updates.completedAt = new Date();
    await docRef.update(updates);
    const updated = await docRef.get();
    return { id: parseInt(updated.id), ...updated.data() } as Booking;
  }

  /** Aplica una nueva valoración al promedio del usuario (1-5 estrellas). */
  async applyUserRating(ratedUserId: string, newStars: number): Promise<void> {
    if (!this.db) return;
    const userRef = this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc(ratedUserId);
    const snap = await userRef.get();
    if (!snap.exists) return;
    const data = snap.data() as { rating?: number; ratingCount?: number };
    const currentRating = typeof data.rating === "number" ? data.rating : 5;
    const currentCount = typeof data.ratingCount === "number" ? data.ratingCount : 0;
    const stars = Math.min(5, Math.max(1, Math.round(newStars)));
    const newCount = currentCount + 1;
    const newAvg = (currentRating * currentCount + stars) / newCount;
    await userRef.update({
      rating: Math.round(newAvg * 100) / 100,
      ratingCount: newCount,
      updatedAt: new Date(),
    });
  }

  /** Verifica si ya existe una valoración de un usuario para una reserva. */
  private async hasBookingRating(bookingId: number, raterUserId: string): Promise<boolean> {
    if (!this.db) return false;
    const snap = await this.db
      .collection(FIRESTORE_COLLECTIONS.BOOKING_RATINGS)
      .where("bookingId", "==", bookingId)
      .where("raterUserId", "==", raterUserId)
      .limit(1)
      .get();
    return !snap.empty;
  }

  /** Registra una valoración de reserva y actualiza el promedio del usuario valorado. */
  async submitBookingRating(
    raterUserId: string,
    bookingId: number,
    ratedUserId: string,
    roleRated: "professional" | "client",
    stars: number
  ): Promise<void> {
    if (!this.db) throw new Error("Firestore no configurado");
    const safeStars = Math.min(5, Math.max(1, Math.round(stars)));
    const id = await this.getNextId("booking_ratings");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKING_RATINGS).doc(String(id));
    await docRef.set({
      id,
      bookingId,
      raterUserId,
      ratedUserId,
      roleRated,
      stars: safeStars,
      createdAt: new Date(),
    });
    await this.applyUserRating(ratedUserId, safeStars);
  }

  /** Días tras los cuales se asigna 3 estrellas por defecto si no se valoró. */
  private static readonly PENDING_RATING_DAYS_BEFORE_DEFAULT = 7;

  /**
   * Lista reservas completadas en las que el usuario aún no ha valorado a la otra parte.
   * Si una reserva completada tiene más de PENDING_RATING_DAYS_BEFORE_DEFAULT días, se asigna 3 estrellas automáticamente.
   */
  async getPendingBookingRatings(userId: string): Promise<
    Array<{
      bookingId: number;
      rateeUserId: string;
      rateeName: string;
      roleRated: "professional" | "client";
      serviceTitle?: string;
      completedAt?: Date;
    }>
  > {
    if (!this.db) return [];
    const result: Array<{
      bookingId: number;
      rateeUserId: string;
      rateeName: string;
      roleRated: "professional" | "client";
      serviceTitle?: string;
      completedAt?: Date;
    }> = [];
    const now = new Date();
    const cutoffMs = now.getTime() - FirestoreStorageImpl.PENDING_RATING_DAYS_BEFORE_DEFAULT * 24 * 60 * 60 * 1000;

    const provider = await this.getProviderByUserId(userId);
    const providerId = provider?.id;

    const bookingsSnap = await this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).where("status", "==", "completed").get();
    const ratingsSnap = await this.db
      .collection(FIRESTORE_COLLECTIONS.BOOKING_RATINGS)
      .where("raterUserId", "==", userId)
      .get();
    const ratedBookingIds = new Set(ratingsSnap.docs.map((d) => (d.data() as { bookingId: number }).bookingId));

    for (const doc of bookingsSnap.docs) {
      const b = doc.data() as { id?: string; userId?: string; providerId?: number; serviceId?: number; completedAt?: Date | { toDate?: () => Date }; status?: string };
      const bookingId = parseInt(doc.id, 10);
      if (Number.isNaN(bookingId)) continue;
      const clientUserId = b.userId;
      const provId = b.providerId;
      if (!clientUserId || provId == null) continue;

      const isClient = clientUserId === userId;
      const isProvider = providerId != null && provId === providerId;
      if (!isClient && !isProvider) continue;
      if (ratedBookingIds.has(bookingId)) continue;

      const completedAtRaw = b.completedAt;
      let completedAt: Date | undefined;
      if (completedAtRaw instanceof Date) completedAt = completedAtRaw;
      else if (completedAtRaw && typeof (completedAtRaw as { toDate?: () => Date }).toDate === "function")
        completedAt = (completedAtRaw as { toDate: () => Date }).toDate();
      else if (completedAtRaw && typeof (completedAtRaw as { seconds?: number }).seconds === "number")
        completedAt = new Date((completedAtRaw as { seconds: number }).seconds * 1000);

      if (completedAt && completedAt.getTime() < cutoffMs) {
        const rateeUserId = isClient ? (await this.getProvider(provId))?.userId : clientUserId;
        if (rateeUserId) {
          try {
            await this.submitBookingRating(userId, bookingId, rateeUserId, isClient ? "professional" : "client", 3);
            ratedBookingIds.add(bookingId);
          } catch (_) {
            // si falla el auto-3, lo incluimos en pendientes para que el usuario valore
          }
        }
        continue;
      }

      const rateeUserId = isClient ? (await this.getProvider(provId))?.userId : clientUserId;
      if (!rateeUserId) continue;
      const rateeUser = await this.getUserById(rateeUserId);
      const rateeName = rateeUser
        ? [((rateeUser as User).name ?? (rateeUser as { firstName?: string }).firstName ?? ""), (rateeUser as { lastName?: string }).lastName ?? ""].filter(Boolean).join(" ").trim() || "Usuario"
        : "Usuario";

      let serviceTitle: string | undefined;
      if (b.serviceId != null) {
        const svc = await this.getService(Number(b.serviceId));
        serviceTitle = svc?.title;
      }

      result.push({
        bookingId,
        rateeUserId,
        rateeName,
        roleRated: isClient ? "professional" : "client",
        serviceTitle,
        completedAt,
      });
    }
    return result;
  }

  /**
   * Cancelación por el profesional cuando el cliente ya confirmó el pago:
   * el monto retenido sale del pendingBalance del cliente y regresa íntegramente a su wallet.
   * La reserva pasa a estado 'cancelled'. Transacción ACID.
   */
  async cancelBookingAndRefundClientEscrow(bookingId: number): Promise<Booking | undefined> {
    if (!this.db) return undefined;
    const bookingsColl = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS);
    const usersColl = this.db.collection(FIRESTORE_COLLECTIONS.USERS);
    const transfersColl = this.db.collection(FIRESTORE_COLLECTIONS.WALLET_TRANSFERS);
    const transferId1 = await this.getNextId("wallet_transfers");

    return this.db.runTransaction(async (t) => {
      const bookingRef = bookingsColl.doc(bookingId.toString());
      const bookingSnap = await t.get(bookingRef);
      if (!bookingSnap.exists) return undefined;
      const data = bookingSnap.data() as { status?: string; userId?: string; cost?: number; confirmedByClient?: boolean };

      if (data.confirmedByClient !== true) {
        // Si el cliente no confirmó el pago, solo marcamos cancelado sin mover dinero.
        const now = new Date();
        t.update(bookingRef, { status: "cancelled", cancelledAt: now });
        return { id: bookingId, ...data, status: "cancelled" } as Booking;
      }

      const cost = typeof data.cost === "number" ? data.cost : Number(data.cost) || 0;
      if (cost <= 0) throw new Error("Costo de reserva no definido");
      const clientUserId = data.userId;
      if (!clientUserId) throw new Error("Reserva sin cliente asociado");

      const clientRef = usersColl.doc(clientUserId);
      const clientSnap = await t.get(clientRef);
      if (!clientSnap.exists) throw new Error("Usuario cliente no encontrado");
      const clientData = clientSnap.data() as { wallet?: number; pendingBalance?: number };
      const clientWallet = typeof clientData.wallet === "number" ? clientData.wallet : 0;
      const clientPending = typeof clientData.pendingBalance === "number" ? clientData.pendingBalance : 0;
      if (clientPending < cost) {
        throw new Error("Fondos retenidos insuficientes para revertir el pago al cliente");
      }

      const now = new Date();
      t.update(bookingRef, { status: "cancelled", cancelledAt: now });
      t.update(clientRef, {
        wallet: clientWallet + cost,
        pendingBalance: clientPending - cost,
        updatedAt: now,
      });

      // Registrar movimiento en "wallet_transfers" para que el cliente vea el reembolso.
      const clientRefundTransferRecord = {
        id: transferId1,
        userId: clientUserId,
        fromUserId: null,
        amount: cost,
        transferType: "recharge" as WalletTransferType,
        status: "completed" as WalletTransferStatus,
        description: "Reembolso por cancelación de servicio",
        referenceId: String(bookingId),
        currency: "USD",
        createdAt: now,
      };
      t.set(transfersColl.doc(String(transferId1)), clientRefundTransferRecord);

      return { id: bookingId, ...data, status: "cancelled" } as Booking;
    });
  }

  /**
   * Marcar reserva como completada y liberar escrow: el monto exacto del servicio sale del
   * saldo pendiente del cliente y entra en la wallet del profesional. Se registran dos
   * filas en wallet_transfers (cliente: payment; profesional: service_payment) para que
   * ambas partes vean el movimiento en sus transacciones.
   */
  async completeBookingAndReleaseEscrow(bookingId: number): Promise<Booking | undefined> {
    if (!this.db) return undefined;
    const commissionRate = await getPlatformCommissionRate();
    const bookingsColl = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS);
    const usersColl = this.db.collection(FIRESTORE_COLLECTIONS.USERS);
    const providersColl = this.db.collection(FIRESTORE_COLLECTIONS.PROVIDERS);
    const transfersColl = this.db.collection(FIRESTORE_COLLECTIONS.WALLET_TRANSFERS);

    // La comisión de plataforma se acredita al primer usuario con rol admin o Soporte TI.
    const adminSnap = await this.db
      .collection(FIRESTORE_COLLECTIONS.USERS)
      .where("role", "in", ["admin", "tiSupport"])
      .limit(1)
      .get();
    if (adminSnap.empty) throw new Error("No existe usuario admin o soporte TI para registrar la comisión de plataforma");
    const adminUserId = adminSnap.docs[0].id;

    const transferId1 = await this.getNextId("wallet_transfers");
    const transferId2 = await this.getNextId("wallet_transfers");
    const transferId3 = await this.getNextId("wallet_transfers");

    return this.db.runTransaction(async (t) => {
      const bookingRef = bookingsColl.doc(bookingId.toString());
      const bookingSnap = await t.get(bookingRef);
      if (!bookingSnap.exists) return undefined;
      const data = bookingSnap.data() as { 
        status?: string; 
        userId?: string; 
        providerId?: number; 
        cost?: number; 
        confirmedByClient?: boolean;
        paymentMethod?: string;
      };
      
      if (data.status === "completed") return { id: bookingId, ...data } as Booking;
      
      const paymentMethod = data.paymentMethod || "wallet";
      const cost = typeof data.cost === "number" ? data.cost : Number(data.cost) || 0;
      if (cost <= 0) throw new Error("Costo de reserva no definido");
      
      // Validaciones específicas por método de pago
      if (paymentMethod === "wallet") {
        if (data.confirmedByClient !== true) {
          throw new Error("El servicio requiere confirmación previa del cliente para procesar los fondos retenidos");
        }
      }

      const commission = calcCommission(cost, commissionRate);
      const providerNet = calcProviderNet(cost, commissionRate);
      const clientUserId = data.userId;
      const providerId = data.providerId;
      if (!clientUserId) throw new Error("Reserva sin cliente asociado");
      if (providerId == null) throw new Error("Reserva sin profesional asociado");

      // Datos del Cliente (solo necesarios para Wallet)
      const clientRef = usersColl.doc(clientUserId);
      const clientSnap = await t.get(clientRef);
      if (!clientSnap.exists) throw new Error("Usuario cliente no encontrado");
      const clientData = clientSnap.data() as { pendingBalance?: number };
      const clientPending = typeof clientData.pendingBalance === "number" ? clientData.pendingBalance : 0;
      
      if (paymentMethod === "wallet") {
        if (clientPending < cost) throw new Error("Fondos en espera del cliente insuficientes para este servicio");
      }

      // Datos del Profesional (usuario asociado al providerId)
      const providerRef = providersColl.doc(String(providerId));
      const providerSnap = await t.get(providerRef);
      if (!providerSnap.exists) throw new Error("Profesional no encontrado");
      const providerUserId = (providerSnap.data() as { userId?: string }).userId;
      if (!providerUserId) throw new Error("Profesional sin usuario asociado");

      const providerUserRef = usersColl.doc(providerUserId);
      const providerUserSnap = await t.get(providerUserRef);
      if (!providerUserSnap.exists) throw new Error("Usuario del profesional no encontrado");
      const providerWallet = typeof (providerUserSnap.data() as { wallet?: number }).wallet === "number" ? (providerUserSnap.data() as { wallet: number }).wallet : 0;
      const providerTotalEarnings = typeof (providerUserSnap.data() as { totalEarnings?: number }).totalEarnings === "number" ? (providerUserSnap.data() as { totalEarnings: number }).totalEarnings : 0;

      // Para Cash, permitimos saldo negativo (se descuenta aunque no tenga fondos)

      // Datos del Admin
      const adminUserRef = usersColl.doc(adminUserId);
      const adminSnap2 = await t.get(adminUserRef);
      if (!adminSnap2.exists) throw new Error("Admin no encontrado");
      const adminWallet = typeof (adminSnap2.data() as { wallet?: number }).wallet === "number" ? (adminSnap2.data() as { wallet: number }).wallet : 0;
      const adminTotalEarnings = typeof (adminSnap2.data() as { totalEarnings?: number }).totalEarnings === "number" ? (adminSnap2.data() as { totalEarnings: number }).totalEarnings : 0;

      const now = new Date();
      t.update(bookingRef, { status: "completed", completedAt: now });

      if (paymentMethod === "wallet") {
        // Lógica Wallet: Client Pending -> Provider Wallet
        t.update(clientRef, { pendingBalance: clientPending - cost, updatedAt: now });
        t.update(providerUserRef, { 
          wallet: providerWallet + providerNet, 
          totalEarnings: providerTotalEarnings + providerNet, 
          updatedAt: now 
        });
        
        // Registros de transferencia para Wallet
        t.set(transfersColl.doc(String(transferId1)), {
          id: transferId1, userId: clientUserId, fromUserId: null, amount: cost,
          transferType: "payment", status: "completed", description: "Pago por servicio (Wallet)",
          referenceId: String(bookingId), currency: "USD", createdAt: now,
        });
        t.set(transfersColl.doc(String(transferId2)), {
          id: transferId2, userId: providerUserId, fromUserId: null, amount: providerNet,
          transferType: "service_payment", status: "completed", description: "Pago por servicio completado (neto)",
          referenceId: String(bookingId), currency: "USD", createdAt: now,
        });
      } else {
        // Lógica Cash: Solo descontar comisión del profesional
        t.update(providerUserRef, { 
          wallet: providerWallet - commission, 
          updatedAt: now 
        });
        
        // Registro de transferencia para Cash (solo la comisión)
        t.set(transfersColl.doc(String(transferId2)), {
          id: transferId2, userId: providerUserId, fromUserId: null, amount: commission,
          transferType: "service_payment", status: "completed", description: "Comisión de plataforma por servicio en efectivo",
          referenceId: String(bookingId), currency: "USD", createdAt: now,
        });
      }

      // Admin recibe la comisión en ambos casos
      t.update(adminUserRef, { wallet: adminWallet + commission, totalEarnings: adminTotalEarnings + commission, updatedAt: now });
      t.set(transfersColl.doc(String(transferId3)), {
        id: transferId3, userId: adminUserId, fromUserId: null, amount: commission,
        transferType: "service_payment", status: "completed", description: `Comisión de plataforma por servicio (${paymentMethod})`,
        referenceId: String(bookingId), currency: "USD", createdAt: now,
      });

      return { id: bookingId, ...data, status: "completed" } as unknown as Booking;
    });
  }

  async updateBookingCost(id: number, cost: number): Promise<Booking | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    await docRef.update({ cost: Number(cost) });
    const updated = await docRef.get();
    return { id: parseInt(updated.id), ...updated.data() } as Booking;
  }

  async updateBookingSchedule(id: number, date: Date): Promise<Booking | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    await docRef.update({ date });
    const updated = await docRef.get();
    return { id: parseInt(updated.id), ...updated.data() } as Booking;
  }

  /**
   * Handshake/Escrow: cliente confirma pago. El monto va al saldo pendiente del cliente (no del profesional).
   * Transacción ACID:
   * 1) booking.status === 'confirmed'
   * 2) client.wallet >= cost
   * 3) Débito client.wallet -= cost
   * 4) Crédito client.pendingBalance += cost (dinero retenido del cliente para este servicio)
   * 5) booking.confirmedByClient = true
   * Al completar el profesional, ese monto exacto pasará de client.pendingBalance a provider.wallet.
   */
  async confirmBookingByClient(bookingId: number): Promise<Booking> {
    if (!this.db) throw new Error("Firestore no configurado");
    const bookingsColl = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS);
    const usersColl = this.db.collection(FIRESTORE_COLLECTIONS.USERS);

    return this.db.runTransaction(async (t) => {
      const bookingRef = bookingsColl.doc(bookingId.toString());
      const bookingSnap = await t.get(bookingRef);
      if (!bookingSnap.exists) throw new Error("Reserva no encontrada");
      const bookingData = bookingSnap.data() as { status?: string; userId?: string; providerId?: number; cost?: number; confirmedByClient?: boolean };
      if ((bookingData.status || "pending") !== "confirmed") {
        throw new Error("Solo puedes confirmar el pago cuando el profesional haya confirmado la reserva");
      }
      if (bookingData.confirmedByClient === true) {
        throw new Error("Esta reserva ya fue confirmada por el cliente");
      }
      const cost = typeof bookingData.cost === "number" ? bookingData.cost : Number(bookingData.cost) || 0;
      if (cost <= 0) throw new Error("El costo de la reserva no está definido");
      const clientUserId = bookingData.userId;
      if (!clientUserId) throw new Error("Reserva sin cliente asociado");

      const clientRef = usersColl.doc(clientUserId);
      const clientSnap = await t.get(clientRef);
      if (!clientSnap.exists) throw new Error("Usuario cliente no encontrado");
      const clientData = clientSnap.data() as { wallet?: number; pendingBalance?: number };
      const clientWallet = typeof clientData.wallet === "number" ? clientData.wallet : 0;
      const clientPending = typeof clientData.pendingBalance === "number" ? clientData.pendingBalance : 0;
      if (clientWallet < cost) {
        throw new Error("Saldo insuficiente. Recarga tu billetera para confirmar el pago.");
      }

      const now = new Date();
      t.update(clientRef, {
        wallet: clientWallet - cost,
        pendingBalance: clientPending + cost,
        updatedAt: now,
      });
      t.update(bookingRef, { confirmedByClient: true });

      return {
        id: bookingId,
        ...bookingData,
        confirmedByClient: true,
      } as Booking;
    });
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

  // ============ WALLET & TRANSFERS ============

  async createTransfer(transfer: {
    userId: string;
    fromUserId?: string | null;
    amount: number;
    transferType: WalletTransferType;
    status?: WalletTransferStatus;
    description?: string;
    referenceId?: string;
    currency?: string;
  }): Promise<WalletTransfer> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("wallet_transfers");
    const coll = this.db.collection(FIRESTORE_COLLECTIONS.WALLET_TRANSFERS);
    const userRef = this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc(transfer.userId);
    const now = new Date();
    const resolvedStatus: WalletTransferStatus =
      transfer.status ??
      (transfer.transferType === "recharge" ? "pending_approval" : "completed");
    const record: Omit<WalletTransfer, "id"> & { id: number } = {
      id,
      userId: transfer.userId,
      fromUserId: transfer.fromUserId ?? null,
      amount: transfer.amount,
      transferType: transfer.transferType,
      status: resolvedStatus,
      description: transfer.description,
      referenceId: transfer.referenceId,
      currency: transfer.currency ?? "USD",
      createdAt: now,
    };
    // Solo se acredita al beneficiario (userId). fromUserId (ej. admin) nunca se descuenta.
    const shouldCreditServicePayment =
      transfer.transferType === "service_payment" && resolvedStatus === "completed";
    const shouldCreditManualRecharge =
      transfer.transferType === "recharge" && resolvedStatus === "completed";
    await this.db.runTransaction(async (t) => {
      const userSnap = await t.get(userRef);
      if (!userSnap.exists) throw new Error("Usuario no encontrado");
      t.set(coll.doc(id.toString()), record);
      if (shouldCreditServicePayment) {
        const data = userSnap.data() as User;
        const currentWallet = typeof data.wallet === "number" ? data.wallet : 0;
        const currentTotalEarnings = typeof data.totalEarnings === "number" ? data.totalEarnings : 0;
        t.update(userRef, {
          wallet: currentWallet + transfer.amount,
          totalEarnings: currentTotalEarnings + transfer.amount,
          updatedAt: now,
        });
      } else if (shouldCreditManualRecharge) {
        const data = userSnap.data() as User;
        const currentWallet = typeof data.wallet === "number" ? data.wallet : 0;
        t.update(userRef, {
          wallet: currentWallet + transfer.amount,
          updatedAt: now,
        });
      }
    });
    return { ...record };
  }

  async getWalletTransfer(id: number | string): Promise<any | null> {
    if (!this.db) return null;
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.WALLET_TRANSFERS).doc(id.toString()).get();
    if (!doc.exists) return null;
    return { id: parseInt(doc.id, 10) || doc.id, ...doc.data() };
  }

  async getTransfersByUser(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      transferType?: WalletTransferType;
      status?: WalletTransferStatus;
      description?: string;
      dateFrom?: string;
      dateTo?: string;
      amountMin?: number;
      amountMax?: number;
    }
  ): Promise<{ transfers: WalletTransfer[]; total: number }> {
    if (!this.db) return { transfers: [], total: 0 };
    const q = this.db
      .collection(FIRESTORE_COLLECTIONS.WALLET_TRANSFERS)
      .where("userId", "==", userId);
    const snap = await q.get();
    const toMs = (x: unknown) =>
      x instanceof Date ? x.getTime() : (x as { toMillis?: () => number })?.toMillis?.() ?? 0;
    let list = snap.docs.map((d) => ({ id: parseInt(d.id, 10), ...d.data() } as WalletTransfer));
    list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));

    if (options?.transferType) list = list.filter((t) => t.transferType === options.transferType);
    if (options?.status) list = list.filter((t) => t.status === options.status);
    if (options?.description?.trim()) {
      const term = options.description.trim().toLowerCase();
      list = list.filter((t) => (t.description ?? "").toLowerCase().includes(term));
    }
    if (options?.dateFrom) {
      const from = new Date(options.dateFrom).getTime();
      list = list.filter((t) => toMs(t.createdAt) >= from);
    }
    if (options?.dateTo) {
      const to = new Date(options.dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((t) => toMs(t.createdAt) <= to.getTime());
    }
    if (options?.amountMin != null) list = list.filter((t) => t.amount >= options.amountMin!);
    if (options?.amountMax != null) list = list.filter((t) => t.amount <= options.amountMax!);

    const total = list.length;
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 10));
    const start = (page - 1) * limit;
    const transfers = list.slice(start, start + limit);
    return { transfers, total };
  }

  async getAllTransfers(): Promise<{ transfers: WalletTransfer[]; total: number }> {
    if (!this.db) return { transfers: [], total: 0 };
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.WALLET_TRANSFERS).get();
    const toMs = (x: unknown) =>
      x instanceof Date ? x.getTime() : (x as { toMillis?: () => number })?.toMillis?.() ?? 0;
    const list = snap.docs.map((d) => ({ id: parseInt(d.id, 10), ...d.data() } as WalletTransfer));
    list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
    return { transfers: list, total: list.length };
  }

  async updateTransferStatus(transferId: string, status: WalletTransferStatus): Promise<WalletTransfer> {
    if (!this.db) throw new Error("Firestore no configurado");
    const coll = this.db.collection(FIRESTORE_COLLECTIONS.WALLET_TRANSFERS);
    const transferRef = coll.doc(transferId);
    const now = new Date();

    return this.db.runTransaction(async (t) => {
      const transferSnap = await t.get(transferRef);
      if (!transferSnap.exists) {
        throw new Error("Transferencia no encontrada");
      }
      const data = transferSnap.data() as Record<string, unknown>;
      const currentStatus = data.status as WalletTransferStatus;
      const transferType = data.transferType as WalletTransferType;
      const userId = data.userId as string;
      const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);

      const isRechargeCompleted =
        transferType === "recharge" && status === "completed" && currentStatus !== "completed";

      if (isRechargeCompleted) {
        const userRef = this.db!.collection(FIRESTORE_COLLECTIONS.USERS).doc(userId);
        const userSnap = await t.get(userRef);
        if (!userSnap.exists) {
          throw new Error("Usuario no encontrado");
        }
        const userData = userSnap.data() as User;
        const currentWallet = typeof userData.wallet === "number" ? userData.wallet : 0;
        t.update(userRef, {
          wallet: currentWallet + amount,
          updatedAt: now,
        });
      }

      t.update(transferRef, { status });
      const id = typeof data.id === "number" ? data.id : parseInt(transferId, 10);
      const createdAt = data.createdAt instanceof Date ? data.createdAt : (data.createdAt as { toDate?: () => Date })?.toDate?.() ?? now;
      return {
        id,
        userId: data.userId as string,
        fromUserId: data.fromUserId as string | null | undefined,
        amount: typeof data.amount === "number" ? data.amount : Number(data.amount),
        transferType: data.transferType as WalletTransferType,
        status,
        description: data.description as string | undefined,
        referenceId: data.referenceId as string | undefined,
        currency: data.currency as string | undefined,
        createdAt,
      } as WalletTransfer;
    });
  }

  async getTotalPlatformBalance(): Promise<number> {
    if (!this.db) return 0;
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.USERS).get();
    let total = 0;
    snap.docs.forEach((doc) => {
      const w = (doc.data() as User).wallet;
      if (typeof w === "number") total += w;
    });
    return total;
  }

  async requestWithdraw(
    userId: string,
    amount: number
  ): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
    if (!this.db) return { ok: false, code: "unavailable", message: "Storage no configurado" };
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, code: "invalid_amount", message: "El monto debe ser mayor a cero" };
    }
    const userRef = this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc(userId);
    const now = new Date();
    try {
      await this.db.runTransaction(async (t) => {
        const userSnap = await t.get(userRef);
        if (!userSnap.exists) throw new Error("Usuario no encontrado");
        const data = userSnap.data() as User;
        const wallet = typeof data.wallet === "number" ? data.wallet : 0;
        const bankName = typeof data.bankName === "string" ? data.bankName.trim() : "";
        const accountNumber = typeof data.accountNumber === "string" ? data.accountNumber.trim() : "";
        if (!bankName || !accountNumber) {
          throw new Error("MISSING_BANK_DATA");
        }
        // withdrawingFunds = escrow solo para retiros (no es pendingBalance, que es solo escrow de reservas del cliente).
        const withdrawingFunds = typeof data.withdrawingFunds === "number" ? data.withdrawingFunds : 0;
        if (withdrawingFunds > 0) {
          throw new Error("WITHDRAW_PENDING");
        }
        if (wallet < amount) {
          throw new Error("INSUFFICIENT_BALANCE");
        }
        // Fondos en Tránsito (retiros): debitar wallet y acreditar withdrawingFunds en la misma transacción (atómico).
        t.update(userRef, {
          wallet: wallet - amount,
          withdrawingFunds: withdrawingFunds + amount,
          updatedAt: now,
        });
      });
      return { ok: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "WITHDRAW_PENDING") {
        return { ok: false, code: "withdraw_pending", message: "Ya existe un retiro en proceso. Espere a que el administrador lo procese." };
      }
      if (msg === "INSUFFICIENT_BALANCE") {
        return { ok: false, code: "insufficient_balance", message: "Saldo insuficiente" };
      }
      if (msg === "Usuario no encontrado") {
        return { ok: false, code: "user_not_found", message: msg };
      }
      if (msg === "MISSING_BANK_DATA") {
        return { ok: false, code: "missing_bank_data", message: "Complete los datos bancarios (banco y número de cuenta) en su perfil." };
      }
      throw e;
    }
  }

  async getUsersWithPendingWithdrawals(): Promise<
    Array<{ id: string; name: string; lastName: string; email: string; bankName?: string; accountNumber?: string; withdrawingFunds: number }>
  > {
    if (!this.db) return [];
    const snap = await this.db
      .collection(FIRESTORE_COLLECTIONS.USERS)
      .where("withdrawingFunds", ">", 0)
      .get();
    return snap.docs.map((d) => {
      const data = d.data() as User;
      const name = data.name ?? (data as { firstName?: string }).firstName ?? "";
      const lastName = data.lastName ?? "";
      return {
        id: d.id,
        name,
        lastName,
        email: data.email ?? "",
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        withdrawingFunds: typeof data.withdrawingFunds === "number" ? data.withdrawingFunds : 0,
      };
    });
  }

  /**
   * Liquidación (aprobación): withdrawingFunds → 0 y se crea registro en historial con status completed.
   * El monto NO se acredita a ninguna cuenta de admin; la deuda se saldó por transferencia bancaria externa.
   */
  async processWithdrawalApproval(userId: string, adminUserId: string): Promise<{ transfer: WalletTransfer; user: User }> {
    if (!this.db) throw new Error("Firestore no configurado");
    const userRef = this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc(userId);
    const coll = this.db.collection(FIRESTORE_COLLECTIONS.WALLET_TRANSFERS);
    const id = await this.getNextId("wallet_transfers");
    const now = new Date();
    let transferResult: WalletTransfer | null = null;
    let userResult: User | null = null;
    await this.db.runTransaction(async (t) => {
      const userSnap = await t.get(userRef);
      if (!userSnap.exists) throw new Error("Usuario no encontrado");
      const data = userSnap.data() as User;
      const withdrawingFunds = typeof data.withdrawingFunds === "number" ? data.withdrawingFunds : 0;
      if (withdrawingFunds <= 0) throw new Error("No hay retiro pendiente");
      const bankName = typeof data.bankName === "string" ? data.bankName : undefined;
      const accountNumber = typeof data.accountNumber === "string" ? data.accountNumber : undefined;
      const record = {
        id,
        userId,
        fromUserId: adminUserId,
        amount: withdrawingFunds,
        transferType: "withdrawal" as WalletTransferType,
        status: "completed" as WalletTransferStatus,
        description: "Retiro Completado",
        referenceId: null,
        currency: "USD",
        createdAt: now,
        bankName,
        accountNumber,
      };
      t.set(coll.doc(id.toString()), record);
      t.update(userRef, { withdrawingFunds: 0, updatedAt: now });
      transferResult = { ...record } as WalletTransfer;
      userResult = { ...data, withdrawingFunds: 0, updatedAt: now };
    });
    if (!transferResult || !userResult) throw new Error("Transacción no devolvió resultado");
    return { transfer: transferResult, user: userResult };
  }

  /**
   * Rollback (rechazo): withdrawingFunds regresa íntegramente al wallet del profesional; luego withdrawingFunds = 0.
   */
  async processWithdrawalRejection(userId: string): Promise<{ user: User; amount: number }> {
    if (!this.db) throw new Error("Firestore no configurado");
    const userRef = this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc(userId);
    const now = new Date();
    let userResult: User | null = null;
    let amount = 0;
    await this.db.runTransaction(async (t) => {
      const userSnap = await t.get(userRef);
      if (!userSnap.exists) throw new Error("Usuario no encontrado");
      const data = userSnap.data() as User;
      const withdrawingFunds = typeof data.withdrawingFunds === "number" ? data.withdrawingFunds : 0;
      if (withdrawingFunds <= 0) throw new Error("No hay retiro pendiente");
      amount = withdrawingFunds;
      const wallet = typeof data.wallet === "number" ? data.wallet : 0;
      t.update(userRef, {
        wallet: wallet + withdrawingFunds,
        withdrawingFunds: 0,
        updatedAt: now,
      });
      userResult = { ...data, wallet: wallet + withdrawingFunds, withdrawingFunds: 0, updatedAt: now };
    });
    if (!userResult) throw new Error("Transacción no devolvió resultado");
    return { user: userResult, amount };
  }

  async recordWithdrawalRejection(
    userId: string,
    amount: number,
    adminUserId: string,
    bankName?: string,
    accountNumber?: string
  ): Promise<void> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("withdrawal_rejections");
    const coll = this.db.collection(FIRESTORE_COLLECTIONS.WITHDRAWAL_REJECTIONS);
    await coll.doc(id.toString()).set({
      id,
      userId,
      amount,
      rejectedAt: new Date(),
      rejectedByUserId: adminUserId,
      bankName: bankName ?? null,
      accountNumber: accountNumber ?? null,
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
    if (!this.db) return { items: [], total: 0 };
    const toMs = (x: unknown) =>
      x instanceof Date ? x.getTime() : (x as { toMillis?: () => number })?.toMillis?.() ?? 0;

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

    const approvedSnap = await this.db
      .collection(FIRESTORE_COLLECTIONS.WALLET_TRANSFERS)
      .where("transferType", "==", "withdrawal")
      .where("status", "==", "completed")
      .get();
    const approved = approvedSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: `approval-${d.id}`,
        userId: data.userId,
        amount: data.amount as number,
        status: "approved" as const,
        processedAt: data.createdAt,
        processedByAdminId: data.fromUserId as string,
        bankName: data.bankName as string | undefined,
        accountNumber: data.accountNumber as string | undefined,
      };
    });

    const rejSnap = await this.db.collection(FIRESTORE_COLLECTIONS.WITHDRAWAL_REJECTIONS).get();
    const rejected = rejSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: `rejection-${d.id}`,
        userId: data.userId as string,
        amount: data.amount as number,
        status: "rejected" as const,
        processedAt: data.rejectedAt,
        processedByAdminId: data.rejectedByUserId as string,
        bankName: data.bankName as string | undefined,
        accountNumber: data.accountNumber as string | undefined,
      };
    });

    const sortByDate = (a: { processedAt: unknown }, b: { processedAt: unknown }) => {
      const am = a.processedAt == null ? 0 : toMs(a.processedAt);
      const bm = b.processedAt == null ? 0 : toMs(b.processedAt);
      if (am === 0 && bm === 0) return 0;
      if (am === 0) return -1;
      if (bm === 0) return 1;
      return bm - am;
    };
    let list: Array<{
      id: string;
      userId: string;
      amount: number;
      status: "pending" | "approved" | "rejected";
      processedAt: unknown;
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

    const items: Array<{
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
    }> = [];
    for (const row of slice) {
      if (row.status === "pending" && row.userName != null && row.userEmail != null) {
        items.push({
          id: row.id,
          userId: row.userId,
          userName: row.userName,
          userEmail: row.userEmail,
          bankName: row.bankName,
          accountNumber: row.accountNumber,
          amount: row.amount,
          status: row.status,
          processedAt: null,
          processedByAdminId: undefined,
          processedByAdminName: undefined,
        });
        continue;
      }
      const user = await this.getUserById(row.userId);
      const admin = row.processedByAdminId ? await this.getUserById(row.processedByAdminId) : null;
      const u = user as { name?: string; firstName?: string; lastName?: string; email?: string } | null;
      const a = admin as { name?: string; firstName?: string; lastName?: string; email?: string } | null;
      const userName = u
        ? (u.name ?? ([u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "—"))
        : "—";
      const userEmail = u?.email ?? "—";
      const adminName = a
        ? (a.name ?? ([a.firstName, a.lastName].filter(Boolean).join(" ") || a.email || "—"))
        : "—";
      items.push({
        id: row.id,
        userId: row.userId,
        userName,
        userEmail,
        bankName: row.bankName,
        accountNumber: row.accountNumber,
        amount: row.amount,
        status: row.status,
        processedAt: row.processedAt instanceof Date ? row.processedAt : new Date(toMs(row.processedAt)),
        processedByAdminId: row.processedByAdminId,
        processedByAdminName: adminName,
      });
    }
    return { items, total };
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
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  }
  async createFinancialReport(data: any): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("financial_reports");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.FINANCIAL_REPORTS).doc(id.toString());
    const created = {
      id,
      ...data,
      createdAt: data.createdAt || new Date(),
    };
    await docRef.set(created);
    return created;
  }
  async getFinancialReport(id: number | string): Promise<any | null> {
    if (!this.db) return null;
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.FINANCIAL_REPORTS).doc(id.toString()).get();
    if (!doc.exists) return null;
    return { id: parseInt(doc.id, 10) || doc.id, ...doc.data() };
  }

  async updateFinancialReportStatus(id: number | string, status: string): Promise<void> {
    if (!this.db) return;
    await this.db.collection(FIRESTORE_COLLECTIONS.FINANCIAL_REPORTS).doc(id.toString()).update({ status, updatedAt: new Date() });
  }
  async getKPIs(_userId: string): Promise<any> {
    return { totalIncome: 0, totalExpenses: 0, completedServices: 0, activeClients: 0, pendingBookings: 0, monthlyGrowth: 0, averageRating: 0 };
  }

  // ============ NOTIFICACIONES ============
  async getNotifications(userId: string, unreadOnly?: boolean): Promise<any[]> {
    if (!this.db) return [];
    let q = this.db.collection(FIRESTORE_COLLECTIONS.NOTIFICATIONS).where("userId", "==", userId) as any;
    const snap = await q.get();
    let list = snap.docs.map((d: any) => ({ id: parseInt(d.id) || d.id, ...d.data() }));
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
    let list = snap.docs.map((d: any) => ({ id: parseInt(d.id) || d.id, ...d.data() }));
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
  async deleteReview(reviewId: number, userId: string, actingUserRole?: string): Promise<void> {
    if (!this.db) return;
    const { hasAdminPrivileges } = await import("@shared/roles");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.REVIEWS).doc(reviewId.toString());
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Review not found");
    const reviewerId = (doc.data() as any)?.reviewerId;
    const canDelete = reviewerId === userId || hasAdminPrivileges(actingUserRole);
    if (!canDelete) throw new Error("Review not found or unauthorized");
    await docRef.delete();
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

  // ============ VERIFICACIÓN DE PROFESIONALES (un doc por userId) ============

  async getProfessionalVerificationByUserId(userId: string): Promise<ProfessionalVerification | null> {
    if (!this.db) return null;
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.PROFESSIONAL_VERIFICATIONS).doc(userId).get();
    if (!doc.exists) return null;
    const data = doc.data() as Record<string, unknown>;
    return {
      userId: String(data.userId ?? userId),
      imageUrl: data.imageUrl != null ? String(data.imageUrl) : null,
      imageVerified: data.imageVerified === true,
      transferReceiptCode: data.transferReceiptCode != null ? String(data.transferReceiptCode) : null,
      transferDate: data.transferDate != null ? String(data.transferDate) : null,
      createdAt: data.createdAt as any,
      updatedAt: data.updatedAt as any,
    } as ProfessionalVerification;
  }

  async upsertProfessionalVerificationImage(userId: string, imageUrl: string): Promise<ProfessionalVerification> {
    if (!this.db) throw new Error("Firestore no configurado");
    const ref = this.db.collection(FIRESTORE_COLLECTIONS.PROFESSIONAL_VERIFICATIONS).doc(userId);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.update({
        imageUrl,
        imageVerified: false,
        updatedAt: new Date(),
      });
    } else {
      await ref.set({
        userId,
        imageUrl,
        imageVerified: false,
        transferReceiptCode: null,
        transferDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    const out = await this.getProfessionalVerificationByUserId(userId);
    if (!out) throw new Error("No se pudo guardar la verificación");
    return out;
  }

  async upsertProfessionalVerificationPayment(
    userId: string,
    data: { transferReceiptCode: string; transferDate: string }
  ): Promise<ProfessionalVerification> {
    if (!this.db) throw new Error("Firestore no configurado");
    const ref = this.db.collection(FIRESTORE_COLLECTIONS.PROFESSIONAL_VERIFICATIONS).doc(userId);
    const snap = await ref.get();
    const existing = snap.exists ? await this.getProfessionalVerificationByUserId(userId) : null;
    const imageUrl = existing?.imageUrl ?? null;
    const imageVerified = false; // siempre false por ahora
    // No reescribir createdAt al actualizar: convertir Timestamp de Firestore con `new Date(...)`
    // puede producir fechas inválidas y el error "Value for argument \"seconds\" is not a valid integer".
    const payload: Record<string, unknown> = {
      userId,
      imageUrl,
      imageVerified,
      transferReceiptCode: data.transferReceiptCode.trim(),
      transferDate: data.transferDate.trim(),
      updatedAt: new Date(),
    };
    if (!snap.exists) {
      payload.createdAt = new Date();
    }

    await ref.set(payload, { merge: true });

    const out = await this.getProfessionalVerificationByUserId(userId);
    if (!out) throw new Error("No se pudo guardar el pago");
    return out;
  }

  // ============ verifying_status (nueva colección) ============

  async getVerifyingStatusByUserId(userId: string): Promise<VerifyingStatus | null> {
    if (!this.db) return null;
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).doc(userId).get();
    if (!doc.exists) return null;
    const data = doc.data() as Record<string, unknown>;
    return {
      user: String(data.user ?? userId),
      identification_verified: (data.identification_verified as any) ?? "rejected",
      transacction_date: data.transacction_date != null ? String(data.transacction_date) : null,
      transacction_verified:
        data.transacction_verified === undefined || data.transacction_verified === null
          ? null
          : (data.transacction_verified as any),
      createdAt: data.createdAt as any,
      updatedAt: data.updatedAt as any,
    } as VerifyingStatus;
  }

  /**
   * Solo marca identificación en pending. No modifica transacction_date ni transacction_verified
   * (si no existían en el doc, siguen ausentes / null).
   */
  async upsertVerifyingStatusIdentificationPending(userId: string): Promise<VerifyingStatus> {
    if (!this.db) throw new Error("Firestore no configurado");
    const ref = this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).doc(userId);
    const snap = await ref.get();

    if (snap.exists) {
      await ref.update({
        identification_verified: "pending",
        updatedAt: new Date(),
      });
    } else {
      await ref.set({
        user: userId,
        identification_verified: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const out = await this.getVerifyingStatusByUserId(userId);
    if (!out) throw new Error("No se pudo guardar el estado");
    return out;
  }

  async upsertVerifyingStatusTransactionPending(userId: string, transactionDate: string): Promise<VerifyingStatus> {
    if (!this.db) throw new Error("Firestore no configurado");
    const ref = this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).doc(userId);
    const snap = await ref.get();

    const existing = snap.exists ? await this.getVerifyingStatusByUserId(userId) : null;

    await ref.set(
      {
        user: userId,
        identification_verified: existing?.identification_verified ?? "rejected",
        transacction_date: transactionDate,
        transacction_verified: "pending",
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    const out = await this.getVerifyingStatusByUserId(userId);
    if (!out) throw new Error("No se pudo guardar el estado");
    return out;
  }

  async getPendingVerifyingStatuses(): Promise<VerifyingStatus[]> {
    if (!this.db) return [];
    const makeFromData = (data: Record<string, unknown>): VerifyingStatus => ({
      user: String(data.user ?? ""),
      identification_verified: (data.identification_verified as any) ?? "rejected",
      transacction_date: data.transacction_date != null ? String(data.transacction_date) : null,
      transacction_verified:
        data.transacction_verified === undefined || data.transacction_verified === null
          ? null
          : (data.transacction_verified as any),
      createdAt: data.createdAt as any,
      updatedAt: data.updatedAt as any,
    });

    const byUserId = new Map<string, VerifyingStatus>();

    const [snapId, snapTx] = await Promise.all([
      this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).where("identification_verified", "==", "pending").get(),
      this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).where("transacction_verified", "==", "pending").get(),
    ]);

    for (const d of snapId.docs) {
      const data = d.data() as Record<string, unknown>;
      const v = makeFromData({ ...data, user: data.user ?? d.id });
      byUserId.set(String(d.id), v);
    }
    for (const d of snapTx.docs) {
      const data = d.data() as Record<string, unknown>;
      const v = makeFromData({ ...data, user: data.user ?? d.id });
      byUserId.set(String(d.id), v);
    }

    return Array.from(byUserId.values()).filter((v) => Boolean(v.user));
  }

  async setVerifyingStatusIdentification(userId: string, status: ProfessionalVerificationState): Promise<VerifyingStatus> {
    if (!this.db) throw new Error("Firestore no configurado");
    const existing = await this.getVerifyingStatusByUserId(userId);
    if (!existing) throw new Error("Verificación no encontrada");
    if (existing.identification_verified !== "pending") throw new Error("La identificación ya no está en pending");

    await this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).doc(userId).update({
      identification_verified: status,
      updatedAt: new Date(),
    });

    const out = await this.getVerifyingStatusByUserId(userId);
    if (!out) throw new Error("No se pudo guardar el estado");
    return out;
  }

  async setVerifyingStatusTransaction(userId: string, status: ProfessionalVerificationState): Promise<VerifyingStatus> {
    if (!this.db) throw new Error("Firestore no configurado");
    const existing = await this.getVerifyingStatusByUserId(userId);
    if (!existing) throw new Error("Verificación no encontrada");
    if (existing.transacction_verified == null || existing.transacction_verified !== "pending") {
      throw new Error("La transacción ya no está en pending");
    }

    await this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).doc(userId).update({
      transacction_verified: status,
      updatedAt: new Date(),
    });

    const out = await this.getVerifyingStatusByUserId(userId);
    if (!out) throw new Error("No se pudo guardar el estado");
    return out;
  }

  async getAdminDashboardStats(params: { from: Date; to: Date }): Promise<AdminDashboardStatsResult> {
    if (!this.db) {
      return aggregateAdminDashboardStats(
        {
          users: [],
          bookings: [],
          services: [],
          transfers: [],
          pendingVerificationCount: 0,
          pendingWithdrawalRequestsCount: 0,
        },
        params
      );
    }
    const [usersSnap, bookingsSnap, servicesSnap, transfersResult, pendingVer, pendingWd] = await Promise.all([
      this.db.collection(FIRESTORE_COLLECTIONS.USERS).get(),
      this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).get(),
      this.db.collection(FIRESTORE_COLLECTIONS.SERVICES).get(),
      this.getAllTransfers(),
      this.getPendingVerifyingStatuses(),
      this.getUsersWithPendingWithdrawals(),
    ]);
    const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const bookings = bookingsSnap.docs.map((d) => {
      const id = parseInt(d.id, 10);
      return { id: Number.isFinite(id) ? id : d.id, ...d.data() };
    });
    const services = servicesSnap.docs.map((d) => {
      const id = parseInt(d.id, 10);
      return { id: Number.isFinite(id) ? id : d.id, ...d.data() };
    });
    return aggregateAdminDashboardStats(
      {
        users,
        bookings,
        services,
        transfers: transfersResult.transfers,
        pendingVerificationCount: pendingVer.length,
        pendingWithdrawalRequestsCount: pendingWd.length,
      },
      params
    );
  }

  async seedRoles(): Promise<void> {
    if (!this.db) return;
    const defaults: RoleDefinition[] = [
      { code: "admin", name: "Administrador", description: "Acceso total al sistema", isSystem: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
      { code: "professional", name: "Profesional", description: "Proveedor de servicios", isSystem: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
      { code: "client", name: "Cliente", description: "Usuario que contrata servicios", isSystem: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
      { code: "tiSupport", name: "Soporte TI", description: "Soporte técnico interno", isSystem: true, sortOrder: 4, createdAt: new Date(), updatedAt: new Date() },
    ];
    const col = this.db.collection(FIRESTORE_COLLECTIONS.ROLES);
    for (const r of defaults) {
      const ref = col.doc(r.code);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set(r);
      }
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
