/**
 * Establece wallet = 1000 para todos los usuarios.
 * Ejecutar desde la raíz: npm run seed:wallet-balance
 * Requiere .env con credenciales de Firebase.
 */

import "dotenv/config";
import { initializeFirebase, getFirestore, FIRESTORE_COLLECTIONS } from "../server/firebase-admin";

const INITIAL_BALANCE = 1000;

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

  for (const doc of snapshot.docs) {
    await doc.ref.update({
      wallet: INITIAL_BALANCE,
      updatedAt: new Date(),
    });
    console.log("  ✓", doc.id, "wallet =", INITIAL_BALANCE);
  }

  console.log("\n✅ Seed wallet balance completado. Usuarios actualizados:", snapshot.size);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
