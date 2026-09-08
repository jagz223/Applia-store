/**
 * Crea en Firestore las colecciones necesarias para la tienda (doc inicial `_seed`).
 * Ejecutar: npm run seed:firestore
 * Requiere .env con FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
 */

import "dotenv/config";
import admin from "firebase-admin";
import { initializeFirebase, getFirestore, FIRESTORE_COLLECTIONS } from "../server/firebase-admin";

/** Solo colecciones usadas por la tienda / auth / notificaciones / pagos de tienda. */
const STORE_SEED_COLLECTIONS = [
  FIRESTORE_COLLECTIONS.USERS,
  FIRESTORE_COLLECTIONS.USER_ROLES,
  FIRESTORE_COLLECTIONS.ROLES,
  FIRESTORE_COLLECTIONS.NOTIFICATIONS,
  FIRESTORE_COLLECTIONS.USER_DEVICE_TOKENS,
  FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS,
  FIRESTORE_COLLECTIONS.ACCOUNT_CHANGE_REQUESTS,
  FIRESTORE_COLLECTIONS.ADMIN_AUDIT_LOG,
  FIRESTORE_COLLECTIONS._COUNTERS,
  FIRESTORE_COLLECTIONS.CONVERSATIONS,
  FIRESTORE_COLLECTIONS.MESSAGES,
  FIRESTORE_COLLECTIONS.DOCUMENTS,
  FIRESTORE_COLLECTIONS.PAYMENTS,
  FIRESTORE_COLLECTIONS.INVOICES,
  FIRESTORE_COLLECTIONS.WALLET_TRANSFERS,
  FIRESTORE_COLLECTIONS.WITHDRAWAL_REJECTIONS,
  FIRESTORE_COLLECTIONS.STORES,
  FIRESTORE_COLLECTIONS.STORE_PRODUCTS,
  FIRESTORE_COLLECTIONS.STORE_CATEGORIES,
  FIRESTORE_COLLECTIONS.STORE_SUBCATEGORIES,
  FIRESTORE_COLLECTIONS.STORE_PROMOTIONS,
  FIRESTORE_COLLECTIONS.STORE_CARTS,
  FIRESTORE_COLLECTIONS.STORE_PAYMENT_METHODS,
  FIRESTORE_COLLECTIONS.STORE_ORDERS,
  FIRESTORE_COLLECTIONS.STORE_PENDING_CHECKOUTS,
  FIRESTORE_COLLECTIONS.STORE_STAFF,
  FIRESTORE_COLLECTIONS.INGREDIENTS_MATERIALS,
  FIRESTORE_COLLECTIONS.STORE_SHOWCASE_BANNERS,
  FIRESTORE_COLLECTIONS.STORE_SHOWCASE_POPUPS,
] as const;

async function main() {
  const ok = initializeFirebase();
  if (!ok) {
    console.error("Firebase no está configurado. Revisa el .env.");
    process.exit(1);
  }

  const db = getFirestore();
  if (!db) {
    console.error("No se pudo obtener la instancia de Firestore.");
    process.exit(1);
  }

  const seedDoc = {
    _seed: true,
    _createdAt: admin.firestore.FieldValue.serverTimestamp(),
    _note: "Documento inicial para crear la colección. Se puede eliminar.",
  };

  console.log("Seed Firestore (tienda):", STORE_SEED_COLLECTIONS.length, "colecciones\n");

  for (const name of STORE_SEED_COLLECTIONS) {
    try {
      await db.collection(name).doc("_seed").set(seedDoc);
      console.log("  ✓", name);
    } catch (err) {
      console.error("  ✗", name, err);
    }
  }

  console.log("\n✅ Colecciones de tienda creadas en Firestore.");
  console.log("Siguiente: npm run seed:roles && npm run seed:users");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
