/**
 * Configuración de Firebase Admin SDK
 * GenFeb
 * 
 * Para conectar a Firebase:
 * 1. Crea un proyecto en Firebase Console (https://console.firebase.google.com)
 * 2. Habilita Firestore Database y Authentication
 * 3. Descarga el archivo de claves JSON del Admin SDK
 * 4. Configura las variables de entorno en .env
 */

// IMPORTANTE:
// Con firebase-admin v13+ y Node ESM, hay que usar import por defecto.
// Si usamos `import * as admin from "firebase-admin"`, `admin.credential` puede venir undefined.
import admin from "firebase-admin";

// Configuración desde variables de entorno
const projectId = process.env.FIREBASE_PROJECT_ID;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

// Verificar si hay configuración de Firebase
const hasFirebaseConfig = projectId && privateKey && clientEmail;

let firestoreDb: admin.firestore.Firestore | null = null;
let firebaseAuth: admin.auth.Auth | null = null;

/**
 * Inicializa Firebase Admin SDK
 * Solo se inicializa si hay configuración válida
 */
export function initializeFirebase(): boolean {
  if (!hasFirebaseConfig) {
    console.log("⚠️ Firebase no configurado. Usando almacenamiento en memoria.");
    console.log("   Configura las siguientes variables de entorno:");
    console.log("   - FIREBASE_PROJECT_ID");
    console.log("   - FIREBASE_PRIVATE_KEY");
    console.log("   - FIREBASE_CLIENT_EMAIL");
    return false;
  }

  try {
    // Verificar si ya está inicializado (usar optional chaining)
    if (admin.apps && admin.apps.length > 0) {
      firestoreDb = admin.firestore();
      firebaseAuth = admin.auth();
      console.log("✅ Firebase Admin SDK ya inicializado");
      return true;
    }

    // Inicializar Firebase Admin
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        privateKey,
        clientEmail,
      }),
    });

    firestoreDb = admin.firestore();
    firebaseAuth = admin.auth();

    // Configurar Firestore timestamps
    firestoreDb.settings({
      ignoreUndefinedProperties: true,
    });

    console.log("✅ Firebase Admin SDK inicializado correctamente");
    return true;
  } catch (error) {
    console.error("❌ Error al inicializar Firebase:", error);
    return false;
  }
}

/**
 * Obtiene la instancia de Firestore
 */
export function getFirestore(): admin.firestore.Firestore | null {
  return firestoreDb;
}

/**
 * Obtiene la instancia de Auth
 */
export function getFirebaseAuth(): admin.auth.Auth | null {
  return firebaseAuth;
}

/**
 * Verifica si Firebase está configurado
 */
export function isFirebaseConfigured(): boolean {
  return !!(hasFirebaseConfig && firestoreDb !== null);
}

/**
 * Crea un usuario en Firebase Auth
 */
export async function createFirebaseUser(
  email: string,
  password: string,
  displayName: string
): Promise<admin.auth.UserRecord> {
  if (!firebaseAuth) {
    throw new Error("Firebase Auth no está configurado");
  }

  return firebaseAuth.createUser({
    email,
    password,
    displayName,
    emailVerified: false,
  });
}

/**
 * Verifica el token de ID de Firebase
 */
export async function verifyFirebaseToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  if (!firebaseAuth) {
    throw new Error("Firebase Auth no está configurado");
  }

  return firebaseAuth.verifyIdToken(idToken);
}

/**
 * Obtiene un usuario por UID
 */
export async function getFirebaseUser(uid: string): Promise<admin.auth.UserRecord | null> {
  if (!firebaseAuth) {
    return null;
  }

  try {
    return await firebaseAuth.getUser(uid);
  } catch {
    return null;
  }
}

/**
 * Colecciones de Firestore (alineadas con el modelo del sistema)
 */
export const FIRESTORE_COLLECTIONS = {
  USERS: "users",
  USER_ROLES: "user_roles",
  CATEGORIES: "categories",
  SUB_CATEGORIES: "sub_categories",
  PROVIDERS: "providers",
  /** Car Go: one document per registered vehicle (linked to `providerId`). */
  VEHICLES: "vehicles",
  SERVICES: "services",
  SERVICE_ADDONS: "service_addons",
  BOOKINGS: "bookings",
  BOOKING_ADDONS: "booking_addons",
  BOOKING_STATUSES: "booking_statuses",
  TAXES: "taxes",
  COUPONS: "coupons",
  PROMOTIONAL_CODES: "promotional_codes",
  ESCROW_PAYMENTS: "escrow_payments",
  DOCUMENTS: "documents",
  CONVERSATIONS: "conversations",
  MESSAGES: "messages",
  NOTIFICATIONS: "notifications",
  FINANCIAL_REPORTS: "financial_reports",
  REVIEWS: "reviews",
  REVIEW_STATS: "review_stats",
  MANGO_SYNC: "mango_sync",
  PAYMENTS: "payments",
  INVOICES: "invoices",
  _COUNTERS: "_counters",
  ROLES: "roles",
  USER_DEVICE_TOKENS: "user_device_tokens",
  WALLET_TRANSFERS: "wallet_transfers",
  WITHDRAWAL_REJECTIONS: "withdrawal_rejections",
  BOOKING_RATINGS: "booking_ratings",
  /** Verificación de profesionales (1 doc por userId). */
  PROFESSIONAL_VERIFICATIONS: "professional_verifications",
  /** Estado de verificación por profesional (1 doc por userId). */
  VERIFYING_STATUS: "verifying_status",
  /** Ajustes globales (comisión, etc.): doc `global`. */
  PLATFORM_SETTINGS: "platform_settings",
  /** Peticiones de cambio de datos de cuenta (correo/nombre/teléfono). */
  ACCOUNT_CHANGE_REQUESTS: "account_change_requests",
  /** Auditoría admin (acciones sensibles). */
  ADMIN_AUDIT_LOG: "admin_audit_log",
  /**
   * Reservas por subcategoría en el mes (1 doc por `YYYY-MM`, campos `c_{subcategoryId}` = contador).
   * Usado para popularidad en la home (Explorar).
   */
  STATS_SUBCATEGORY_BOOKINGS_MONTHLY: "stats_subcategory_bookings_monthly",
  /** Historial persistente de viajes Car Go / Pack Go (completados, cancelados, expirados). */
  MOBILITY_RIDE_HISTORY: "mobility_ride_history",
  /** Tiendas online (1 por dueño en MVP). */
  STORES: "stores",
  /** Productos de una tienda. */
  STORE_PRODUCTS: "store_products",
  /** Categorías internas de una tienda (agrupan productos). */
  STORE_CATEGORIES: "store_categories",
  /** Promociones / combos de una tienda. */
  STORE_PROMOTIONS: "store_promotions",
  /** Carrito de compras por usuario y tienda (1 por par userId+storeId). */
  STORE_CARTS: "store_carts",
  /** Ingredientes y materiales globales (sin pertenencia a tienda). */
  INGREDIENTS_MATERIALS: "ingredients_materials",
} as const;
