/**
 * Usuarios de prueba Applia (Firestore).
 * Crea o actualiza: admin@test.com, employee@test.com, client@test.com
 *
 * Contraseña para todos: 12345678
 * Ejecutar desde la raíz: npm run seed:users
 * Requiere .env con credenciales de Firebase.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { initializeFirebase } from "../server/firebase-admin";
import { getFirestoreStorage } from "../server/storage-firestore";

const PASSWORD_PLAIN = "12345678";

const SEED_USERS: {
  email: string;
  role: "admin" | "employee" | "client";
  name: string;
  lastName: string;
  phone: string;
}[] = [
  {
    email: "admin@test.com",
    role: "admin",
    name: "Admin",
    lastName: "Test",
    phone: "+58 414 0000001",
  },
  {
    email: "employee@test.com",
    role: "employee",
    name: "Employee",
    lastName: "Test",
    phone: "+58 414 0000002",
  },
  {
    email: "client@test.com",
    role: "client",
    name: "Cliente",
    lastName: "Test",
    phone: "+58 414 0000003",
  },
];

async function main() {
  const ok = initializeFirebase();
  if (!ok) {
    console.error("Firebase no está configurado. Revisa el .env (FIREBASE_PROJECT_ID, etc.).");
    process.exit(1);
  }

  const storage = getFirestoreStorage();
  await storage.seedRoles();

  const hashedPassword = await bcrypt.hash(PASSWORD_PLAIN, 10);

  for (const { email, role, name, lastName, phone } of SEED_USERS) {
    const existing = await storage.getUserByEmail(email);
    if (existing) {
      await storage.updateUser(existing.id, { name, lastName, role, phone });
      await storage.updateUserPassword(existing.id, hashedPassword);
      console.log(`  ✓ Actualizado: ${email} (rol: ${role})`);
    } else {
      await storage.createUser({
        email,
        password: hashedPassword,
        name,
        lastName,
        phone,
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
