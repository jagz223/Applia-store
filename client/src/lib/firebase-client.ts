import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, type FirebaseStorage } from "firebase/storage";

type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

let firebaseApp: FirebaseApp | null = null;
let messagingPromise: Promise<Messaging | null> | null = null;
let storageInstance: FirebaseStorage | null = null;

function buildConfig(): FirebaseClientConfig {
  const {
    VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID,
  } = import.meta.env;

  if (
    !VITE_FIREBASE_API_KEY ||
    !VITE_FIREBASE_AUTH_DOMAIN ||
    !VITE_FIREBASE_PROJECT_ID ||
    !VITE_FIREBASE_STORAGE_BUCKET ||
    !VITE_FIREBASE_MESSAGING_SENDER_ID ||
    !VITE_FIREBASE_APP_ID
  ) {
    throw new Error("Firebase web config missing. Check VITE_FIREBASE_* variables.");
  }

  return {
    apiKey: VITE_FIREBASE_API_KEY,
    authDomain: VITE_FIREBASE_AUTH_DOMAIN,
    projectId: VITE_FIREBASE_PROJECT_ID,
    storageBucket: VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: VITE_FIREBASE_APP_ID,
  };
}

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (firebaseApp) return firebaseApp;
  if (getApps().length > 0) {
    firebaseApp = getApps()[0]!;
    return firebaseApp;
  }
  const config = buildConfig();
  firebaseApp = initializeApp(config);
  return firebaseApp;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  if (typeof window === "undefined") return null;
  const app = getFirebaseApp();
  if (!app) return null;
  if (!storageInstance) storageInstance = getStorage(app);
  return storageInstance;
}

const MAX_AVATAR_SIZE_MB = 5;
const MAX_ID_DOC_SIZE_MB = 5;
const MAX_CHAT_PAYMENT_PROOF_MB = 8;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Documento de identidad en verificaci?n: solo JPG o PNG. */
const ALLOWED_VERIFICATION_ID_TYPES = ["image/jpeg", "image/png"] as const;

/**
 * Sube una imagen de perfil a Firebase Storage y devuelve la URL de descarga.
 * Usado en registro (y opcionalmente en perfil). El archivo no pasa por el servidor.
 */
export async function uploadProfileImage(file: File): Promise<string> {
  if (file.size > MAX_AVATAR_SIZE_MB * 1024 * 1024) {
    throw new Error(`La imagen no debe superar ${MAX_AVATAR_SIZE_MB} MB`);
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Formato no v?lido. Usa JPG, PNG, WebP o GIF.");
  }
  const storage = getFirebaseStorage();
  if (!storage) throw new Error("Firebase Storage no est? configurado. Revisa las variables VITE_FIREBASE_*.");

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
  const path = `avatars/${crypto.randomUUID()}_${Date.now()}.${safeExt}`;
  const storageRef = ref(storage, path);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
    task.on(
      "state_changed",
      () => {},
      (err) => reject(err),
      () => resolve()
    );
  });

  return getDownloadURL(storageRef);
}

const MAX_CATEGORY_ICON_SIZE_MB = 2;

/**
 * Sube un icono de categor?a/subcategor?a (solo PNG) a Firebase Storage.
 */
export async function uploadCategoryIconImage(file: File): Promise<string> {
  if (file.size > MAX_CATEGORY_ICON_SIZE_MB * 1024 * 1024) {
    throw new Error(`La imagen no debe superar ${MAX_CATEGORY_ICON_SIZE_MB} MB`);
  }
  if (file.type !== "image/png") {
    throw new Error("Solo se permiten archivos PNG.");
  }
  const storage = getFirebaseStorage();
  if (!storage) throw new Error("Firebase Storage no est? configurado. Revisa las variables VITE_FIREBASE_*.");

  const path = `category-icons/${crypto.randomUUID()}_${Date.now()}.png`;
  const storageRef = ref(storage, path);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: "image/png" });
    task.on(
      "state_changed",
      () => {},
      (err) => reject(err),
      () => resolve()
    );
  });

  return getDownloadURL(storageRef);
}

/**
 * Sube una captura de comprobante de pago desde el chat.
 * Path: `chat_payment_proofs/{conversationId}/{uuid}.{ext}`
 */
