/**
 * Configuración de Firebase Admin SDK
 * GenFeb S.A.S.
 * 
 * Para conectar a Firebase:
 * 1. Crea un proyecto en Firebase Console (https://console.firebase.google.com)
 * 2. Habilita Firestore Database y Authentication
 * 3. Descarga el archivo de claves JSON del Admin SDK
 * 4. Configura las variables de entorno en .env
 */

import * as admin from "firebase-admin";

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
    // Verificar si ya está inicializado
    if (admin.apps.length > 0) {
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
 * Colecciones de Firestore
 */
export const FIRESTORE_COLLECTIONS = {
  USERS: "users",
  PROVIDERS: "providers",
  SERVICES: "services",
  BOOKINGS: "bookings",
  REVIEWS: "reviews",
  NOTIFICATIONS: "notifications",
  PAYMENTS: "payments",
  CONVERSATIONS: "conversations",
  MESSAGES: "messages",
  INVOICES: "invoices",
  CATEGORIES: "categories",
} as const;
