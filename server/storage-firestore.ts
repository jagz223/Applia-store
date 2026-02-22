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
  type InsertCategory,
  type InsertProvider,
  type InsertService,
  type InsertBooking,
  type ProviderWithUser,
  type ServiceWithProvider,
} from "@shared/schema";
import { eq, and, like, desc } from "drizzle-orm";

interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  lastName: string;
  phone?: string;
  role: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FirestoreStorage {
  // Usuarios
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Partial<User>): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
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
  
  // Reservas
  getBookingsByUser(userId: string, status?: string): Promise<(Booking & { service: ServiceWithProvider })[]>;
  getBookingsByProvider(providerId: number): Promise<(Booking & { service: ServiceWithProvider, user: User })[]>;
  getBooking(id: number): Promise<Booking | undefined>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  updateBookingStatus(id: number, status: string): Promise<Booking | undefined>;
}

class FirestoreStorageImpl implements FirestoreStorage {
  private db = getFirestore();

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

  async getAllProviders(profession?: string): Promise<Provider[]> {
    if (!this.db) return [];
    
    let query = this.db.collection(FIRESTORE_COLLECTIONS.PROVIDERS);
    
    if (profession) {
      query = query.where("profession", "==", profession) as any;
    }
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({
      id: parseInt(doc.id),
      ...doc.data(),
    } as Provider));
  }

  async getProvider(id: number): Promise<Provider | undefined> {
    if (!this.db) return undefined;
    
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.PROVIDERS).doc(id.toString()).get();
    if (!doc.exists) return undefined;
    
    return {
      id: parseInt(doc.id),
      ...doc.data(),
    } as Provider;
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
    
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.PROVIDERS).doc();
    const newProvider: Provider = {
      id: parseInt(docRef.id),
      ...provider,
      createdAt: new Date(),
      verified: false,
    };
    
    await docRef.set(newProvider);
    return newProvider;
  }

  // ============ SERVICIOS ============

  async getAllServices(categoryId?: number, search?: string): Promise<ServiceWithProvider[]> {
    if (!this.db) return [];
    
    let query = this.db.collection(FIRESTORE_COLLECTIONS.SERVICES);
    
    if (categoryId) {
      query = query.where("categoryId", "==", categoryId) as any;
    }
    
    const snapshot = await query.get();
    
    const services = snapshot.docs.map(doc => ({
      id: parseInt(doc.id),
      ...doc.data(),
    } as Service));
    
    // Obtener proveedores para cada servicio
    const servicesWithProviders: ServiceWithProvider[] = [];
    
    for (const service of services) {
      const provider = await this.getProvider(service.providerId);
      servicesWithProviders.push({
        ...service,
        provider: provider || undefined,
      });
    }
    
    // Filtrar por búsqueda si aplica
    if (search) {
      const searchLower = search.toLowerCase();
      return servicesWithProviders.filter(
        s => s.title?.toLowerCase().includes(searchLower) || 
             s.description?.toLowerCase().includes(searchLower)
      );
    }
    
    return servicesWithProviders;
  }

  async getService(id: number): Promise<ServiceWithProvider | undefined> {
    if (!this.db) return undefined;
    
    const doc = await this.db.collection(FIRESTORE_COLLECTIONS.SERVICES).doc(id.toString()).get();
    if (!doc.exists) return undefined;
    
    const service = {
      id: parseInt(doc.id),
      ...doc.data(),
    } as Service;
    
    const provider = await this.getProvider(service.providerId);
    
    return {
      ...service,
      provider: provider || undefined,
    };
  }

  async createService(service: InsertService): Promise<Service> {
    if (!this.db) throw new Error("Firestore no configurado");
    
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.SERVICES).doc();
    const newService: Service = {
      id: parseInt(docRef.id),
      ...service,
      createdAt: new Date(),
    };
    
    await docRef.set(newService);
    return newService;
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
      const user = await this.getUserById(booking.userId);
      
      bookings.push({
        ...booking,
        service: service!,
        user: user!,
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
    
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).doc();
    const newBooking: Booking = {
      id: parseInt(docRef.id),
      ...booking,
      status: "pending",
      createdAt: new Date(),
    };
    
    await docRef.set(newBooking);
    return newBooking;
  }

  async updateBookingStatus(id: number, status: string): Promise<Booking | undefined> {
    if (!this.db) return undefined;
    
    const docRef = this.db.collection(FIRESTORE_COLLECTIONS.BOOKINGS).doc(id.toString());
    const doc = await docRef.get();
    
    if (!doc.exists) return undefined;
    
    await docRef.update({ status });
    
    const updated = await docRef.get();
    return {
      id: parseInt(updated.id),
      ...updated.data(),
    } as Booking;
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