export async function uploadChatPaymentProof(userId: string, conversationId: number, file: File): Promise<string> {
  if (file.size > MAX_CHAT_PAYMENT_PROOF_MB * 1024 * 1024) {
    throw new Error(`La imagen no debe superar ${MAX_CHAT_PAYMENT_PROOF_MB} MB`);
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Formato no v?lido. Usa JPG, PNG, WebP o GIF.");
  }
  const storage = getFirebaseStorage();
  if (!storage) throw new Error("Firebase Storage no est? configurado. Revisa las variables VITE_FIREBASE_*.");

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
  const path = `chat_payment_proofs/${conversationId}/${userId}_${crypto.randomUUID()}_${Date.now()}.${safeExt}`;
  const storageRef = ref(storage, path);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
    task.on(
      "state_changed",
      () => {},
      (err) => reject(err),
      () => resolve()
    );
  });

  return getDownloadURL(storageRef);
}

/**
 * Sube documento de identificaci?n para verificaci?n de profesional.
 * - No pasa por el servidor: se sube directo desde el navegador.
 * - Storage path: `verification_ids/{userId}/{uuid}.{ext}`
 * - Devuelve la URL de descarga para guardarla en Firestore.
 */
export async function uploadVerificationIdImage(userId: string, file: File): Promise<string> {
  if (file.size > MAX_ID_DOC_SIZE_MB * 1024 * 1024) {
    throw new Error(`El archivo no debe superar ${MAX_ID_DOC_SIZE_MB} MB`);
  }
  if (!ALLOWED_VERIFICATION_ID_TYPES.includes(file.type as (typeof ALLOWED_VERIFICATION_ID_TYPES)[number])) {
    throw new Error("Formato no v?lido. Usa JPG o PNG.");
  }

  const storage = getFirebaseStorage();
  if (!storage) throw new Error("Firebase Storage no est? configurado. Revisa las variables VITE_FIREBASE_*.");

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png"].includes(ext) ? ext : "jpg";
  const path = `verification_ids/${userId}/${crypto.randomUUID()}_${Date.now()}.${safeExt}`;
  const storageRef = ref(storage, path);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
    task.on(
      "state_changed",
      () => {},
      (err) => reject(err),
      () => resolve()
    );
  });

  return getDownloadURL(storageRef);
}

/**
 * Sube documento que avala la profesi?n (PDF o imagen).
 * - Storage path: `professional_credentials/{userId}/{uuid}_{timestamp}.{ext}`
 * - Las reglas de Firebase Storage deben permitir `application/pdf` en esa ruta (ver `storage.rules` en la ra?z del repo).
 */
export async function uploadProfessionalCredential(userId: string, file: File): Promise<string> {
  const maxMb = 12;
  const allowed = ["application/pdf", "image/jpeg", "image/png"] as const;
  if (file.size > maxMb * 1024 * 1024) {
    throw new Error(`El archivo no debe superar ${maxMb} MB`);
  }
  if (!allowed.includes(file.type as (typeof allowed)[number])) {
    throw new Error("Formato no v?lido. Usa JPG, PNG o PDF.");
  }
  const storage = getFirebaseStorage();
  if (!storage) throw new Error("Firebase Storage no est? configurado. Revisa las variables VITE_FIREBASE_*.");

  const ext = file.name.split(".").pop()?.toLowerCase() || (file.type === "application/pdf" ? "pdf" : "jpg");
  const safeExt = ["pdf", "jpg", "jpeg", "png"].includes(ext) ? ext : "pdf";
  const path = `professional_credentials/${userId}/${crypto.randomUUID()}_${Date.now()}.${safeExt}`;
  const storageRef = ref(storage, path);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
    task.on("state_changed", () => {}, (err) => reject(err), () => resolve());
  });

  return getDownloadURL(storageRef);
}

export async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;

  if (messagingPromise) return messagingPromise;

  messagingPromise = (async () => {
    try {
      if (!(await isSupported())) {
        return null;
      }
      const app = getFirebaseApp();
      if (!app) return null;
      return getMessaging(app);
    } catch {
      return null;
    }
  })();

  return messagingPromise;
}

