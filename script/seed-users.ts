/**
 * Crea un usuario de prueba por cada rol (admin, professional, client).
 * Contraseña: 12345678
 * Email: <rol>@test.com | Nombre: <nombre del rol> | Teléfono: +58 414 9999999
 * Ejecutar desde la raíz: npm run seed:users
 * Requiere .env con credenciales de Firebase.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { initializeFirebase } from "../server/firebase-admin";
import { getFirestoreStorage } from "../server/storage-firestore";

const PASSWORD_PLAIN = "12345678";
const PHONE = "+58 414 9999999";

const ROLES: { code: string; name: string }[] = [
  { code: "admin", name: "Admin" },
  { code: "professional", name: "Professional" },
  { code: "client", name: "Client" },
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

  for (const { code, name } of ROLES) {
    const email = `${code}@test.com`;
    const existing = await storage.getUserByEmail(email);
    if (existing) {
      console.log(`  ⏭ Usuario ${email} ya existe, se omite.`);
      continue;
    }
    await storage.createUser({
      email,
      password: hashedPassword,
      name,
      lastName: "Usuario",
      phone: PHONE,
      role: code,
    });
    console.log(`  ✓ Creado: ${email} (rol: ${code})`);
  }

  console.log("\n✅ Seed de usuarios completado. Contraseña para todos: " + PASSWORD_PLAIN);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
