/**
 * Crea todas las colecciones de Firestore con un documento inicial (_seed).
 * Ejecutar desde la raíz del proyecto: npm run seed:firestore
 * Requiere .env con FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
 */

import "dotenv/config";
import admin from "firebase-admin";
import { initializeFirebase, getFirestore, FIRESTORE_COLLECTIONS } from "../server/firebase-admin";

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

  const collections = Object.values(FIRESTORE_COLLECTIONS);
  const seedDoc = {
    _seed: true,
    _createdAt: admin.firestore.FieldValue.serverTimestamp(),
    _note: "Documento inicial para crear la colección. Se puede eliminar.",
  };

  for (const name of collections) {
    try {
      await db.collection(name).doc("_seed").set(seedDoc);
      console.log("  ✓", name);
    } catch (err) {
      console.error("  ✗", name, err);
    }
  }

  console.log("\n✅ Colecciones creadas en Firestore.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
