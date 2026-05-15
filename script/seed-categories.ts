/**
 * Seeder de categorías por defecto (unificado: servicios y proveedores).
 * Crea en Firestore las categorías de shared/default-categories si no existen (por slug).
 * No crea slugs retirados (p. ej. `maintenance`; Man Go unificado en `technical`).
 * Ejecutar: npm run seed:categories
 * Subcategorías: npm run seed:subcategories
 */
import "dotenv/config";
import { initializeFirebase, getFirestore, FIRESTORE_COLLECTIONS } from "../server/firebase-admin";
import { DEFAULT_CATEGORIES, isRetiredProviderCategorySlug } from "../shared/default-categories";

async function main() {
  const ok = initializeFirebase();
  if (!ok) {
    console.error("Firebase no está configurado. Revisa el .env.");
    process.exit(1);
  }

  const db = getFirestore();
  if (!db) {
    console.error("No se pudo obtener Firestore.");
    process.exit(1);
  }

  const coll = db.collection(FIRESTORE_COLLECTIONS.CATEGORIES);
  const snapshot = await coll.get();
  const existingBySlug = new Map<string, { id: number }>();
  let maxId = 0;
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const id =
      typeof doc.id === "string" && /^\d+$/.test(doc.id) ? parseInt(doc.id, 10) : Number(data?.id);
    if (!Number.isNaN(id)) maxId = Math.max(maxId, id);
    const slug = (data?.slug as string) ?? "";
    if (slug) existingBySlug.set(slug, { id });
  });

  let created = 0;
  for (const cat of DEFAULT_CATEGORIES) {
    if (isRetiredProviderCategorySlug(cat.slug)) {
      console.log("  —", cat.slug, "(retirada, no se crea)");
      continue;
    }
    if (existingBySlug.has(cat.slug)) {
      console.log("  —", cat.slug, "(ya existe)");
      continue;
    }
    maxId += 1;
    const docRef = coll.doc(String(maxId));
    await docRef.set({
      id: maxId,
      name: cat.name,
      slug: cat.slug,
      type: cat.type,
      icon: cat.icon,
      imageUrl: cat.imageUrl ?? null,
    });
    console.log("  ✓", cat.slug, "→ id", maxId);
    created++;
  }

  const maintenanceLegacy = existingBySlug.has("maintenance");
  if (maintenanceLegacy) {
    console.log(
      "\n  ℹ Existe documento legacy slug=maintenance en Firestore. No se borra ni se usa en seed.",
      "Subcategorías y proveedores deben apuntar a technical (npm run migrate:subcategories / migrate:provider-categories).",
    );
  }

  console.log("\n✅ Categorías listas. Creadas:", created);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
