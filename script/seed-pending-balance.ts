/**
 * Inicializa pendingBalance en 0 para todos los usuarios que no lo tengan.
 * Ejecutar desde la raíz: npm run seed:pending-balance
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
    const data = doc.data() as { pendingBalance?: number };
    if (typeof data.pendingBalance !== "number") {
      await doc.ref.update({
        pendingBalance: 0,
        updatedAt: new Date(),
      });
      updated++;
      console.log("  ✓", doc.id, "→ pendingBalance: 0");
    }
  }

  console.log("\n✅ Seed pending balance completado. Usuarios actualizados:", updated);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
