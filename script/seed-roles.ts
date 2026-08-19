/**
 * Crea o actualiza los roles de sistema (admin, client, employee) en Firestore.
 * Ejecutar desde la raíz: npm run seed:roles
 * Requiere .env con credenciales de Firebase.
 */

import "dotenv/config";
import { initializeFirebase } from "../server/firebase-admin";
import { getFirestoreStorage } from "../server/storage-firestore";

async function main() {
  const ok = initializeFirebase();
  if (!ok) {
    console.error("Firebase no está configurado. Revisa el .env (FIREBASE_PROJECT_ID, etc.).");
    process.exit(1);
  }

  const storage = getFirestoreStorage();
  await storage.seedRoles();
  const roles = await storage.getRoles();
  console.log("Roles en Firestore:", roles.map((r) => r.code).join(", "));
  console.log("✅ Seed de roles completado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
