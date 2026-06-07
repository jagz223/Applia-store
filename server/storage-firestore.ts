/**
 * Implementación de almacenamiento con Firestore
 * GenFeb
 * 
 * Este módulo proporciona una implementación de IStorage usando
 * Google Cloud Firestore como base de datos.
 */

import {
  getFirestore,
  FIRESTORE_COLLECTIONS,
  initializeFirebase,
} from "./firebase-admin";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { getGenfebStatsMonthKey } from "@shared/ecuador-calendar";
import { bookingTransitionCountsForMonthlySubcategoryDemand } from "@shared/subcategory-monthly-demand";
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
import type { InsertProviderVehicle } from "@shared/vehicle-schema";
import { SYSTEM_ROLE_CATALOG_DEFAULTS } from "@shared/role-definition";
import type { IStorage, RoleDefinition, NewRoleDefinition } from "./storage-genfeb";
import { calcCommission, calcProviderNet, roundToCents } from "@shared/platform-commission";
import { canAffordOffPlatformCommission, PROVIDER_WALLET_FLOOR_USD } from "@shared/wallet-limits";
import { getPlatformCommissionRate } from "./platform-commission-rate";
import { isFullAdmin } from "@shared/roles";
import { resolveCertificationsText, resolvePreparationLevel } from "@shared/provider-preparation";
import { mergeProviderWithServiceListingProfile } from "@shared/service-listing-profile";
import { serviceBelongsToBrand } from "@shared/service-belongs-to-brand";
import type { ProfessionalVerification, ProfessionalVerificationState } from "@shared/professional-verification";
import type { VerifyingStatus } from "@shared/professional-verification";
import { isProfessionalVerificationLocked } from "@shared/professional-verification";
import {
  PROMO_CODE_MSG_ALREADY_REDEEMED_BY_USER,
  PROMO_CODE_MSG_NO_LONGER_AVAILABLE,
  userHasRedeemedPromotionalCode,
} from "@shared/promotional-code-utils";
import { PUBLIC_PROMO_ANNOUNCE_DELAY_MS } from "@shared/public-promotional-notifications";
import {
  computeListingPublished,
  listingSubscriptionDaysRemaining,
  parseVisibilitySubscriptionEndMs,
} from "@shared/professional-listing-subscription";
import { isOffPlatformServiceBookingPayment } from "@shared/booking-payment";
import { applyPublicServicePrice, applyPublicServicePriceList } from "@shared/public-service-price";
import { FEATURE_OFF_PLATFORM_COMMISSION_ENABLED } from "@shared/feature-flags";
import { aggregateAdminDashboardStats, type AdminDashboardStatsResult } from "./admin-dashboard-stats";
import { countVerificationsAwaitingAdminReview } from "./associate-verification-admin";
import { CHAT_SYSTEM_SENDER_ID } from "@shared/chat-constants";
import {
  INGREDIENTS_MATERIALS_PAGE_SIZE,
  type Store,
  type IngredientMaterial,
  type InsertStore,
  type InsertIngredientMaterial,
  type InsertStoreProduct,
  type UpdateStore,
  type UpdateStoreProduct,
  type StoreProduct,
  type StoreCategory,
  type InsertStoreCategory,
  type UpdateStoreCategory,
  type StorePromotion,
  type InsertStorePromotion,
  type UpdateStorePromotion,
  type StorePromotionLineItem,
} from "@shared/store-schema";
import type { StoreCart, StoreCartItem } from "@shared/store-cart-schema";
import { STORE_CART_TTL_MS } from "@shared/store-cart-schema";
import {
  ingredientMaterialKey,
  normalizeIngredientMaterialName,
  resolveUniqueStoreSlug,
} from "@shared/store-slug";
import { isStoreVisibilityActive } from "@shared/store-visibility";
import { extendStoreVisibilitySubscriptionEndsAt } from "@shared/store-subscription-fee";
import { STORE_SUBSCRIPTION_FEE_REPORT_TYPE } from "@shared/store-subscription-payment";

/** Transfer type: service_payment = earnings from a booking; recharge = top-up to wallet; withdrawal = payout (admin processed); payment = client paid for a service (outflow from pending to provider). */
export type WalletTransferType = "service_payment" | "recharge" | "withdrawal" | "payment";

/** Transfer status: only "completed" recharge adds to wallet; "pending_approval" waits for staff. */
export type WalletTransferStatus = "pending_approval" | "completed" | "rejected";

