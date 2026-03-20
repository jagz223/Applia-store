/**
 * Usuarios iniciales de GenFeb (Firestore).
 * - Elimina los usuarios de prueba antiguos del seed anterior (admin|professional|client)@test.com
 * - Crea o actualiza los correos corporativos con roles admin / tiSupport (Soporte TI)
 *
 * Contraseña para todos: 12345678
 * Ejecutar desde la raíz: npm run seed:users
 * Requiere .env con credenciales de Firebase.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { initializeFirebase, getFirestore, FIRESTORE_COLLECTIONS } from "../server/firebase-admin";
import { getFirestoreStorage } from "../server/storage-firestore";

const PASSWORD_PLAIN = "12345678";
const PHONE = "+58 414 9999999";

/** Usuarios que generaba el seeder anterior; se borran si existen. */
const LEGACY_TEST_EMAILS = ["admin@test.com", "professional@test.com", "client@test.com"] as const;

const SEED_USERS: {
  email: string;
  role: "admin" | "tiSupport";
  name: string;
  lastName: string;
}[] = [
  { email: "rrhh@genfeb.com", role: "admin", name: "RRHH", lastName: "GenFeb" },
  { email: "thebiglion2528@gmail.com", role: "admin", name: "Usuario", lastName: "Admin" },
  { email: "gerencia@genfeb.com", role: "admin", name: "Gerencia", lastName: "GenFeb" },
  { email: "jesusagz223@gmail.com", role: "admin", name: "Jesús", lastName: "AGZ" },
  { email: "maycolcalero@genfeb.com", role: "tiSupport", name: "Maycol", lastName: "Calero" },
];

async function removeLegacyTestUsers(storage: ReturnType<typeof getFirestoreStorage>): Promise<void> {
  const db = getFirestore();
  for (const email of LEGACY_TEST_EMAILS) {
    const existing = await storage.getUserByEmail(email);
    if (!existing?.id) continue;
    if (db) {
      await db.collection(FIRESTORE_COLLECTIONS.USERS).doc(existing.id).delete();
      console.log(`  🗑 Eliminado (seed antiguo): ${email}`);
    } else {
      console.log(`  ⚠ No se pudo eliminar ${email} (Firestore no disponible)`);
    }
  }
}

async function main() {
  const ok = initializeFirebase();
  if (!ok) {
    console.error("Firebase no está configurado. Revisa el .env (FIREBASE_PROJECT_ID, etc.).");
    process.exit(1);
  }

  const storage = getFirestoreStorage();
  await storage.seedRoles();

  await removeLegacyTestUsers(storage);

  const hashedPassword = await bcrypt.hash(PASSWORD_PLAIN, 10);

  for (const { email, role, name, lastName } of SEED_USERS) {
    const existing = await storage.getUserByEmail(email);
    if (existing) {
      await storage.updateUser(existing.id, { name, lastName, role });
      await storage.updateUserPassword(existing.id, hashedPassword);
      console.log(`  ✓ Actualizado: ${email} (rol: ${role})`);
    } else {
      await storage.createUser({
        email,
        password: hashedPassword,
        name,
        lastName,
        phone: PHONE,
        role,
      });
      console.log(`  ✓ Creado: ${email} (rol: ${role})`);
    }
  }

  console.log("\n✅ Seed de usuarios completado. Contraseña para todos: " + PASSWORD_PLAIN);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
