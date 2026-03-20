/**
 * Establece rating=5 y ratingCount=0 en todos los usuarios que no tengan calificación.
 * Ejecutar: npm run seed:user-ratings
 * Requiere .env con credenciales de Firebase.
 */

import "dotenv/config";
import { initializeFirebase, getFirestore, FIRESTORE_COLLECTIONS } from "../server/firebase-admin";

async function main() {
  const ok = initializeFirebase();
  if (!ok) {
    console.error("Firebase no está configurado. Revisa el .env (FIREBASE_PROJECT_ID, etc.).");
    process.exit(1);
  }

  const db = getFirestore();
  if (!db) {
    console.error("No se pudo obtener la instancia de Firestore.");
    process.exit(1);
  }

  const usersRef = db.collection(FIRESTORE_COLLECTIONS.USERS);
  const snapshot = await usersRef.get();
  let updated = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() as { rating?: number; ratingCount?: number };
    const updates: Record<string, number | Date> = {};
    if (typeof data.rating !== "number") {
      updates.rating = 5;
    }
    if (typeof data.ratingCount !== "number") {
      updates.ratingCount = 0;
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await doc.ref.update(updates);
      updated++;
      console.log("  ✓", doc.id, updates);
    }
  }

  console.log("\n✅ Seed user ratings completado. Usuarios actualizados:", updated);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