/** IDs de proveedor en documentos de servicio pueden ser number o string según origen del dato. */
function parseServiceProviderId(id: unknown): number | null {
  if (id == null || id === "") return null;
  const n = typeof id === "number" ? id : Number(id);
  return Number.isFinite(n) && !Number.isNaN(n) && n > 0 ? Math.trunc(n) : null;
}

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
  referenceId?: string | null;
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

  private normalizePhone(raw: string): string {
    const s = (raw ?? "").trim();
    if (!s) return "";
    const hasPlus = s.startsWith("+");
    const digits = s.replace(/[^\d]/g, "");
    return hasPlus ? `+${digits}` : digits;
  }

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

    const normalized = (email ?? "").trim().toLowerCase();
    if (!normalized) return undefined;

    const snapshot = await this.db.collection(FIRESTORE_COLLECTIONS.USERS)
      .where("email", "==", normalized)
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

  async getUserByPhone(phone: string, includeDeleted?: boolean): Promise<User | undefined> {
    if (!this.db) return undefined;
    const n = this.normalizePhone(phone);
    if (!n) return undefined;

    // Preferir campo normalizado si existe.
    const snapNorm = await this.db
      .collection(FIRESTORE_COLLECTIONS.USERS)
      .where("phoneNormalized", "==", n)
      .limit(1)
      .get();
    if (!snapNorm.empty) {
      const doc = snapNorm.docs[0];
      const data = doc.data();
      if (!includeDeleted && data?.deletedAt) return undefined;
      return { id: doc.id, ...data } as User;
    }

    // Fallback a campo phone (para usuarios antiguos).
    const snapPhone = await this.db
      .collection(FIRESTORE_COLLECTIONS.USERS)
      .where("phone", "==", n)
      .limit(1)
      .get();
    if (snapPhone.empty) return undefined;
    const doc = snapPhone.docs[0];
    const data = doc.data();
    if (!includeDeleted && data?.deletedAt) return undefined;
    return { id: doc.id, ...data } as User;
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

    const emailNorm = (user.email ?? "").trim().toLowerCase();
    if (!emailNorm) throw new Error("El email es obligatorio");
    const phoneNorm = this.normalizePhone(user.phone ?? "");
    if (!phoneNorm) throw new Error("El teléfono es obligatorio");

    // Buscar si el usuario ya existe (incluyendo eliminados)
    const snapshot = await this.db.collection(FIRESTORE_COLLECTIONS.USERS)
      .where("email", "==", emailNorm)
      .limit(1)
      .get();
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const existingData = doc.data();
      
      // Si el usuario existe y NO está eliminado, error
      if (!existingData.deletedAt) {
        throw new Error("Este correo electrónico ya está registrado.");
      }
      
      // Si está eliminado, lo reactivamos
      const now = new Date();
      const reactivatedUser = {
        ...existingData,
        ...user, // Actualizar datos con lo nuevo (password, nombre, etc.)
        email: emailNorm,
        deletedAt: null,
        isActive: true,
        updatedAt: now,
      };
      
      await doc.ref.update(reactivatedUser);
      return { id: doc.id, ...reactivatedUser } as User;
    }

    const existingByPhone = await this.getUserByPhone(phoneNorm, true);
    if (existingByPhone) {
      throw new Error("Este teléfono ya está registrado.");
    }

    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.USERS).doc();
    const now = new Date();
    
    const role = user.role || "client";
    const newUser: User = {
      id: docRef.id,
      email: emailNorm,
      password: user.password!,
      name: user.name!,
      lastName: user.lastName!,
      phone: phoneNorm,
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
    
    await docRef.set({ ...(newUser as any), phoneNormalized: phoneNorm });
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

    const patch: Record<string, unknown> = {
      ...safeData,
      updatedAt: new Date(),
    };
    if (typeof (safeData as any).phone !== "undefined") {
      const phoneNorm = this.normalizePhone(String((safeData as any).phone ?? ""));
      patch.phone = phoneNorm;
      patch.phoneNormalized = phoneNorm;
    }

    await docRef.update(patch);

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
    if (data.phone !== undefined) {
      const phoneNorm = this.normalizePhone(String(data.phone ?? ""));
      updateData.phone = phoneNorm;
      updateData.phoneNormalized = phoneNorm;
    }
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
    const rows = snapshot.docs.map((doc) => {
      const data = doc.data() ?? {};
      const idFromDoc = Number.parseInt(String(doc.id), 10);
      return {
        ...data,
        id: Number.isFinite(idFromDoc) ? idFromDoc : (typeof data.id === "number" ? data.id : NaN),
      } as Category;
    });

    const { isRetiredProviderCategorySlug } = await import("@shared/default-categories");
    return rows.filter((c) => {
      const id = typeof c.id === "number" ? c.id : Number((c as { id?: unknown }).id);
      if (!Number.isFinite(id) || id < 1) return false;
      const slug = String((c as { slug?: unknown }).slug ?? "").trim();
      if (isRetiredProviderCategorySlug(slug)) return false;
      const name = String((c as { name?: unknown }).name ?? "").trim();
      return slug.length > 0 && name.length > 0;
    });
  }

  /**
   * Elimina documentos de categorías retiradas (p. ej. `maintenance` legacy).
   * Se ejecuta al arranque para que no reaparezcan en admin ni en listados.
   */
  async purgeRetiredCategoryDocuments(): Promise<{ removed: string[] }> {
    if (!this.db) return { removed: [] };
    const { isRetiredProviderCategorySlug } = await import("@shared/default-categories");
    const coll = this.db.collection(FIRESTORE_COLLECTIONS.CATEGORIES);
    const snapshot = await coll.get();
    const removed: string[] = [];
    for (const doc of snapshot.docs) {
      const slug = String(doc.data()?.slug ?? "").trim();
      if (!isRetiredProviderCategorySlug(slug)) continue;
      await doc.ref.delete();
      removed.push(`${slug}#${doc.id}`);
    }
    return { removed };
  }

  async updateCategory(id: number, data: Partial<Category>): Promise<Category | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.CATEGORIES).doc(String(id));
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.slug !== undefined) updates.slug = data.slug;
    if (data.icon !== undefined) updates.icon = data.icon;
    if (data.imageUrl !== undefined) updates.imageUrl = data.imageUrl;
    
    if (Object.keys(updates).length > 0) {
      await docRef.update(updates);
    }
    const updated = await docRef.get();
    return { id: parseInt(updated.id), ...updated.data() } as Category;
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
        imageUrl: d?.imageUrl != null ? String(d.imageUrl) : null,
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
      imageUrl: d?.imageUrl != null ? String(d.imageUrl) : null,
    } as import("./storage-contracts").Subcategory;
  }

  async createSubcategory(data: Omit<import("./storage-contracts").Subcategory, "id">): Promise<import("./storage-contracts").Subcategory> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("subcategories");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.SUB_CATEGORIES).doc(id.toString());
    const newSub: any = {
      id,
      name: data.name,
      slug: data.slug,
      categoryId: data.categoryId,
    };
    if (data.categorySlug) newSub.categorySlug = data.categorySlug;
    if (data.icon) newSub.icon = data.icon;
    if (data.imageUrl != null && String(data.imageUrl).trim()) newSub.imageUrl = String(data.imageUrl).trim();
    
    await docRef.set(newSub);
    return newSub as import("./storage-contracts").Subcategory;
  }

  async updateSubcategory(id: number, data: Partial<import("./storage-contracts").Subcategory>): Promise<import("./storage-contracts").Subcategory | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.SUB_CATEGORIES).doc(String(id));
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.slug !== undefined) updates.slug = data.slug;
    if (data.categoryId !== undefined) updates.categoryId = data.categoryId;
    if (data.categorySlug !== undefined) updates.categorySlug = data.categorySlug;
    if (data.icon !== undefined) updates.icon = data.icon;
    if (data.imageUrl !== undefined) {
      const trimmed = data.imageUrl != null ? String(data.imageUrl).trim() : "";
      updates.imageUrl = trimmed || null;
    }
    
    if (Object.keys(updates).length > 0) {
      await docRef.update(updates);
    }
    const updated = await docRef.get();
    const d = updated.data()!;
    return {
      id: typeof d?.id === "number" ? d.id : parseInt(updated.id, 10),
      name: (d?.name as string) ?? "",
      slug: (d?.slug as string) ?? "",
      categoryId: (d?.categoryId ?? d?.categoria) as number,
      categorySlug: d?.categorySlug as string | undefined,
      icon: d?.icon ?? null,
      imageUrl: d?.imageUrl != null ? String(d.imageUrl) : null,
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
      const cid = Number(categoryId);
      const [snapPrimary, snapSecond, snapThird] = await Promise.all([
        coll.where("categoryId", "==", cid).get(),
        coll.where("secondCategoryId", "==", cid).get(),
        coll.where("thirdCategoryId", "==", cid).get(),
      ]);
      const byId = new Map<string, Provider>();
      for (const snap of [snapPrimary, snapSecond, snapThird]) {
        snap.docs.forEach((doc) => {
          byId.set(doc.id, { id: parseInt(doc.id, 10), ...doc.data() } as Provider);
        });
      }
      let list = [...byId.values()];
      if (profession) {
        list = list.filter((p) => p.profession === profession);
      }
      return list;
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
    const enriched = await this.enrichProviderWithSubcategory(provider as Provider & { subcategoryId?: number | null });
    return enriched as Provider | undefined;
  }

  /** Normaliza fin de suscripción mensual USD 15 a ISO (Firestore Timestamp / string / Date). */
  private normalizeVisibilitySubscriptionEndsAtIso(raw: unknown): string | null {
    const ms = parseVisibilitySubscriptionEndMs(raw);
    return ms == null ? null : new Date(ms).toISOString();
  }

  /** Estado de publicación en catálogo marketplace (cuota mensual). */
  private attachProfessionalListingFields(
    provider: Provider,
    ownerRole: string | undefined,
  ): Provider & {
    preparationLevel: string;
    visibilitySubscriptionEndsAt: string | null;
    isVerified: boolean;
    isListingPublished: boolean;
    subscriptionDaysRemaining: number | null;
  } {
    const visibilitySubscriptionEndsAt = this.normalizeVisibilitySubscriptionEndsAtIso(
      (provider as { visibilitySubscriptionEndsAt?: unknown }).visibilitySubscriptionEndsAt,
    );
    const isFullAdminUser = isFullAdmin(ownerRole);
    const isVerifiedIdentity = provider.isVerified === true || isFullAdminUser;
    const isListingPublished = computeListingPublished({
      isVerifiedIdentity,
      visibilitySubscriptionEndsAt,
      isFullAdmin: isFullAdminUser,
    });
    const subscriptionDaysRemaining =
      visibilitySubscriptionEndsAt != null ? listingSubscriptionDaysRemaining(visibilitySubscriptionEndsAt) : null;
    const preparationLevel = resolvePreparationLevel(provider as { preparationLevel?: string | null; coursesCompleted?: string | null });
    return {
      ...provider,
      preparationLevel,
      visibilitySubscriptionEndsAt,
      isVerified: isVerifiedIdentity,
      isListingPublished,
      subscriptionDaysRemaining,
    };
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
    const ownerRole = raw ? (raw as { role?: string }).role : undefined;
    const withListing = this.attachProfessionalListingFields(provider, ownerRole);
    return { ...withListing, user } as unknown as ProviderWithUser;
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
    const enriched = await this.enrichProviderWithSubcategory(provider as Provider & { subcategoryId?: number | null });
    const rawUser = await this.getUserById(userId);
    const ownerRole = (rawUser as { role?: string } | null)?.role;
    return this.attachProfessionalListingFields(enriched as Provider, ownerRole) as Provider;
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
    const prepRaw =
      (provider as { preparationLevel?: string | null }).preparationLevel?.trim() ||
      (provider as { coursesCompleted?: string | null }).coursesCompleted?.trim() ||
      null;
    const newProvider = {
      id,
      ...provider,
      categoryId: (provider as { categoryId?: number }).categoryId ?? null,
      category: provider.category ?? null,
      subcategoryId: (provider as { subcategoryId?: number | null }).subcategoryId ?? null,
      goBrands: (provider as any).goBrands ?? null,
      secondCategoryId: (provider as { secondCategoryId?: number | null }).secondCategoryId ?? null,
      thirdCategoryId: (provider as { thirdCategoryId?: number | null }).thirdCategoryId ?? null,
      subscriptionCategorySlug:
        (provider as { subscriptionCategorySlug?: string | null }).subscriptionCategorySlug ?? null,
      preparationLevel: prepRaw,
      coursesCompleted: prepRaw,
      certifications: (provider as { certifications?: string | null }).certifications ?? null,
      isVerified: Boolean((provider as { isVerified?: boolean }).isVerified),
      rating: String((provider as { rating?: unknown }).rating ?? "0"),
      reviewCount: Number((provider as { reviewCount?: unknown }).reviewCount ?? 0),
      skills: (provider as { skills?: string[] | null }).skills ?? [],
    };
    await docRef.set(newProvider);
    return newProvider as Provider;
  }

  async createProviderVehicle(input: {
    providerId: number;
    userId: string;
    vehicle: InsertProviderVehicle;
  }): Promise<{ id: number }> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("vehicles");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.VEHICLES).doc(id.toString());
    const v = input.vehicle;
    const petAllowed = v.vehicle_type === "car" || v.vehicle_type === "pickup_truck";
    const now = new Date();
    const payload = {
      id,
      providerId: input.providerId,
      userId: input.userId,
      license_plate: v.license_plate,
      model_year: v.model_year,
      brand: v.brand,
      model: v.model,
      vehicle_status: v.vehicle_status,
      vehicle_type: v.vehicle_type,
      is_pet_friendly: petAllowed ? Boolean(v.is_pet_friendly) : false,
      exterior_color: v.exterior_color ?? null,
      passenger_seats: v.passenger_seats ?? null,
      insurance_expires_at: v.insurance_expires_at ?? null,
      mileage_km: v.mileage_km ?? null,
      service_notes: v.service_notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await docRef.set(payload);
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
    if (!this.db) return null;
    const snap = await this.db
      .collection(FIRESTORE_COLLECTIONS.VEHICLES)
      .where("providerId", "==", providerId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const d = snap.docs[0].data() as {
      vehicle_type?: string;
      brand?: string;
      model?: string;
      license_plate?: string;
      model_year?: number;
      is_pet_friendly?: boolean;
    };
    const vt = d.vehicle_type;
    if (typeof vt !== "string") return null;
    return {
      vehicle_type: vt,
      brand: d.brand ?? null,
      model: d.model ?? null,
      license_plate: d.license_plate ?? null,
      model_year: typeof d.model_year === "number" ? d.model_year : null,
      is_pet_friendly: !!d.is_pet_friendly,
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
    if (!this.db) return null;
    const snap = await this.db
      .collection(FIRESTORE_COLLECTIONS.VEHICLES)
      .where("userId", "==", userId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const d = snap.docs[0].data() as {
      vehicle_type?: string;
      brand?: string;
      model?: string;
      license_plate?: string;
      model_year?: number;
      is_pet_friendly?: boolean;
    };
    const vt = d.vehicle_type;
    if (typeof vt !== "string") return null;
    return {
      vehicle_type: vt,
      brand: d.brand ?? null,
      model: d.model ?? null,
      license_plate: d.license_plate ?? null,
      model_year: typeof d.model_year === "number" ? d.model_year : null,
      is_pet_friendly: !!d.is_pet_friendly,
    };
  }

  async getPrimaryVehicleFullByUserId(userId: string): Promise<Record<string, unknown> | null> {
    if (!this.db) return null;
    const uid = String(userId ?? "").trim();
    if (!uid) return null;
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.VEHICLES).where("userId", "==", uid).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    const data = doc.data() as Record<string, unknown>;
    const idNum = parseInt(doc.id, 10);
    return { ...data, id: Number.isFinite(idNum) ? idNum : data.id };
  }

  async upsertPrimaryProviderVehicle(input: {
    providerId: number;
    userId: string;
    vehicle: InsertProviderVehicle;
  }): Promise<{ id: number }> {
    if (!this.db) throw new Error("Firestore no configurado");
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.VEHICLES).where("userId", "==", input.userId).limit(20).get();
    let targetRef: DocumentReference | null = null;
    let targetId = 0;
    for (const doc of snap.docs) {
      const d = doc.data() as { providerId?: number; id?: number };
      if (d.providerId === input.providerId) {
        targetRef = doc.ref;
        targetId = parseInt(doc.id, 10) || Number(d.id) || 0;
        break;
      }
    }
    if (!targetRef && !snap.empty) {
      targetRef = snap.docs[0].ref;
      const d0 = snap.docs[0].data() as { id?: number };
      targetId = parseInt(snap.docs[0].id, 10) || Number(d0.id) || 0;
    }
    const v = input.vehicle;
    const petAllowed = v.vehicle_type === "car" || v.vehicle_type === "pickup_truck";
    const now = new Date();
    const flat: Record<string, unknown> = {
      providerId: input.providerId,
      userId: input.userId,
      license_plate: v.license_plate,
      model_year: v.model_year,
      brand: v.brand,
      model: v.model,
      vehicle_status: v.vehicle_status,
      vehicle_type: v.vehicle_type,
      is_pet_friendly: petAllowed ? Boolean(v.is_pet_friendly) : false,
      exterior_color: v.exterior_color ?? null,
      passenger_seats: v.passenger_seats ?? null,
      insurance_expires_at: v.insurance_expires_at ?? null,
      mileage_km: v.mileage_km ?? null,
      service_notes: v.service_notes ?? null,
      updatedAt: now,
    };
    if (targetRef) {
      await targetRef.update(flat);
      return { id: targetId };
    }
    return this.createProviderVehicle(input);
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
    if (updates.preparationLevel !== undefined) {
      updates.coursesCompleted = updates.preparationLevel;
    } else if (updates.coursesCompleted !== undefined) {
      updates.preparationLevel = updates.coursesCompleted;
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
    subcategoryId?: number,
    includeUnverifiedForAdmin?: boolean
  ): Promise<ServiceWithProvider[]> {
    if (!this.db) return [];
    let query = this.db.collection(FIRESTORE_COLLECTIONS.SERVICES);
    /** Explore / booking: filtrar por categoría de la ficha, no por marcas del proveedor. */
    const serviceCategoryFilter =
      categoryId != null && !Number.isNaN(categoryId)
        ? categoryId
        : providerCategoryId != null && !Number.isNaN(providerCategoryId)
          ? providerCategoryId
          : null;
    if (serviceCategoryFilter != null) {
      query = query.where("categoryId", "==", serviceCategoryFilter) as any;
    }
    const snapshot = await query.get();
    const services = snapshot.docs.map((doc) => ({
      id: parseInt(doc.id, 10),
      ...doc.data(),
    } as Service));

    const allCategories = await this.getCategories();
    const subcategoryCache = new Map<number, { id: number; name: string }>();
    let servicesWithProviders: ServiceWithProvider[] = [];
    for (const service of services) {
      const pid = parseServiceProviderId(service.providerId);
      const provider = pid != null ? await this.getProvider(pid) : undefined;
      const providerWithUser = provider ? await this.enrichProviderWithUser(provider) : undefined;
      // Catálogo público: verificado + cuota mensual vigente. Panel admin: incluir todos.
      const listingOk = (providerWithUser as { isListingPublished?: boolean } | undefined)?.isListingPublished === true;
      if (!includeUnverifiedForAdmin && !listingOk) continue;
      if (includeUnverifiedForAdmin && !providerWithUser) continue;
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
      const mergedProvider = mergeProviderWithServiceListingProfile(
        providerWithUser as unknown as Record<string, unknown>,
        service as unknown as Record<string, unknown>,
      ) as typeof providerWithUser;
      servicesWithProviders.push({
        ...service,
        provider: mergedProvider ?? undefined,
        category: category ?? (allCategories[0] as Category),
        subcategory,
      } as ServiceWithProvider);
    }

    if (providerCategoryId != null && !Number.isNaN(providerCategoryId)) {
      servicesWithProviders = servicesWithProviders.filter((s) =>
        serviceBelongsToBrand(s, providerCategoryId, allCategories),
      );
    }
    if (subcategoryId != null && !Number.isNaN(subcategoryId)) {
      servicesWithProviders = servicesWithProviders.filter((s) => {
        const subId = (s as { subcategoryId?: number | null }).subcategoryId;
        return subId != null && Number(subId) === subcategoryId;
      });
    }
    if (search) {
      const searchLower = search.toLowerCase();
      return applyPublicServicePriceList(
        servicesWithProviders.filter(
          (s) => {
            const prep = resolvePreparationLevel(
              (s.provider ?? undefined) as { preparationLevel?: string | null; coursesCompleted?: string | null }
            );
            const certs = resolveCertificationsText(
              (s.provider ?? undefined) as { certifications?: string | null }
            );
            return (
              s.title?.toLowerCase().includes(searchLower) ||
              s.description?.toLowerCase().includes(searchLower) ||
              prep.toLowerCase().includes(searchLower) ||
              certs.toLowerCase().includes(searchLower)
            );
          }
        )
      );
    }
    return applyPublicServicePriceList(servicesWithProviders);
  }

  async getService(
    id: number,
    options?: { includeWhenListingUnpublished?: boolean },
  ): Promise<ServiceWithProvider | undefined> {
    if (!this.db) return undefined;
    const safeId = id != null && !Number.isNaN(Number(id)) ? Number(id) : null;
    if (safeId === null) return undefined;

    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.SERVICES).doc(String(safeId)).get();
    if (!doc.exists) return undefined;

    const service = {
      id: parseInt(doc.id, 10),
      ...doc.data(),
    } as Service;

    const pid = parseServiceProviderId(service.providerId);
    const provider = pid != null ? await this.getProvider(pid) : undefined;
    const providerWithUser = provider ? await this.enrichProviderWithUser(provider) : undefined;
    const listingOk = (providerWithUser as { isListingPublished?: boolean } | undefined)?.isListingPublished === true;
    if (!options?.includeWhenListingUnpublished && !listingOk) return undefined;
    const allCategories = await this.getCategories();
    const category = allCategories.find((c) => c.id === service.categoryId) ?? (allCategories[0] as Category | undefined);
    const subId = (service as { subcategoryId?: number | null }).subcategoryId;
    let subcategory: { id: number; name: string } | null = null;
    if (subId != null && !Number.isNaN(Number(subId))) {
      const sub = await this.getSubcategoryById(Number(subId));
      if (sub) subcategory = { id: sub.id, name: sub.name };
    }
    const mergedProvider = mergeProviderWithServiceListingProfile(
      providerWithUser as unknown as Record<string, unknown>,
      service as unknown as Record<string, unknown>,
    ) as typeof providerWithUser;

    return applyPublicServicePrice({
      ...service,
      provider: mergedProvider ?? undefined,
      category: category ?? ({} as Category),
      subcategory,
    } as ServiceWithProvider) as ServiceWithProvider;
  }

  async getServicesByProviderId(providerId: number): Promise<ServiceWithProvider[]> {
    if (!this.db) return [];
    const pid = Number(providerId);
    if (!Number.isFinite(pid) || pid <= 0) return [];

    const snapshot = await this.db
      .collection(FIRESTORE_COLLECTIONS.SERVICES)
      .where("providerId", "==", pid)
      .get();
    if (snapshot.empty) return [];

    const provider = await this.getProvider(pid);
    const providerWithUser = provider ? await this.enrichProviderWithUser(provider) : undefined;
    const allCategories = await this.getCategories();
    const subcategoryCache = new Map<number, { id: number; name: string }>();
    const out: ServiceWithProvider[] = [];

    for (const doc of snapshot.docs) {
      const service = {
        id: parseInt(doc.id, 10),
        ...doc.data(),
      } as Service;
      const category = allCategories.find((c) => c.id === service.categoryId) ?? (allCategories[0] as Category | undefined);
      const subId = (service as { subcategoryId?: number | null }).subcategoryId;
      let subcategory: { id: number; name: string } | null = null;
      if (subId != null && !Number.isNaN(Number(subId))) {
        if (!subcategoryCache.has(Number(subId))) {
          const sub = await this.getSubcategoryById(Number(subId));
          if (sub) subcategoryCache.set(sub.id, { id: sub.id, name: sub.name });
        }
        subcategory = subcategoryCache.get(Number(subId)) ?? null;
      }
      const mergedProvider = mergeProviderWithServiceListingProfile(
        providerWithUser as unknown as Record<string, unknown>,
        service as unknown as Record<string, unknown>,
      ) as typeof providerWithUser;
      out.push(
        applyPublicServicePrice({
          ...service,
          provider: mergedProvider ?? undefined,
          category: category ?? ({} as Category),
          subcategory,
        } as ServiceWithProvider) as ServiceWithProvider,
      );
    }

    return out;
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
        const serviceFallback =
          service ??
          ({ id: 0, title: "Servicio", provider: undefined, category: {} } as unknown as ServiceWithProvider);
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
        : ({
            id: booking.userId,
            firstName: "Cliente",
            lastName: "",
            email: null,
            profileImageUrl: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as unknown as User);
      
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
    const costNum = 0;
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

  async incrementSubcategoryMonthlyBookingCount(subcategoryId: number | null | undefined): Promise<void> {
    if (!this.db) return;
    const id = subcategoryId != null ? Number(subcategoryId) : NaN;
    if (!Number.isFinite(id) || id <= 0) return;
    const monthKey = getGenfebStatsMonthKey();
    const coll = this.db.collection(FIRESTORE_COLLECTIONS.STATS_SUBCATEGORY_BOOKINGS_MONTHLY);
    const docRef = coll.doc(monthKey);
    const field = `c_${id}`;
    await docRef.set(
      {
        monthKey,
        [field]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  async getMonthlyPopularSubcategoryBookingCounts(
    monthKey: string,
    limit: number
  ): Promise<{ subcategoryId: number; count: number }[]> {
    if (!this.db) return [];
    const safeMonth = /^[0-9]{4}-[0-9]{2}$/.test(monthKey) ? monthKey : getGenfebStatsMonthKey();
    const lim = Math.min(50, Math.max(1, Math.floor(limit)));
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.STATS_SUBCATEGORY_BOOKINGS_MONTHLY).doc(safeMonth).get();
    if (!doc.exists) return [];
    const data = doc.data() as Record<string, unknown> | undefined;
    if (!data) return [];
    const rows: { subcategoryId: number; count: number }[] = [];
    for (const [key, raw] of Object.entries(data)) {
      if (!key.startsWith("c_")) continue;
      const sid = Number(key.slice(2));
      if (!Number.isFinite(sid) || sid <= 0) continue;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n <= 0) continue;
      rows.push({ subcategoryId: sid, count: Math.floor(n) });
    }
    rows.sort((a, b) => b.count - a.count || a.subcategoryId - b.subcategoryId);
    return rows.slice(0, lim);
  }

  async updateBookingStatus(id: number, status: string): Promise<Booking | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    const data = doc.data() as Record<string, unknown>;
    const prevStatus = String(data.status ?? "pending");
    const countDemand = bookingTransitionCountsForMonthlySubcategoryDemand(
      prevStatus,
      status,
      data.monthlyDemandStatsCounted === true
    );
    const updates: Record<string, unknown> = { status };
    if (status === "completed") updates.completedAt = new Date();
    if (countDemand) updates.monthlyDemandStatsCounted = true;
    await docRef.update(updates);
    if (countDemand) {
      try {
        const serviceId = data.serviceId != null ? Number(data.serviceId) : NaN;
        if (Number.isFinite(serviceId)) {
          const svc = await this.getService(serviceId);
          const subId = (svc as { subcategoryId?: number | null } | undefined)?.subcategoryId;
          await this.incrementSubcategoryMonthlyBookingCount(
            subId != null && Number.isFinite(Number(subId)) ? Number(subId) : null
          );
        }
      } catch (e) {
        console.error("[stats] updateBookingStatus monthly demand:", e);
      }
    }
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
      const data = bookingSnap.data() as {
        status?: string;
        userId?: string;
        cost?: number;
        confirmedByClient?: boolean;
        paymentMethod?: string;
      };

      if (data.confirmedByClient !== true) {
        // Si el cliente no confirmó el pago, solo marcamos cancelado sin mover dinero.
        const now = new Date();
        t.update(bookingRef, { status: "cancelled", cancelledAt: now });
        return { id: bookingId, ...data, status: "cancelled" } as unknown as Booking;
      }

      const pm = data.paymentMethod || "wallet";
      if (isOffPlatformServiceBookingPayment(pm)) {
        const now = new Date();
        t.update(bookingRef, { status: "cancelled", cancelledAt: now });
        return { id: bookingId, ...data, status: "cancelled" } as unknown as Booking;
      }

      const cost = typeof data.cost === "number" ? data.cost : Number(data.cost) || 0;
      if (cost <= 0) {
        const nowZero = new Date();
        t.update(bookingRef, { status: "cancelled", cancelledAt: nowZero });
        return { id: bookingId, ...data, status: "cancelled", cancelledAt: nowZero } as unknown as Booking;
      }
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

      return { id: bookingId, ...data, status: "cancelled" } as unknown as Booking;
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

    const postMonthlyDemand: { apply: boolean; serviceId?: number } = { apply: false };

    const result = await this.db.runTransaction(async (t) => {
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
        monthlyDemandStatsCounted?: boolean;
        serviceId?: number;
      };

      if (data.status === "completed") return { id: bookingId, ...data } as unknown as Booking;

      const countDemand = bookingTransitionCountsForMonthlySubcategoryDemand(
        String(data.status ?? "pending"),
        "completed",
        data.monthlyDemandStatsCounted === true
      );

      const paymentMethod = data.paymentMethod || "wallet";
      const cost = typeof data.cost === "number" ? data.cost : Number(data.cost) || 0;
      if (cost <= 0) {
        const nowDone = new Date();
        const patch: Record<string, unknown> = { status: "completed", completedAt: nowDone };
        if (countDemand) {
          patch.monthlyDemandStatsCounted = true;
          postMonthlyDemand.apply = true;
          postMonthlyDemand.serviceId =
            data.serviceId != null && Number.isFinite(Number(data.serviceId)) ? Number(data.serviceId) : undefined;
        }
        t.update(bookingRef, patch as never);
        return { id: bookingId, ...data, status: "completed", completedAt: nowDone } as unknown as Booking;
      }

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
      const completedPatch: Record<string, unknown> = { status: "completed", completedAt: now };
      if (countDemand) {
        completedPatch.monthlyDemandStatsCounted = true;
        postMonthlyDemand.apply = true;
        postMonthlyDemand.serviceId =
          data.serviceId != null && Number.isFinite(Number(data.serviceId)) ? Number(data.serviceId) : undefined;
      }
      t.update(bookingRef, completedPatch as never);

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
        t.update(adminUserRef, { wallet: adminWallet + commission, totalEarnings: adminTotalEarnings + commission, updatedAt: now });
        t.set(transfersColl.doc(String(transferId3)), {
          id: transferId3, userId: adminUserId, fromUserId: null, amount: commission,
          transferType: "service_payment", status: "completed", description: `Comisión de plataforma por servicio (${paymentMethod})`,
          referenceId: String(bookingId), currency: "USD", createdAt: now,
        });
      } else if (FEATURE_OFF_PLATFORM_COMMISSION_ENABLED) {
        if (!canAffordOffPlatformCommission(providerWallet, commission)) {
          throw new Error(
            `No se puede completar: la comisión de plataforma te dejaría por debajo del límite de ${PROVIDER_WALLET_FLOOR_USD} USD. Recarga tu saldo o coordina pago con Saldo GenFeb.`
          );
        }
        t.update(providerUserRef, { 
          wallet: providerWallet - commission, 
          totalEarnings: providerTotalEarnings + cost, 
          updatedAt: now 
        });
        t.set(transfersColl.doc(String(transferId2)), {
          id: transferId2, userId: providerUserId, fromUserId: null, amount: commission,
          transferType: "service_payment", status: "completed", description: "Comisión de plataforma por servicio (efectivo o transferencia)",
          referenceId: String(bookingId), currency: "USD", createdAt: now,
        });
        t.update(adminUserRef, { wallet: adminWallet + commission, totalEarnings: adminTotalEarnings + commission, updatedAt: now });
        t.set(transfersColl.doc(String(transferId3)), {
          id: transferId3, userId: adminUserId, fromUserId: null, amount: commission,
          transferType: "service_payment", status: "completed", description: `Comisión de plataforma por servicio (${paymentMethod})`,
          referenceId: String(bookingId), currency: "USD", createdAt: now,
        });
      } else {
        t.update(providerUserRef, {
          totalEarnings: providerTotalEarnings + cost,
          updatedAt: now,
        });
      }

      return { id: bookingId, ...data, status: "completed" } as unknown as Booking;
    });

    if (postMonthlyDemand.apply && postMonthlyDemand.serviceId != null && Number.isFinite(postMonthlyDemand.serviceId)) {
      try {
        const svc = await this.getService(postMonthlyDemand.serviceId);
        const subId = (svc as { subcategoryId?: number | null } | undefined)?.subcategoryId;
        await this.incrementSubcategoryMonthlyBookingCount(
          subId != null && Number.isFinite(Number(subId)) ? Number(subId) : null
        );
      } catch (e) {
        console.error("[stats] completeBookingAndReleaseEscrow monthly demand:", e);
      }
    }

    return result;
  }

  async applyMobilityRideSettlement(input: {
    rideId: string;
    riderUserId: string;
    driverUserId: string;
    estimatedUsd: number;
    paymentMethod: "genfeb" | "cash" | "bank_transfer";
  }): Promise<void> {
    if (!this.db) throw new Error("Firestore no configurado");
    const cost = roundToCents(
      typeof input.estimatedUsd === "number" ? input.estimatedUsd : Number(input.estimatedUsd) || 0
    );
    if (cost <= 0) throw new Error("Importe del viaje no definido");
    const commissionRate = await getPlatformCommissionRate();
    const commission = calcCommission(cost, commissionRate);
    const providerNet = calcProviderNet(cost, commissionRate);

    const usersColl = this.db.collection(FIRESTORE_COLLECTIONS.USERS);
    const transfersColl = this.db.collection(FIRESTORE_COLLECTIONS.WALLET_TRANSFERS);
    const adminSnap = await this.db
      .collection(FIRESTORE_COLLECTIONS.USERS)
      .where("role", "in", ["admin", "tiSupport"])
      .limit(1)
      .get();
    if (adminSnap.empty) {
      throw new Error("No existe usuario admin o soporte TI para registrar la comisión de plataforma");
    }
    const adminUserId = adminSnap.docs[0].id;
    const now = new Date();
    const refId = `cargo:${input.rideId}`;

    if (input.paymentMethod === "genfeb") {
      const transferId1 = await this.getNextId("wallet_transfers");
      const transferId2 = await this.getNextId("wallet_transfers");
      const transferId3 = await this.getNextId("wallet_transfers");
      return this.db.runTransaction(async (t) => {
        const riderRef = usersColl.doc(input.riderUserId);
        const driverRef = usersColl.doc(input.driverUserId);
        const adminRef = usersColl.doc(adminUserId);
        const [riderSnap, driverSnap, adminSnap2] = await Promise.all([t.get(riderRef), t.get(driverRef), t.get(adminRef)]);
        if (!riderSnap.exists) throw new Error("Pasajero no encontrado");
        if (!driverSnap.exists) throw new Error("Conductor no encontrado");
        if (!adminSnap2.exists) throw new Error("Admin no encontrado");
        const rData = riderSnap.data() as { wallet?: number };
        const riderWallet = typeof rData.wallet === "number" ? rData.wallet : 0;
        if (riderWallet < cost) throw new Error("Saldo insuficiente del pasajero (Saldo GenFeb).");
        const dData = driverSnap.data() as { wallet?: number; totalEarnings?: number; completedTrips?: number };
        const dWallet = typeof dData.wallet === "number" ? dData.wallet : 0;
        const dEarnings = typeof dData.totalEarnings === "number" ? dData.totalEarnings : 0;
        const dTrips = typeof dData.completedTrips === "number" ? dData.completedTrips : 0;
        const aData = adminSnap2.data() as { wallet?: number; totalEarnings?: number };
        const aWallet = typeof aData.wallet === "number" ? aData.wallet : 0;
        const aEarnings = typeof aData.totalEarnings === "number" ? aData.totalEarnings : 0;
        t.update(riderRef, { wallet: riderWallet - cost, updatedAt: now });
        t.update(driverRef, {
          wallet: dWallet + providerNet,
          totalEarnings: dEarnings + providerNet,
          completedTrips: dTrips + 1,
          updatedAt: now,
        });
        t.update(adminRef, { wallet: aWallet + commission, totalEarnings: aEarnings + commission, updatedAt: now });
        t.set(transfersColl.doc(String(transferId1)), {
          id: transferId1, userId: input.riderUserId, fromUserId: null, amount: cost,
          transferType: "payment", status: "completed", description: "Pago viaje Car Go (Saldo GenFeb)",
          referenceId: refId, currency: "USD", createdAt: now,
        });
        t.set(transfersColl.doc(String(transferId2)), {
          id: transferId2, userId: input.driverUserId, fromUserId: null, amount: providerNet,
          transferType: "service_payment", status: "completed", description: "Ingreso neto viaje Car Go",
          referenceId: refId, currency: "USD", createdAt: now,
        });
        t.set(transfersColl.doc(String(transferId3)), {
          id: transferId3, userId: adminUserId, fromUserId: null, amount: commission,
          transferType: "service_payment", status: "completed", description: "Comisión de plataforma (Car Go, genfeb)",
          referenceId: refId, currency: "USD", createdAt: now,
        });
      });
    }

    if (!FEATURE_OFF_PLATFORM_COMMISSION_ENABLED) {
      return this.db.runTransaction(async (t) => {
        const driverRef = usersColl.doc(input.driverUserId);
        const driverSnap = await t.get(driverRef);
        if (!driverSnap.exists) throw new Error("Conductor no encontrado");
        const dData = driverSnap.data() as { totalEarnings?: number; completedTrips?: number };
        const dEarnings = typeof dData.totalEarnings === "number" ? dData.totalEarnings : 0;
        const dTrips = typeof dData.completedTrips === "number" ? dData.completedTrips : 0;
        t.update(driverRef, {
          totalEarnings: dEarnings + cost,
          completedTrips: dTrips + 1,
          updatedAt: now,
        });
      });
    }

    const transferIdA = await this.getNextId("wallet_transfers");
    const transferIdB = await this.getNextId("wallet_transfers");
    return this.db.runTransaction(async (t) => {
      const driverRef = usersColl.doc(input.driverUserId);
      const adminRef = usersColl.doc(adminUserId);
      const [driverSnap, adminSnap2] = await Promise.all([t.get(driverRef), t.get(adminRef)]);
      if (!driverSnap.exists) throw new Error("Conductor no encontrado");
      if (!adminSnap2.exists) throw new Error("Admin no encontrado");
      const dData = driverSnap.data() as { wallet?: number; totalEarnings?: number; completedTrips?: number };
      const dWallet = typeof dData.wallet === "number" ? dData.wallet : 0;
      const dEarnings = typeof dData.totalEarnings === "number" ? dData.totalEarnings : 0;
      const dTrips = typeof dData.completedTrips === "number" ? dData.completedTrips : 0;
      if (!canAffordOffPlatformCommission(dWallet, commission)) {
        throw new Error(
          `No se puede completar: la comisión te dejaría por debajo del límite de ${PROVIDER_WALLET_FLOOR_USD} USD. Acepta viajes con Saldo GenFeb o recarga.`
        );
      }
      const aData = adminSnap2.data() as { wallet?: number; totalEarnings?: number };
      const aWallet = typeof aData.wallet === "number" ? aData.wallet : 0;
      const aEarnings = typeof aData.totalEarnings === "number" ? aData.totalEarnings : 0;
      t.update(driverRef, {
        wallet: dWallet - commission,
        totalEarnings: dEarnings + cost,
        completedTrips: dTrips + 1,
        updatedAt: now,
      });
      t.update(adminRef, { wallet: aWallet + commission, totalEarnings: aEarnings + commission, updatedAt: now });
      t.set(transfersColl.doc(String(transferIdA)), {
        id: transferIdA, userId: input.driverUserId, fromUserId: null, amount: commission,
        transferType: "service_payment", status: "completed", description: `Comisión de plataforma (Car Go, ${input.paymentMethod})`,
        referenceId: refId, currency: "USD", createdAt: now,
      });
      t.set(transfersColl.doc(String(transferIdB)), {
        id: transferIdB, userId: adminUserId, fromUserId: null, amount: commission,
        transferType: "service_payment", status: "completed", description: `Comisión de plataforma (Car Go, ${input.paymentMethod}) — plataforma`,
        referenceId: refId, currency: "USD", createdAt: now,
      });
    });
  }

  async updateBookingCost(id: number, cost: number): Promise<Booking | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    await docRef.update({
      cost: Number(cost),
      pendingClientAcknowledgment: true,
      pendingClientAcknowledgmentAt: new Date(),
    });
    const updated = await docRef.get();
    return { id: parseInt(updated.id), ...updated.data() } as Booking;
  }

  async updateBookingSchedule(id: number, date: Date): Promise<Booking | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    await docRef.update({
      date,
      pendingClientAcknowledgment: true,
      pendingClientAcknowledgmentAt: new Date(),
    });
    const updated = await docRef.get();
    return { id: parseInt(updated.id), ...updated.data() } as Booking;
  }

  async acknowledgeBookingProChanges(bookingId: number, clientUserId: string): Promise<Booking | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).doc(bookingId.toString());
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    const data = doc.data() as { userId?: string };
    if (data.userId !== clientUserId) return undefined;
    await docRef.update({ pendingClientAcknowledgment: false });
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
      const bookingData = bookingSnap.data() as {
        status?: string;
        userId?: string;
        providerId?: number;
        cost?: number;
        confirmedByClient?: boolean;
        paymentMethod?: string;
      };
      if ((bookingData.status || "pending") !== "confirmed") {
        throw new Error("Solo puedes confirmar el pago cuando el profesional haya confirmado la reserva");
      }
      if (bookingData.confirmedByClient === true) {
        throw new Error("Esta reserva ya fue confirmada por el cliente");
      }
      const cost = typeof bookingData.cost === "number" ? bookingData.cost : Number(bookingData.cost) || 0;
      const clientUserId = bookingData.userId;
      if (!clientUserId) throw new Error("Reserva sin cliente asociado");

      const pm = bookingData.paymentMethod || "wallet";
      const now = new Date();
      if (cost <= 0) {
        t.update(bookingRef, { confirmedByClient: true, updatedAt: now });
        return {
          id: bookingId,
          ...bookingData,
          confirmedByClient: true,
        } as unknown as Booking;
      }
      if (isOffPlatformServiceBookingPayment(pm)) {
        t.update(bookingRef, { confirmedByClient: true, updatedAt: now });
        return {
          id: bookingId,
          ...bookingData,
          confirmedByClient: true,
        } as unknown as Booking;
      }

      const clientRef = usersColl.doc(clientUserId);
      const clientSnap = await t.get(clientRef);
      if (!clientSnap.exists) throw new Error("Usuario cliente no encontrado");
      const clientData = clientSnap.data() as { wallet?: number; pendingBalance?: number };
      const clientWallet = typeof clientData.wallet === "number" ? clientData.wallet : 0;
      const clientPending = typeof clientData.pendingBalance === "number" ? clientData.pendingBalance : 0;
      if (clientWallet < cost) {
        throw new Error("Saldo insuficiente. Añade saldo a tu Saldo Genfeb para confirmar el pago.");
      }

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
      } as unknown as Booking;
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
    return snap.docs.map((d: { id: string; data: () => Record<string, unknown> }) => ({
      id: parseInt(d.id, 10) || d.id,
      ...d.data(),
    }));
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
  private conversationHideFromUsersAtMs(c: any): number | null {
    const t = c?.serviceChatHideFromUsersAt;
    if (t == null) return null;
    if (t instanceof Date) return t.getTime();
    if (typeof (t as any)?.toMillis === "function") return (t as any).toMillis();
    if (typeof (t as any)?.toDate === "function") return (t as any).toDate().getTime();
    if (typeof t === "number") return t;
    if (typeof t === "string") {
      const d = new Date(t);
      return Number.isNaN(d.getTime()) ? null : d.getTime();
    }
    return null;
  }

  async getConversationsByUser(userId: string): Promise<any[]> {
    if (!this.db) return [];
    const snap1 = await this.db.collection(FIRESTORE_COLLECTIONS.CONVERSATIONS).where("participant1Id", "==", userId).get();
    const snap2 = await this.db.collection(FIRESTORE_COLLECTIONS.CONVERSATIONS).where("participant2Id", "==", userId).get();
    const map = new Map<string, any>();
    [...snap1.docs, ...snap2.docs].forEach(d => map.set(d.id, { id: parseInt(d.id) || d.id, ...d.data() }));
    const uid = String(userId ?? "");
    const now = Date.now();
    const list = Array.from(map.values());
    return list.filter((c: any) => {
      const hiddenFor = Array.isArray(c?.hiddenForUserIds) ? c.hiddenForUserIds.map((x: any) => String(x)) : [];
      if (hiddenFor.includes(uid)) return false;
      const hideMs = this.conversationHideFromUsersAtMs(c);
      if (hideMs != null && now > hideMs) return false;
      return true;
    });
  }
  async createConversation(conv: any): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("conversations");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.CONVERSATIONS).doc(id.toString());
    const data = { id, ...conv, createdAt: new Date(), lastMessageAt: new Date(), hiddenForUserIds: [] };
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
      const d = doc.data() as { senderId?: string; status?: string; type?: string };
      if (d.type === "system" || d.senderId === CHAT_SYSTEM_SENDER_ID) return false;
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
      const d = doc.data() as { senderId?: string; status?: string; type?: string };
      if (d.type === "system" || d.senderId === CHAT_SYSTEM_SENDER_ID) return;
      if (d.senderId !== userId && d.status !== "read") {
        batch.update(doc.ref, { status: "read", readAt: now });
        hasWrites = true;
      }
    });
    if (hasWrites) await batch.commit();
  }

  async hideConversationForUsers(conversationId: number, userIds: string[]): Promise<void> {
    if (!this.db) return;
    const id = Number(conversationId);
    if (!Number.isFinite(id) || id <= 0) return;
    const ref = this.db.collection(FIRESTORE_COLLECTIONS.CONVERSATIONS).doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) return;
    const current = snap.data() as any;
    const prev = Array.isArray(current?.hiddenForUserIds) ? current.hiddenForUserIds.map((x: any) => String(x)) : [];
    const next = new Set<string>(prev);
    for (const u of userIds ?? []) {
      const s = String(u ?? "").trim();
      if (s) next.add(s);
    }
    await ref.update({ hiddenForUserIds: Array.from(next), hiddenAt: new Date() });
  }

  async patchConversation(conversationId: number, patch: Record<string, unknown>): Promise<void> {
    if (!this.db) return;
    const id = Number(conversationId);
    if (!Number.isFinite(id) || id <= 0) return;
    const ref = this.db.collection(FIRESTORE_COLLECTIONS.CONVERSATIONS).doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) return;
    await ref.update(patch as any);
  }

  async sweepStaleMobilityRideChats(): Promise<number> {
    if (!this.db) return 0;
    const now = Date.now();
    const graceMs = 24 * 60 * 60 * 1000;
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.CONVERSATIONS).where("kind", "==", "mobility_ride").get();
    let n = 0;
    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (data.mobilityRideCompleted === true) continue;
      const hideMs = this.conversationHideFromUsersAtMs(data);
      let createdMs: number | null = null;
      const created = data.createdAt;
      if (created instanceof Date) createdMs = created.getTime();
      else if (typeof (created as { toMillis?: () => number })?.toMillis === "function") {
        createdMs = (created as { toMillis: () => number }).toMillis();
      }
      const expired =
        (hideMs != null && now > hideMs) ||
        (hideMs == null && createdMs != null && now > createdMs + graceMs);
      if (!expired) continue;
      const hideAt =
        hideMs != null ? new Date(hideMs) : new Date((createdMs ?? now) + graceMs);
      await doc.ref.update({
        messagesLocked: true,
        mobilityRideInProgress: false,
        serviceChatHideFromUsersAt: hideAt,
        updatedAt: new Date(),
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
    if (!this.db) return null;
    const bid = Number(booking.id);
    if (!Number.isFinite(bid)) return null;
    const byBid = await this.db
      .collection(FIRESTORE_COLLECTIONS.CONVERSATIONS)
      .where("bookingId", "==", bid)
      .limit(1)
      .get();
    if (!byBid.empty) {
      const d = byBid.docs[0];
      return { id: parseInt(d.id) || d.id, ...d.data() };
    }
    // No reutilizar hilos viejos (mismo cliente + mismo servicio): cada reserva nueva debe tener su propia conversación.
    return null;
  }

  async findConversationForMobilityRide(params: { rideId: string }): Promise<any | null> {
    if (!this.db) return null;
    const rideId = String(params.rideId ?? "").trim();
    if (!rideId) return null;
    const snap = await this.db
      .collection(FIRESTORE_COLLECTIONS.CONVERSATIONS)
      .where("kind", "==", "mobility_ride")
      .where("mobilityRideId", "==", rideId)
      .limit(8)
      .get();
    const rows = snap.docs
      .map((d) => ({ id: parseInt(d.id) || d.id, ...d.data() } as Record<string, unknown>))
      .filter((c) => c.messagesLocked !== true);
    if (rows.length === 0) return null;
    const lastAtMs = (c: Record<string, unknown>): number => {
      const t = c.lastMessageAt;
      if (t instanceof Date) return t.getTime();
      if (typeof (t as { toMillis?: () => number })?.toMillis === "function") {
        return (t as { toMillis: () => number }).toMillis();
      }
      return 0;
    };
    rows.sort((a, b) => lastAtMs(b) - lastAtMs(a));
    return rows[0] ?? null;
  }

  async listConversationsForAdmin(opts?: { limit?: number }): Promise<any[]> {
    if (!this.db) return [];
    const lim = Math.min(Math.max(Number(opts?.limit) || 200, 1), 500);
    const snap = await this.db
      .collection(FIRESTORE_COLLECTIONS.CONVERSATIONS)
      .orderBy("lastMessageAt", "desc")
      .limit(lim)
      .get();
    return snap.docs.map((d) => ({ id: parseInt(d.id) || d.id, ...d.data() }));
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
    const patch: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === "completed") patch.approvedAt = new Date();
    await this.db.collection(FIRESTORE_COLLECTIONS.FINANCIAL_REPORTS).doc(id.toString()).update(patch);
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

  async markAllNotificationsAsReadForUser(userId: string): Promise<void> {
    if (!this.db) return;
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.NOTIFICATIONS).where("userId", "==", userId).get();
    const unreadDocs = snap.docs.filter((d) => !(d.data() as { read?: boolean }).read);
    if (unreadDocs.length === 0) return;
    const now = new Date();
    const CHUNK = 450;
    for (let i = 0; i < unreadDocs.length; i += CHUNK) {
      const batch = this.db.batch();
      for (const doc of unreadDocs.slice(i, i + CHUNK)) {
        batch.update(doc.ref, { read: true, readAt: now });
      }
      await batch.commit();
    }
  }

  // ============ PETICIONES DE CAMBIO DE CUENTA ============
  async createAccountChangeRequest(input: {
    userId: string;
    field: "email" | "name" | "phone" | "vehicle" | "recovery_questions";
    reason: string;
    proposal?: unknown;
  }): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const userId = String(input.userId ?? "").trim();
    const field = input.field;
    const reason = String(input.reason ?? "").trim();
    if (!userId) throw new Error("userId requerido");
    if (!["email", "name", "phone", "vehicle", "recovery_questions"].includes(field)) throw new Error("field inválido");
    if (!reason) throw new Error("reason requerido");
    if (field === "vehicle" && (input.proposal == null || typeof input.proposal !== "object")) {
      throw new Error("proposal requerido para cambio de vehículo");
    }

    const pend = await this.db
      .collection(FIRESTORE_COLLECTIONS.ACCOUNT_CHANGE_REQUESTS)
      .where("userId", "==", userId)
      .where("status", "==", "pending")
      .get();
    for (const d of pend.docs) {
      const f = String((d.data() as any)?.field ?? "");
      if (field === "vehicle" && f === "vehicle") {
        throw new Error("Ya tienes una solicitud de vehículo pendiente.");
      }
      if (field === "recovery_questions" && f === "recovery_questions") {
        throw new Error("Ya tienes una solicitud de preguntas de recuperación pendiente.");
      }
    }

    const id = await this.getNextId("account_change_requests");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.ACCOUNT_CHANGE_REQUESTS).doc(id.toString());
    const created: Record<string, unknown> = {
      id,
      userId,
      field,
      reason,
      status: "pending",
      createdAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    };
    if (field === "vehicle") {
      created.proposal = input.proposal;
    }
    await docRef.set(created);
    return created;
  }

  async getMyAccountChangeRequests(userId: string): Promise<any[]> {
    if (!this.db) return [];
    const uid = String(userId ?? "").trim();
    const snap = await this.db
      .collection(FIRESTORE_COLLECTIONS.ACCOUNT_CHANGE_REQUESTS)
      .where("userId", "==", uid)
      .get();
    const toMs = (x: any) => (x?.toMillis ? x.toMillis() : x ? new Date(x).getTime() : 0);
    return snap.docs
      .map((d: any) => ({ id: parseInt(d.id) || d.id, ...d.data() }))
      .sort((a: any, b: any) => toMs(b.createdAt) - toMs(a.createdAt));
  }

  async getPendingAccountChangeRequests(): Promise<any[]> {
    if (!this.db) return [];
    const snap = await this.db
      .collection(FIRESTORE_COLLECTIONS.ACCOUNT_CHANGE_REQUESTS)
      .where("status", "==", "pending")
      .get();
    const toMs = (x: any) => (x?.toMillis ? x.toMillis() : x ? new Date(x).getTime() : 0);
    return snap.docs
      .map((d: any) => ({ id: parseInt(d.id) || d.id, ...d.data() }))
      .sort((a: any, b: any) => toMs(b.createdAt) - toMs(a.createdAt));
  }

  async resolveAccountChangeRequest(args: { id: number; action: "approve" | "reject"; adminUserId: string }): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = Number(args.id);
    const action = args.action;
    const adminUserId = String(args.adminUserId ?? "").trim();
    if (!Number.isFinite(id)) throw new Error("id inválido");
    if (!adminUserId) throw new Error("adminUserId requerido");
    if (action !== "approve" && action !== "reject") throw new Error("action inválido");

    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.ACCOUNT_CHANGE_REQUESTS).doc(id.toString());
    const snap = await docRef.get();
    if (!snap.exists) throw new Error("Petición no encontrada");
    const data = snap.data() as any;
    if (data?.status !== "pending") throw new Error("La petición ya fue resuelta");

    const nextStatus = action === "approve" ? "approved" : "rejected";
    const patch = { status: nextStatus, resolvedAt: new Date(), resolvedBy: adminUserId };
    await docRef.update(patch);
    const updated = await docRef.get();
    return { id, ...(updated.data() as any) };
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
  async seedCategories(): Promise<{ created: string[] }> {
    if (!this.db) return { created: [] };
    const { DEFAULT_CATEGORIES, isRetiredProviderCategorySlug } = await import("@shared/default-categories");
    const coll = this.db.collection(FIRESTORE_COLLECTIONS.CATEGORIES);
    const snapshot = await coll.get();
    const bySlug = new Set(snapshot.docs.map((d) => (d.data().slug as string) ?? ""));
    let maxId = 0;
    snapshot.docs.forEach((d) => {
      const n = parseInt(d.id, 10);
      if (!Number.isNaN(n)) maxId = Math.max(maxId, n);
    });
    const created: string[] = [];
    for (const cat of DEFAULT_CATEGORIES) {
      if (isRetiredProviderCategorySlug(cat.slug)) continue;
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
      created.push(cat.slug);
    }
    return { created };
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

  // ============ CÓDIGOS PROMOCIONALES ============

  private mapPromotionalCodeFromFirestore(
    docId: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const rawExpires = data.expiresAt;
    let expiresAt: string | null = null;
    if (rawExpires instanceof Date) {
      expiresAt = rawExpires.toISOString();
    } else if (rawExpires != null && typeof rawExpires === "object") {
      const ts = rawExpires as { toDate?: () => Date; toMillis?: () => number; _seconds?: number };
      if (typeof ts.toDate === "function") {
        expiresAt = ts.toDate().toISOString();
      } else if (typeof ts.toMillis === "function") {
        expiresAt = new Date(ts.toMillis()).toISOString();
      } else if (typeof ts._seconds === "number") {
        expiresAt = new Date(ts._seconds * 1000).toISOString();
      }
    } else if (typeof rawExpires === "string" && rawExpires.trim()) {
      expiresAt = rawExpires;
    }

    return {
      ...data,
      id: parseInt(docId) || docId,
      expiresAt,
      createdAt:
        data.createdAt instanceof Date
          ? data.createdAt.toISOString()
          : data.createdAt,
      updatedAt:
        data.updatedAt instanceof Date
          ? data.updatedAt.toISOString()
          : data.updatedAt,
    };
  }

  async getPromotionalCodes(): Promise<any[]> {
    if (!this.db) return [];
    const snap = await this.db.collection(FIRESTORE_COLLECTIONS.PROMOTIONAL_CODES).get();
    return snap.docs.map((d) =>
      this.mapPromotionalCodeFromFirestore(d.id, (d.data() ?? {}) as Record<string, unknown>),
    );
  }

  async getPromotionalCodeById(id: number): Promise<any | undefined> {
    if (!this.db) return undefined;
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.PROMOTIONAL_CODES).doc(id.toString()).get();
    if (!doc.exists) return undefined;
    return this.mapPromotionalCodeFromFirestore(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
  }

  async getPromotionalCodeByCode(code: string): Promise<any | undefined> {
    if (!this.db) return undefined;
    const normalized = code.trim().toUpperCase();
    const snap = await this.db
      .collection(FIRESTORE_COLLECTIONS.PROMOTIONAL_CODES)
      .where("code", "==", normalized)
      .limit(1)
      .get();
    if (snap.empty) return undefined;
    const d = snap.docs[0];
    return this.mapPromotionalCodeFromFirestore(d.id, (d.data() ?? {}) as Record<string, unknown>);
  }

  async createPromotionalCode(data: {
    code: string;
    expirationType: string;
    expiresAt?: Date | null;
    maxUses?: number | null;
    benefitType: string;
    benefitValue: string;
    isPublic?: boolean;
  }): Promise<any> {
    if (!this.db) throw new Error("Firestore no configurado");

    const normalizedCode = data.code.trim().toUpperCase();
    const existing = await this.getPromotionalCodeByCode(normalizedCode);
    if (existing) throw new Error("Ya existe un código promocional con este identificador");

    const id = await this.getNextId("promotional_codes");
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.PROMOTIONAL_CODES).doc(id.toString());
    const isPublic = data.isPublic === true;
    const now = new Date();
    const record = {
      id,
      code: normalizedCode,
      expirationType: data.expirationType,
      expiresAt: data.expiresAt ?? null,
      maxUses: data.maxUses ?? null,
      usedCount: 0,
      usedByUserCounts: {},
      benefitType: data.benefitType,
      benefitValue: data.benefitValue,
      isPublic,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      publicAnnouncementDueAt: isPublic ? new Date(now.getTime() + PUBLIC_PROMO_ANNOUNCE_DELAY_MS) : null,
      publicAnnouncementSentAt: null,
      publicUserReminders: {},
      publicExpiredNotifiedAt: null,
    };
    await docRef.set(record);
    const snap = await docRef.get();
    if (!snap.exists) return record;
    return this.mapPromotionalCodeFromFirestore(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
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
      isPublic?: boolean;
    },
  ): Promise<any | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.PROMOTIONAL_CODES).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return undefined;

    const existing = doc.data() as {
      isPublic?: boolean;
      publicAnnouncementSentAt?: unknown;
      publicUserReminders?: Record<string, string>;
    };
    const isPublic = data.isPublic === true;
    const becamePublic = isPublic && existing.isPublic !== true;
    const now = new Date();
    const patch: Record<string, unknown> = {
      code: data.code.trim().toUpperCase(),
      expirationType: data.expirationType,
      expiresAt: data.expiresAt ?? null,
      maxUses: data.maxUses ?? null,
      benefitType: data.benefitType,
      benefitValue: data.benefitValue,
      isPublic,
      updatedAt: now,
    };
    if (becamePublic && !existing.publicAnnouncementSentAt) {
      patch.publicAnnouncementDueAt = new Date(now.getTime() + PUBLIC_PROMO_ANNOUNCE_DELAY_MS);
      patch.publicAnnouncementSentAt = null;
      patch.publicUserReminders = existing.publicUserReminders ?? {};
    }
    await docRef.update(patch);
    const updated = await docRef.get();
    if (!updated.exists) return undefined;
    return this.mapPromotionalCodeFromFirestore(updated.id, (updated.data() ?? {}) as Record<string, unknown>);
  }

  async deletePromotionalCode(id: number): Promise<void> {
    if (!this.db) return;
    await this.db.collection(FIRESTORE_COLLECTIONS.PROMOTIONAL_CODES).doc(id.toString()).delete();
  }

  async incrementPromotionalCodeUsedCount(id: number, userId?: string): Promise<any | undefined> {
    if (!this.db) return undefined;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.PROMOTIONAL_CODES).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return undefined;
    const data = doc.data() as {
      usedCount?: number;
      maxUses?: number | null;
      expirationType?: string;
      usedByUserCounts?: Record<string, number>;
    };
    const uid = userId != null ? String(userId) : "";

    if (userHasRedeemedPromotionalCode(data.usedByUserCounts, uid)) {
      throw new Error(PROMO_CODE_MSG_ALREADY_REDEEMED_BY_USER);
    }

    const nextCount = (data.usedCount ?? 0) + 1;
    if (data.expirationType === "por_usos" && data.maxUses != null && nextCount > data.maxUses) {
      throw new Error(PROMO_CODE_MSG_NO_LONGER_AVAILABLE);
    }

    const patch: Record<string, unknown> = { usedCount: nextCount, updatedAt: new Date() };
    if (uid) {
      const counts = { ...(data.usedByUserCounts ?? {}) };
      counts[uid] = (counts[uid] ?? 0) + 1;
      patch.usedByUserCounts = counts;
    }
    await docRef.update(patch);
    const updated = await docRef.get();
    if (!updated.exists) return undefined;
    return this.mapPromotionalCodeFromFirestore(updated.id, (updated.data() ?? {}) as Record<string, unknown>);
  }

  async listPublicPromoNotificationRecipientUserIds(): Promise<string[]> {
    if (!this.db) return [];
    const roles = ["admin", "tiSupport", "professional"];
    const ids = new Set<string>();
    for (const role of roles) {
      const snap = await this.db.collection(FIRESTORE_COLLECTIONS.USERS).where("role", "==", role).get();
      snap.docs.forEach((d) => {
        const data = d.data() as { deletedAt?: unknown };
        if (!data.deletedAt) ids.add(d.id);
      });
    }
    return [...ids];
  }

  async patchPromotionalCodePublicNotifyFields(
    id: number,
    patch: {
      publicAnnouncementDueAt?: Date | null;
      publicAnnouncementSentAt?: Date | null;
      publicUserReminders?: Record<string, string>;
      publicExpiredNotifiedAt?: Date | null;
    },
  ): Promise<void> {
    if (!this.db) return;
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.PROMOTIONAL_CODES).doc(id.toString());
    const doc = await docRef.get();
    if (!doc.exists) return;

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.publicAnnouncementDueAt !== undefined) update.publicAnnouncementDueAt = patch.publicAnnouncementDueAt;
    if (patch.publicAnnouncementSentAt !== undefined) update.publicAnnouncementSentAt = patch.publicAnnouncementSentAt;
    if (patch.publicUserReminders !== undefined) {
      const existing = (doc.data()?.publicUserReminders ?? {}) as Record<string, string>;
      update.publicUserReminders = { ...existing, ...patch.publicUserReminders };
    }
    if (patch.publicExpiredNotifiedAt !== undefined) update.publicExpiredNotifiedAt = patch.publicExpiredNotifiedAt;
    await docRef.update(update);
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
      professionalCredentialUrl: data.professionalCredentialUrl != null ? String(data.professionalCredentialUrl) : null,
      transferReceiptCode: data.transferReceiptCode != null ? String(data.transferReceiptCode) : null,
      transferDate: data.transferDate != null ? String(data.transferDate) : null,
      subscriptionMonths:
        typeof data.subscriptionMonths === "number" && Number.isFinite(data.subscriptionMonths)
          ? Math.max(1, Math.min(12, Math.trunc(data.subscriptionMonths)))
          : null,
      subscriptionMonthlyUsd:
        typeof data.subscriptionMonthlyUsd === "number" && Number.isFinite(data.subscriptionMonthlyUsd)
          ? Math.max(0, Number(data.subscriptionMonthlyUsd))
          : null,
      promotionalCode: data.promotionalCode != null ? String(data.promotionalCode) : null,
      promotionalDiscountPercent:
        typeof data.promotionalDiscountPercent === "number" && Number.isFinite(data.promotionalDiscountPercent)
          ? data.promotionalDiscountPercent
          : null,
      subscriptionOriginalTotalUsd:
        typeof data.subscriptionOriginalTotalUsd === "number" && Number.isFinite(data.subscriptionOriginalTotalUsd)
          ? data.subscriptionOriginalTotalUsd
          : null,
      subscriptionDiscountedTotalUsd:
        typeof data.subscriptionDiscountedTotalUsd === "number" && Number.isFinite(data.subscriptionDiscountedTotalUsd)
          ? data.subscriptionDiscountedTotalUsd
          : null,
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
        professionalCredentialUrl: null,
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
    if (!this.db) throw new Error("Firestore no configurado");
    const ref = this.db.collection(FIRESTORE_COLLECTIONS.PROFESSIONAL_VERIFICATIONS).doc(userId);
    const snap = await ref.get();
    const existing = snap.exists ? await this.getProfessionalVerificationByUserId(userId) : null;
    const imageUrl = existing?.imageUrl ?? null;
    const imageVerified = false; // siempre false por ahora
    const professionalCredentialUrl = existing?.professionalCredentialUrl ?? null;
    // No reescribir createdAt al actualizar: convertir Timestamp de Firestore con `new Date(...)`
    // puede producir fechas inválidas y el error "Value for argument \"seconds\" is not a valid integer".
    const payload: Record<string, unknown> = {
      userId,
      imageUrl,
      imageVerified,
      professionalCredentialUrl,
      transferReceiptCode: data.transferReceiptCode.trim(),
      transferDate: data.transferDate.trim(),
      ...(typeof data.subscriptionMonthlyUsd === "number" && Number.isFinite(data.subscriptionMonthlyUsd)
        ? { subscriptionMonthlyUsd: Math.max(0, data.subscriptionMonthlyUsd) }
        : {}),
      subscriptionMonths: Math.max(1, Math.min(12, Math.trunc(data.subscriptionMonths))),
      updatedAt: new Date(),
    };
    const promoCode = data.promotionalCode?.trim().toUpperCase() || null;
    if (promoCode) {
      payload.promotionalCode = promoCode;
      payload.promotionalDiscountPercent = data.promotionalDiscountPercent ?? null;
      payload.subscriptionOriginalTotalUsd = data.subscriptionOriginalTotalUsd ?? null;
      payload.subscriptionDiscountedTotalUsd = data.subscriptionDiscountedTotalUsd ?? null;
    } else {
      payload.promotionalCode = null;
      payload.promotionalDiscountPercent = null;
      payload.subscriptionOriginalTotalUsd = null;
      payload.subscriptionDiscountedTotalUsd = null;
    }
    if (!snap.exists) {
      payload.createdAt = new Date();
    }

    await ref.set(payload, { merge: true });

    const out = await this.getProfessionalVerificationByUserId(userId);
    if (!out) throw new Error("No se pudo guardar el pago");
    return out;
  }

  async upsertProfessionalVerificationCredential(userId: string, professionalCredentialUrl: string): Promise<ProfessionalVerification> {
    if (!this.db) throw new Error("Firestore no configurado");
    const ref = this.db.collection(FIRESTORE_COLLECTIONS.PROFESSIONAL_VERIFICATIONS).doc(userId);
    const snap = await ref.get();
    const existing = snap.exists ? await this.getProfessionalVerificationByUserId(userId) : null;
    const payload: Record<string, unknown> = {
      userId,
      imageUrl: existing?.imageUrl ?? null,
      imageVerified: existing?.imageVerified === true ? true : false,
      professionalCredentialUrl: professionalCredentialUrl.trim(),
      transferReceiptCode: existing?.transferReceiptCode ?? null,
      transferDate: existing?.transferDate ?? null,
      updatedAt: new Date(),
    };
    if (!snap.exists) payload.createdAt = new Date();
    await ref.set(payload, { merge: true });
    const out = await this.getProfessionalVerificationByUserId(userId);
    if (!out) throw new Error("No se pudo guardar el documento profesional");
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
      requestType: (data.requestType as any) ?? undefined,
      identification_verified: (data.identification_verified as any) ?? "rejected",
      transacction_date: data.transacction_date != null ? String(data.transacction_date) : null,
      transacction_verified:
        data.transacction_verified === undefined || data.transacction_verified === null
          ? null
          : (data.transacction_verified as any),
      pendingIdResubmitCount:
        typeof data.pendingIdResubmitCount === "number" && Number.isFinite(data.pendingIdResubmitCount)
          ? Math.max(0, Math.trunc(data.pendingIdResubmitCount as number))
          : undefined,
      pendingCredentialResubmitCount:
        typeof data.pendingCredentialResubmitCount === "number" && Number.isFinite(data.pendingCredentialResubmitCount)
          ? Math.max(0, Math.trunc(data.pendingCredentialResubmitCount as number))
          : undefined,
      prefundPromoAwaitingDossier: data.prefundPromoAwaitingDossier === true ? true : undefined,
      prefundPromoCode:
        typeof data.prefundPromoCode === "string" && data.prefundPromoCode.trim()
          ? String(data.prefundPromoCode).trim().toUpperCase()
          : undefined,
      prefundPromoMonths:
        typeof data.prefundPromoMonths === "number" && Number.isFinite(data.prefundPromoMonths)
          ? Math.max(1, Math.min(12, Math.trunc(data.prefundPromoMonths as number)))
          : undefined,
      createdAt: data.createdAt as any,
      updatedAt: data.updatedAt as any,
    } as VerifyingStatus;
  }

  /**
   * Solo marca identificación en pending. No modifica transacction_date ni transacction_verified
   * (si no existían en el doc, siguen ausentes / null).
   */
  async upsertVerifyingStatusIdentificationPending(
    userId: string,
    requestType: "onboarding" | "renewal" = "onboarding",
  ): Promise<VerifyingStatus> {
    if (!this.db) throw new Error("Firestore no configurado");
    const ref = this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).doc(userId);
    const snap = await ref.get();

    if (snap.exists) {
      const prev = snap.data() as Record<string, unknown> | undefined;
      const prevId = prev?.identification_verified;
      const patch: Record<string, unknown> = {
        requestType,
        identification_verified: "pending",
        updatedAt: new Date(),
      };
      if (prevId === "rejected") {
        patch.pendingIdResubmitCount = 0;
        patch.pendingCredentialResubmitCount = 0;
      }
      await ref.update(patch);
    } else {
      await ref.set({
        user: userId,
        requestType,
        identification_verified: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const out = await this.getVerifyingStatusByUserId(userId);
    if (!out) throw new Error("No se pudo guardar el estado");
    return out;
  }

  async upsertVerifyingStatusTransactionPending(
    userId: string,
    transactionDate: string,
    requestType: "onboarding" | "renewal" = "onboarding",
  ): Promise<VerifyingStatus> {
    if (!this.db) throw new Error("Firestore no configurado");
    const ref = this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).doc(userId);
    const snap = await ref.get();

    const existing = snap.exists ? await this.getVerifyingStatusByUserId(userId) : null;

    await ref.set(
      {
        user: userId,
        // Importante: si el pago es de renovación, debe reflejarse siempre.
        requestType,
        identification_verified: existing?.identification_verified ?? "rejected",
        transacction_date: transactionDate,
        transacction_verified: "pending",
        pendingIdResubmitCount: existing?.pendingIdResubmitCount,
        pendingCredentialResubmitCount: existing?.pendingCredentialResubmitCount,
        prefundPromoAwaitingDossier: false,
        prefundPromoCode: (existing as { prefundPromoCode?: string } | null)?.prefundPromoCode,
        prefundPromoMonths: (existing as { prefundPromoMonths?: number } | null)?.prefundPromoMonths,
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
      requestType: (data.requestType as any) ?? undefined,
      identification_verified: (data.identification_verified as any) ?? "rejected",
      transacction_date: data.transacction_date != null ? String(data.transacction_date) : null,
      transacction_verified:
        data.transacction_verified === undefined || data.transacction_verified === null
          ? null
          : (data.transacction_verified as any),
      pendingIdResubmitCount:
        typeof data.pendingIdResubmitCount === "number" && Number.isFinite(data.pendingIdResubmitCount)
          ? Math.max(0, Math.trunc(data.pendingIdResubmitCount as number))
          : undefined,
      pendingCredentialResubmitCount:
        typeof data.pendingCredentialResubmitCount === "number" && Number.isFinite(data.pendingCredentialResubmitCount)
          ? Math.max(0, Math.trunc(data.pendingCredentialResubmitCount as number))
          : undefined,
      prefundPromoAwaitingDossier: data.prefundPromoAwaitingDossier === true ? true : undefined,
      prefundPromoCode:
        typeof data.prefundPromoCode === "string" && data.prefundPromoCode.trim()
          ? String(data.prefundPromoCode).trim().toUpperCase()
          : undefined,
      prefundPromoMonths:
        typeof data.prefundPromoMonths === "number" && Number.isFinite(data.prefundPromoMonths)
          ? Math.max(1, Math.min(12, Math.trunc(data.prefundPromoMonths as number)))
          : undefined,
      createdAt: data.createdAt as any,
      updatedAt: data.updatedAt as any,
    });

    const byUserId = new Map<string, VerifyingStatus>();

    const [snapId, snapTx, snapPrefund] = await Promise.all([
      this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).where("identification_verified", "==", "pending").get(),
      this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).where("transacction_verified", "==", "pending").get(),
      this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).where("prefundPromoAwaitingDossier", "==", true).get(),
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
    for (const d of snapPrefund.docs) {
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
    // Permitir revertir un rechazo anterior (rejected→verified) sin exigir re-subida.
    // Solo bloquear si ya está verificado.
    if (existing.identification_verified === "verified") throw new Error("La identificación ya fue verificada");

    const updatePayload: Record<string, unknown> = {
      identification_verified: status,
      updatedAt: new Date(),
    };
    if (status === "rejected") {
      updatePayload.pendingIdResubmitCount = 0;
      updatePayload.pendingCredentialResubmitCount = 0;
    }
    await this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).doc(userId).update(updatePayload);

    const out = await this.getVerifyingStatusByUserId(userId);
    if (!out) throw new Error("No se pudo guardar el estado");
    return out;
  }

  async setVerifyingStatusTransaction(userId: string, status: ProfessionalVerificationState): Promise<VerifyingStatus> {
    if (!this.db) throw new Error("Firestore no configurado");
    const existing = await this.getVerifyingStatusByUserId(userId);
    if (!existing) throw new Error("Verificación no encontrada");
    if (existing.transacction_verified == null) throw new Error("Aún no hay comprobante de pago");
    if (existing.transacction_verified === "verified") throw new Error("La transacción ya fue verificada");

    const updatePayload: Record<string, unknown> = {
      transacction_verified: status,
      updatedAt: new Date(),
    };
    if (status === "rejected") {
      updatePayload.pendingIdResubmitCount = 0;
      updatePayload.pendingCredentialResubmitCount = 0;
    }
    await this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).doc(userId).update(updatePayload);

    const out = await this.getVerifyingStatusByUserId(userId);
    if (!out) throw new Error("No se pudo guardar el estado");
    return out;
  }

  async incrementPendingIdResubmitCount(userId: string): Promise<void> {
    if (!this.db) throw new Error("Firestore no configurado");
    await this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).doc(userId).update({
      pendingIdResubmitCount: 1,
      updatedAt: new Date(),
    });
  }

  async incrementPendingCredentialResubmitCount(userId: string): Promise<void> {
    if (!this.db) throw new Error("Firestore no configurado");
    await this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).doc(userId).update({
      pendingCredentialResubmitCount: 1,
      updatedAt: new Date(),
    });
  }

  async upsertVerifyingStatusPrefundPromoAwaitingDossier(
    userId: string,
    args: { code: string; monthsGranted: number },
  ): Promise<VerifyingStatus> {
    if (!this.db) throw new Error("Firestore no configurado");
    const ref = this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).doc(userId);
    const existing = await this.getVerifyingStatusByUserId(userId);
    const code = args.code.trim().toUpperCase();
    const months = Math.max(1, Math.min(12, Math.trunc(args.monthsGranted)));
    await ref.set(
      {
        user: userId,
        requestType: existing?.requestType ?? "onboarding",
        identification_verified: existing?.identification_verified ?? "rejected",
        transacction_date: existing?.transacction_date ?? null,
        transacction_verified: existing?.transacction_verified ?? null,
        pendingIdResubmitCount: existing?.pendingIdResubmitCount,
        pendingCredentialResubmitCount: existing?.pendingCredentialResubmitCount,
        prefundPromoAwaitingDossier: true,
        prefundPromoCode: code,
        prefundPromoMonths: months,
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    );
    const out = await this.getVerifyingStatusByUserId(userId);
    if (!out) throw new Error("No se pudo guardar el estado");
    return out;
  }

  async clearVerifyingStatusPrefundPromoAwaitingDossier(userId: string): Promise<void> {
    if (!this.db) return;
    const ref = this.db.collection(FIRESTORE_COLLECTIONS.VERIFYING_STATUS).doc(userId);
    const snap = await ref.get();
    if (!snap.exists) return;
    await ref.update({
      prefundPromoAwaitingDossier: false,
      updatedAt: new Date(),
    });
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
    if (!this.db) throw new Error("Firestore no configurado");
    const ref = this.db.collection(FIRESTORE_COLLECTIONS.PROFESSIONAL_VERIFICATIONS).doc(userId);
    const snap = await ref.get();
    const existing = snap.exists ? await this.getProfessionalVerificationByUserId(userId) : null;
    const payload: Record<string, unknown> = {
      userId,
      imageUrl: existing?.imageUrl ?? null,
      imageVerified: existing?.imageVerified === true ? true : false,
      professionalCredentialUrl: existing?.professionalCredentialUrl ?? null,
      transferReceiptCode: data.transferReceiptCode.trim(),
      transferDate: data.transferDate.trim(),
      subscriptionMonths: Math.max(1, Math.min(12, Math.trunc(data.subscriptionMonths))),
      promotionalCode: data.promotionalCode?.trim().toUpperCase() || null,
      promotionalDiscountPercent: null,
      subscriptionOriginalTotalUsd: null,
      subscriptionDiscountedTotalUsd: null,
      updatedAt: new Date(),
    };
    if (!snap.exists) {
      payload.createdAt = new Date();
    }
    await ref.set(payload, { merge: true });
    const out = await this.getProfessionalVerificationByUserId(userId);
    if (!out) throw new Error("No se pudo guardar el comprobante simbólico");
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
      countVerificationsAwaitingAdminReview(this),
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
        pendingVerificationCount: pendingVer,
        pendingWithdrawalRequestsCount: pendingWd.length,
      },
      params
    );
  }

  // ============ TIENDAS ============

  async createStore(input: InsertStore & { ownerUserId: string }): Promise<Store> {
    if (!this.db) throw new Error("Firestore no configurado");
    const existing = await this.getStoreByOwnerUserId(input.ownerUserId);
    if (existing) throw new Error("STORE_ALREADY_EXISTS");
    const slug = await resolveUniqueStoreSlug(input.name, (s) => this.storeSlugExists(s));
    const id = await this.getNextId("stores");
    const now = new Date();
    const payload: Store = {
      id,
      ownerUserId: input.ownerUserId,
      name: input.name.trim(),
      slug,
      description: null,
      rubro: null,
      coverImageUrl: null,
      visibilitySubscriptionEndsAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.collection(FIRESTORE_COLLECTIONS.STORES).doc(String(id)).set(payload);
    return payload;
  }

  async updateStore(storeId: number, input: UpdateStore): Promise<Store> {
    if (!this.db) throw new Error("Firestore no configurado");
    const store = await this.getStoreById(storeId);
    if (!store) throw new Error("STORE_NOT_FOUND");
    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.description !== undefined) {
      patch.description = input.description?.trim() ? input.description.trim() : null;
    }
    if (input.rubro !== undefined) patch.rubro = input.rubro;
    if (input.coverImageUrl !== undefined) {
      patch.coverImageUrl = input.coverImageUrl;
    }
    await this.db.collection(FIRESTORE_COLLECTIONS.STORES).doc(String(storeId)).update(patch);
    return {
      ...store,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() ? input.description.trim() : null }
        : {}),
      ...(input.rubro !== undefined ? { rubro: input.rubro } : {}),
      coverImageUrl: input.coverImageUrl !== undefined ? input.coverImageUrl : store.coverImageUrl,
      updatedAt: now,
    };
  }

  async getStoreById(id: number): Promise<Store | undefined> {
    if (!this.db) return undefined;
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.STORES).doc(String(id)).get();
    if (!doc.exists) return undefined;
    return this.mapStoreDoc(doc.id, doc.data());
  }

  async getStoreBySlug(slug: string): Promise<Store | undefined> {
    if (!this.db) return undefined;
    const key = slug.trim().toLowerCase();
    const snapshot = await this.db
      .collection(FIRESTORE_COLLECTIONS.STORES)
      .where("slug", "==", key)
      .limit(1)
      .get();
    if (snapshot.empty) return undefined;
    const doc = snapshot.docs[0];
    return this.mapStoreDoc(doc.id, doc.data());
  }

  async getStoreByOwnerUserId(ownerUserId: string): Promise<Store | undefined> {
    if (!this.db) return undefined;
    const snapshot = await this.db
      .collection(FIRESTORE_COLLECTIONS.STORES)
      .where("ownerUserId", "==", ownerUserId)
      .limit(1)
      .get();
    if (snapshot.empty) return undefined;
    const doc = snapshot.docs[0];
    return this.mapStoreDoc(doc.id, doc.data());
  }

  async storeSlugExists(slug: string): Promise<boolean> {
    const found = await this.getStoreBySlug(slug);
    return found != null;
  }

  async listActiveStores(options?: { limit?: number }): Promise<Store[]> {
    if (!this.db) return [];
    const limit = options?.limit ?? 100;
    const snapshot = await this.db.collection(FIRESTORE_COLLECTIONS.STORES).limit(500).get();
    const stores = snapshot.docs
      .map((doc) => this.mapStoreDoc(doc.id, doc.data()))
      .filter((store): store is Store => store != null && isStoreVisibilityActive(store));
    stores.sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
    return stores.slice(0, limit);
  }

  async listIngredientsMaterials(options: {
    q?: string;
    page: number;
    limit?: number;
  }): Promise<{ items: IngredientMaterial[]; total: number; page: number; limit: number }> {
    const limit = options.limit ?? INGREDIENTS_MATERIALS_PAGE_SIZE;
    const page = Math.max(1, options.page);
    const q = (options.q ?? "").trim().toLowerCase();
    if (!this.db) {
      return { items: [], total: 0, page, limit };
    }
    const col = this.db.collection(FIRESTORE_COLLECTIONS.INGREDIENTS_MATERIALS);

    if (q) {
      const prefixSnap = await col
        .where("normalizedName", ">=", q)
        .where("normalizedName", "<=", `${q}\uf8ff`)
        .orderBy("normalizedName")
        .limit(500)
        .get();
      const all = prefixSnap.docs.map((doc) => this.mapIngredientMaterialDoc(doc.id, doc.data()));
      const filtered = all.filter(
        (item) => item.name.toLowerCase().includes(q) || item.normalizedName.includes(q),
      );
      const total = filtered.length;
      const start = (page - 1) * limit;
      return { items: filtered.slice(start, start + limit), total, page, limit };
    }

    const countSnap = await col.count().get();
    const total = countSnap.data().count;
    const offset = (page - 1) * limit;
    const pageSnap = await col.orderBy("normalizedName").offset(offset).limit(limit).get();
    return {
      items: pageSnap.docs.map((doc) => this.mapIngredientMaterialDoc(doc.id, doc.data())),
      total,
      page,
      limit,
    };
  }

  async findIngredientMaterialByNormalizedName(normalizedName: string): Promise<IngredientMaterial | undefined> {
    if (!this.db) return undefined;
    const key = normalizedName.trim().toLowerCase();
    const snapshot = await this.db
      .collection(FIRESTORE_COLLECTIONS.INGREDIENTS_MATERIALS)
      .where("normalizedName", "==", key)
      .limit(1)
      .get();
    if (snapshot.empty) return undefined;
    const doc = snapshot.docs[0];
    return this.mapIngredientMaterialDoc(doc.id, doc.data());
  }

  async createIngredientMaterial(input: InsertIngredientMaterial): Promise<IngredientMaterial> {
    if (!this.db) throw new Error("Firestore no configurado");
    const name = normalizeIngredientMaterialName(input.name);
    const normalizedName = ingredientMaterialKey(name);
    const dup = await this.findIngredientMaterialByNormalizedName(normalizedName);
    if (dup) throw new Error("INGREDIENT_MATERIAL_ALREADY_EXISTS");
    const id = await this.getNextId("ingredients_materials");
    const now = new Date();
    const payload: IngredientMaterial = { id, name, normalizedName, createdAt: now };
    await this.db.collection(FIRESTORE_COLLECTIONS.INGREDIENTS_MATERIALS).doc(String(id)).set(payload);
    return payload;
  }

  async extendStoreVisibilitySubscription(args: {
    storeId: number;
    months: number;
    approvalAt?: Date;
  }): Promise<Store> {
    if (!this.db) throw new Error("Firestore no configurado");
    const store = await this.getStoreById(args.storeId);
    if (!store) throw new Error("STORE_NOT_FOUND");
    const nextIso = extendStoreVisibilitySubscriptionEndsAt(
      store.visibilitySubscriptionEndsAt,
      args.months,
      args.approvalAt ?? new Date(),
    );
    const now = new Date();
    await this.db.collection(FIRESTORE_COLLECTIONS.STORES).doc(String(args.storeId)).update({
      visibilitySubscriptionEndsAt: nextIso,
      updatedAt: now,
    });
    return { ...store, visibilitySubscriptionEndsAt: nextIso, updatedAt: now };
  }

  async patchStoreVisibilitySubscriptionEndsAt(storeId: number, endsAt: string | null): Promise<Store> {
    if (!this.db) throw new Error("Firestore no configurado");
    const store = await this.getStoreById(storeId);
    if (!store) throw new Error("STORE_NOT_FOUND");
    const now = new Date();
    await this.db.collection(FIRESTORE_COLLECTIONS.STORES).doc(String(storeId)).update({
      visibilitySubscriptionEndsAt: endsAt,
      updatedAt: now,
    });
    return { ...store, visibilitySubscriptionEndsAt: endsAt, updatedAt: now };
  }

  async findPendingStoreSubscriptionReport(storeId: number): Promise<any | undefined> {
    if (!this.db) return undefined;
    const reports = await this.listStoreSubscriptionFinancialReports("pending");
    return reports.find((r) => Number(r.storeId) === storeId);
  }

  async listStoreSubscriptionFinancialReports(
    status?: "pending" | "completed" | "rejected",
  ): Promise<any[]> {
    if (!this.db) return [];
    const snap = await this.db
      .collection(FIRESTORE_COLLECTIONS.FINANCIAL_REPORTS)
      .where("type", "==", STORE_SUBSCRIPTION_FEE_REPORT_TYPE)
      .limit(500)
      .get();
    let list = snap.docs.map((doc) => ({ id: parseInt(doc.id, 10) || doc.id, ...doc.data() } as Record<string, unknown> & { id: number | string }));
    if (status) list = list.filter((r) => r.status === status);
    list.sort((a, b) => {
      const ta =
        typeof (a.createdAt as { toMillis?: () => number })?.toMillis === "function"
          ? (a.createdAt as { toMillis: () => number }).toMillis()
          : new Date(String(a.createdAt ?? 0)).getTime();
      const tb =
        typeof (b.createdAt as { toMillis?: () => number })?.toMillis === "function"
          ? (b.createdAt as { toMillis: () => number }).toMillis()
          : new Date(String(b.createdAt ?? 0)).getTime();
      return tb - ta;
    });
    return list;
  }

  async patchStoreSubscriptionPaymentMeta(
    storeId: number,
    patch: {
      visibilitySubscriptionLastPaymentKey?: string | null;
      visibilitySubscriptionLastPaymentApprovedAt?: Date | string | null;
      visibilitySubscriptionLastPaymentApprovedBy?: string | null;
    },
  ): Promise<Store> {
    if (!this.db) throw new Error("Firestore no configurado");
    const store = await this.getStoreById(storeId);
    if (!store) throw new Error("STORE_NOT_FOUND");
    const now = new Date();
    await this.db.collection(FIRESTORE_COLLECTIONS.STORES).doc(String(storeId)).update({
      ...patch,
      updatedAt: now,
    });
    return { ...store, ...patch, updatedAt: now };
  }

  async listStoreProducts(storeId: number): Promise<StoreProduct[]> {
    if (!this.db) return [];
    const snap = await this.db
      .collection(FIRESTORE_COLLECTIONS.STORE_PRODUCTS)
      .where("storeId", "==", storeId)
      .get();
    return snap.docs
      .map((doc) => this.mapStoreProductDoc(doc.id, doc.data()))
      .filter((p): p is StoreProduct => p != null)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  async getStoreProduct(storeId: number, productId: number): Promise<StoreProduct | undefined> {
    if (!this.db) return undefined;
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.STORE_PRODUCTS).doc(String(productId)).get();
    if (!doc.exists) return undefined;
    const product = this.mapStoreProductDoc(doc.id, doc.data());
    if (!product || product.storeId !== storeId) return undefined;
    return product;
  }

  async createStoreProduct(storeId: number, input: InsertStoreProduct): Promise<StoreProduct> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("store_products");
    const now = new Date();
    const payload: StoreProduct = {
      id,
      storeId,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      price: Number(input.price),
      categoryIds: input.categoryIds ?? [],
      ingredientMaterialIds: input.ingredientMaterialIds ?? [],
      imageUrls: input.imageUrls ?? [],
      showOnShowcase: input.showOnShowcase ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.collection(FIRESTORE_COLLECTIONS.STORE_PRODUCTS).doc(String(id)).set(payload);
    return payload;
  }

  async updateStoreProduct(
    storeId: number,
    productId: number,
    input: UpdateStoreProduct,
  ): Promise<StoreProduct> {
    if (!this.db) throw new Error("Firestore no configurado");
    const existing = await this.getStoreProduct(storeId, productId);
    if (!existing) throw new Error("STORE_PRODUCT_NOT_FOUND");
    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.description !== undefined) patch.description = input.description?.trim() ?? null;
    if (input.price !== undefined) patch.price = Number(input.price);
    if (input.categoryIds !== undefined) patch.categoryIds = input.categoryIds;
    if (input.ingredientMaterialIds !== undefined) patch.ingredientMaterialIds = input.ingredientMaterialIds;
    if (input.imageUrls !== undefined) patch.imageUrls = input.imageUrls;
    if (input.showOnShowcase !== undefined) patch.showOnShowcase = input.showOnShowcase;
    await this.db.collection(FIRESTORE_COLLECTIONS.STORE_PRODUCTS).doc(String(productId)).update(patch);
    return { ...existing, ...patch, updatedAt: now } as StoreProduct;
  }

  async deleteStoreProduct(storeId: number, productId: number): Promise<void> {
    if (!this.db) throw new Error("Firestore no configurado");
    const existing = await this.getStoreProduct(storeId, productId);
    if (!existing) throw new Error("STORE_PRODUCT_NOT_FOUND");
    await this.db.collection(FIRESTORE_COLLECTIONS.STORE_PRODUCTS).doc(String(productId)).delete();
  }

  async listStoreCategories(storeId: number): Promise<StoreCategory[]> {
    if (!this.db) return [];
    const snap = await this.db
      .collection(FIRESTORE_COLLECTIONS.STORE_CATEGORIES)
      .where("storeId", "==", storeId)
      .get();
    return snap.docs
      .map((doc) => this.mapStoreCategoryDoc(doc.id, doc.data()))
      .filter((c): c is StoreCategory => c != null)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  async getStoreCategory(storeId: number, categoryId: number): Promise<StoreCategory | undefined> {
    if (!this.db) return undefined;
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.STORE_CATEGORIES).doc(String(categoryId)).get();
    if (!doc.exists) return undefined;
    const category = this.mapStoreCategoryDoc(doc.id, doc.data());
    if (!category || category.storeId !== storeId) return undefined;
    return category;
  }

  async createStoreCategory(
    storeId: number,
    input: Omit<InsertStoreCategory, "productIds">,
  ): Promise<StoreCategory> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("store_categories");
    const now = new Date();
    const payload: StoreCategory = {
      id,
      storeId,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.collection(FIRESTORE_COLLECTIONS.STORE_CATEGORIES).doc(String(id)).set(payload);
    return payload;
  }

  async updateStoreCategory(
    storeId: number,
    categoryId: number,
    input: Omit<UpdateStoreCategory, "productIds">,
  ): Promise<StoreCategory> {
    if (!this.db) throw new Error("Firestore no configurado");
    const existing = await this.getStoreCategory(storeId, categoryId);
    if (!existing) throw new Error("STORE_CATEGORY_NOT_FOUND");
    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.description !== undefined) {
      patch.description = input.description?.trim() ? input.description.trim() : null;
    }
    await this.db.collection(FIRESTORE_COLLECTIONS.STORE_CATEGORIES).doc(String(categoryId)).update(patch);
    return { ...existing, ...patch, updatedAt: now } as StoreCategory;
  }

  async deleteStoreCategory(storeId: number, categoryId: number): Promise<void> {
    if (!this.db) throw new Error("Firestore no configurado");
    const existing = await this.getStoreCategory(storeId, categoryId);
    if (!existing) throw new Error("STORE_CATEGORY_NOT_FOUND");
    await this.db.collection(FIRESTORE_COLLECTIONS.STORE_CATEGORIES).doc(String(categoryId)).delete();
  }

  async listStorePromotions(storeId: number): Promise<StorePromotion[]> {
    if (!this.db) return [];
    const snap = await this.db
      .collection(FIRESTORE_COLLECTIONS.STORE_PROMOTIONS)
      .where("storeId", "==", storeId)
      .get();
    return snap.docs
      .map((doc) => this.mapStorePromotionDoc(doc.id, doc.data()))
      .filter((p): p is StorePromotion => p != null)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  async getStorePromotion(storeId: number, promotionId: number): Promise<StorePromotion | undefined> {
    if (!this.db) return undefined;
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.STORE_PROMOTIONS).doc(String(promotionId)).get();
    if (!doc.exists) return undefined;
    const promotion = this.mapStorePromotionDoc(doc.id, doc.data());
    if (!promotion || promotion.storeId !== storeId) return undefined;
    return promotion;
  }

  async createStorePromotion(storeId: number, input: InsertStorePromotion): Promise<StorePromotion> {
    if (!this.db) throw new Error("Firestore no configurado");
    const id = await this.getNextId("store_promotions");
    const now = new Date();
    const payload: StorePromotion = {
      id,
      storeId,
      name: input.name.trim(),
      description: input.description?.trim() ? input.description.trim() : null,
      price: input.price,
      items: this.normalizePromotionItems(input.items),
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
    };
    await this.db.collection(FIRESTORE_COLLECTIONS.STORE_PROMOTIONS).doc(String(id)).set(payload);
    return payload;
  }

  async updateStorePromotion(
    storeId: number,
    promotionId: number,
    input: UpdateStorePromotion,
  ): Promise<StorePromotion> {
    if (!this.db) throw new Error("Firestore no configurado");
    const existing = await this.getStorePromotion(storeId, promotionId);
    if (!existing) throw new Error("STORE_PROMOTION_NOT_FOUND");
    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.description !== undefined) {
      patch.description = input.description?.trim() ? input.description.trim() : null;
    }
    if (input.price !== undefined) patch.price = input.price;
    if (input.items !== undefined) patch.items = this.normalizePromotionItems(input.items);
    if (input.status !== undefined) patch.status = input.status;
    await this.db.collection(FIRESTORE_COLLECTIONS.STORE_PROMOTIONS).doc(String(promotionId)).update(patch);
    return { ...existing, ...patch, updatedAt: now } as StorePromotion;
  }

  async deleteStorePromotion(storeId: number, promotionId: number): Promise<void> {
    if (!this.db) throw new Error("Firestore no configurado");
    const existing = await this.getStorePromotion(storeId, promotionId);
    if (!existing) throw new Error("STORE_PROMOTION_NOT_FOUND");
    await this.db.collection(FIRESTORE_COLLECTIONS.STORE_PROMOTIONS).doc(String(promotionId)).delete();
  }

  private storeCartDocId(userId: string, storeId: number): string {
    return `${userId}_${storeId}`;
  }

  async getStoreCart(userId: string, storeId: number): Promise<StoreCart | undefined> {
    if (!this.db) return undefined;
    const doc = await this.db
      .collection(FIRESTORE_COLLECTIONS.STORE_CARTS)
      .doc(this.storeCartDocId(userId, storeId))
      .get();
    if (!doc.exists) return undefined;
    const cart = this.mapStoreCartDoc(doc.data());
    if (!cart || cart.storeId !== storeId || cart.userId !== userId) return undefined;
    if (new Date(cart.expiresAt).getTime() <= Date.now()) {
      await this.deleteStoreCart(userId, storeId);
      return undefined;
    }
    return cart;
  }

  async saveStoreCart(userId: string, storeId: number, items: StoreCartItem[]): Promise<StoreCart> {
    if (!this.db) throw new Error("Firestore no configurado");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + STORE_CART_TTL_MS);
    const docId = this.storeCartDocId(userId, storeId);
    const existing = await this.getStoreCart(userId, storeId);
    const payload: StoreCart = {
      userId,
      storeId,
      items: this.normalizeStoreCartItems(items),
      expiresAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.collection(FIRESTORE_COLLECTIONS.STORE_CARTS).doc(docId).set(payload);
    return payload;
  }

  async deleteStoreCart(userId: string, storeId: number): Promise<void> {
    if (!this.db) throw new Error("Firestore no configurado");
    await this.db.collection(FIRESTORE_COLLECTIONS.STORE_CARTS).doc(this.storeCartDocId(userId, storeId)).delete();
  }

  private normalizeStoreCartItems(items: StoreCartItem[]): StoreCartItem[] {
    return items.map((item) => {
      if (item.kind === "product") {
        return {
          kind: "product" as const,
          productId: item.productId,
          quantity: Math.max(1, Math.min(9999, Math.floor(item.quantity))),
        };
      }
      return {
        kind: "promotion" as const,
        promotionId: item.promotionId,
        quantity: Math.max(1, Math.min(99, Math.floor(item.quantity))),
      };
    });
  }

  private mapStoreCartDoc(data: Record<string, unknown> | undefined): StoreCart | undefined {
    if (!data) return undefined;
    const userId = String(data.userId ?? "");
    const storeId = Number(data.storeId);
    if (!userId || !Number.isFinite(storeId)) return undefined;
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items: StoreCartItem[] = rawItems
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const kind = r.kind === "promotion" ? "promotion" : r.kind === "product" ? "product" : null;
        if (!kind) return null;
        const quantity = Number(r.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) return null;
        if (kind === "product") {
          const productId = Number(r.productId);
          if (!Number.isFinite(productId) || productId <= 0) return null;
          return { kind: "product" as const, productId, quantity: Math.floor(quantity) };
        }
        const promotionId = Number(r.promotionId);
        if (!Number.isFinite(promotionId) || promotionId <= 0) return null;
        return { kind: "promotion" as const, promotionId, quantity: Math.floor(quantity) };
      })
      .filter((x): x is StoreCartItem => x != null);
    const expiresAt = this.readFirestoreDate(data.expiresAt) ?? new Date();
    return {
      userId,
      storeId,
      items,
      expiresAt,
      createdAt: this.readFirestoreDate(data.createdAt) ?? new Date(),
      updatedAt: this.readFirestoreDate(data.updatedAt) ?? new Date(),
    };
  }

  private normalizePromotionItems(items: StorePromotionLineItem[]): StorePromotionLineItem[] {
    return items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      status: item.status === "inactive" ? "inactive" : "active",
    }));
  }

  private mapStorePromotionDoc(
    docId: string,
    data: Record<string, unknown> | undefined,
  ): StorePromotion | undefined {
    if (!data) return undefined;
    const id = Number(data.id ?? docId);
    if (!Number.isFinite(id)) return undefined;
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items: StorePromotionLineItem[] = rawItems
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const productId = Number(r.productId);
        const quantity = Number(r.quantity);
        if (!Number.isFinite(productId) || productId <= 0) return null;
        if (!Number.isFinite(quantity) || quantity <= 0) return null;
        return {
          productId,
          quantity: Math.floor(quantity),
          status: r.status === "inactive" ? "inactive" : "active",
        } satisfies StorePromotionLineItem;
      })
      .filter((x): x is StorePromotionLineItem => x != null);
    const status = data.status === "inactive" ? "inactive" : "active";
    return {
      id,
      storeId: Number(data.storeId),
      name: String(data.name ?? ""),
      description:
        data.description != null && String(data.description).trim()
          ? String(data.description).trim()
          : null,
      price: Number(data.price),
      items,
      status,
      createdAt: this.readFirestoreDate(data.createdAt) ?? new Date(),
      updatedAt: this.readFirestoreDate(data.updatedAt) ?? new Date(),
    };
  }

  private mapStoreCategoryDoc(
    docId: string,
    data: Record<string, unknown> | undefined,
  ): StoreCategory | undefined {
    if (!data) return undefined;
    const id = Number(data.id ?? docId);
    if (!Number.isFinite(id)) return undefined;
    return {
      id,
      storeId: Number(data.storeId),
      name: String(data.name ?? ""),
      description: data.description != null && String(data.description).trim()
        ? String(data.description).trim()
        : null,
      createdAt: this.readFirestoreDate(data.createdAt) ?? new Date(),
      updatedAt: this.readFirestoreDate(data.updatedAt) ?? new Date(),
    };
  }

  private mapStoreProductDoc(
    docId: string,
    data: Record<string, unknown> | undefined,
  ): StoreProduct | undefined {
    if (!data) return undefined;
    const id = Number(data.id ?? docId);
    if (!Number.isFinite(id)) return undefined;
    return {
      id,
      storeId: Number(data.storeId),
      name: String(data.name ?? ""),
      description: data.description != null ? String(data.description) : null,
      price: Number(data.price ?? 0),
      categoryIds: Array.isArray(data.categoryIds)
        ? data.categoryIds.map((x) => Number(x)).filter((n) => Number.isFinite(n))
        : [],
      ingredientMaterialIds: Array.isArray(data.ingredientMaterialIds)
        ? data.ingredientMaterialIds.map((x) => Number(x)).filter((n) => Number.isFinite(n))
        : [],
      imageUrls: Array.isArray(data.imageUrls)
        ? data.imageUrls.map((x) => String(x).trim()).filter((u) => u.length > 0).slice(0, 4)
        : [],
      showOnShowcase: data.showOnShowcase !== false,
      createdAt: this.readFirestoreDate(data.createdAt) ?? new Date(),
      updatedAt: this.readFirestoreDate(data.updatedAt) ?? new Date(),
    };
  }

  private mapStoreDoc(docId: string, data: Record<string, unknown> | undefined): Store | undefined {
    if (!data) return undefined;
    const id = Number(data.id ?? docId);
    if (!Number.isFinite(id)) return undefined;
    return {
      id,
      ownerUserId: String(data.ownerUserId ?? ""),
      name: String(data.name ?? ""),
      slug: String(data.slug ?? ""),
      description:
        data.description != null && String(data.description).trim()
          ? String(data.description).trim()
          : null,
      rubro:
        data.rubro != null && String(data.rubro).trim() ? String(data.rubro).trim() : null,
      coverImageUrl: data.coverImageUrl != null && String(data.coverImageUrl).trim()
        ? String(data.coverImageUrl).trim()
        : null,
      visibilitySubscriptionEndsAt: this.readFirestoreDate(data.visibilitySubscriptionEndsAt),
      createdAt: this.readFirestoreDate(data.createdAt) ?? new Date(),
      updatedAt: this.readFirestoreDate(data.updatedAt) ?? new Date(),
    };
  }

  private mapIngredientMaterialDoc(docId: string, data: Record<string, unknown> | undefined): IngredientMaterial {
    const id = Number(data?.id ?? docId);
    return {
      id: Number.isFinite(id) ? id : parseInt(docId, 10),
      name: String(data?.name ?? ""),
      normalizedName: String(data?.normalizedName ?? ""),
      createdAt: this.readFirestoreDate(data?.createdAt) ?? new Date(),
    };
  }

  private readFirestoreDate(raw: unknown): Date | null {
    if (raw == null) return null;
    if (raw instanceof Date) return raw;
    if (typeof raw === "object" && raw !== null && typeof (raw as { toDate?: () => Date }).toDate === "function") {
      try {
        const d = (raw as { toDate: () => Date }).toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    if (typeof raw === "string") {
      const t = Date.parse(raw);
      return Number.isNaN(t) ? null : new Date(t);
    }
    if (typeof raw === "number" && Number.isFinite(raw)) return new Date(raw);
    return null;
  }

  async seedRoles(): Promise<void> {
    if (!this.db) return;
    const col = this.db.collection(FIRESTORE_COLLECTIONS.ROLES);
    for (const r of SYSTEM_ROLE_CATALOG_DEFAULTS) {
      const ref = col.doc(r.code);
      const snap = await ref.get();
      const { code, isSystem, sortOrder, ...fields } = r;
      if (!snap.exists) {
        await ref.set({
          code,
          ...fields,
          isSystem: isSystem ?? true,
          sortOrder: sortOrder ?? 99,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        continue;
      }
      const existing = snap.data() as RoleDefinition;
      const patch: Partial<RoleDefinition> = {};
      if (!existing.description?.trim() && fields.description) patch.description = fields.description;
      if (!existing.responsibilities?.trim() && fields.responsibilities) {
        patch.responsibilities = fields.responsibilities;
      }
      if (!existing.permissions && fields.permissions) {
        patch.permissions = fields.permissions;
      }
      if (Object.keys(patch).length > 0) {
        await ref.update({ ...patch, updatedAt: new Date() });
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
