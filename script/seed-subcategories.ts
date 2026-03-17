/**
 * Seeder de subcategorías por defecto.
 * Crea en Firestore las subcategorías definidas en shared/default-subcategories.
 * Cada subcategoría tiene un campo categoryId que referencia a la categoría a la que pertenece.
 * Ejecutar: npm run seed:subcategories
 * Requiere que las categorías existan (ejecutar antes npm run seed:categories).
 */
import "dotenv/config";
import { getFirestore, initializeFirebase, FIRESTORE_COLLECTIONS } from "../server/firebase-admin";
import { DEFAULT_SUBCATEGORIES } from "../shared/default-subcategories";

const COUNTERS_DOC = "_counters";

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

  const categoriesColl = db.collection(FIRESTORE_COLLECTIONS.CATEGORIES);
  const subCategoriesColl = db.collection(FIRESTORE_COLLECTIONS.SUB_CATEGORIES);

  // Resolver slug de categoría → id
  const categoriesSnap = await categoriesColl.get();
  const categoryIdBySlug = new Map<string, number>();
  categoriesSnap.docs.forEach((doc) => {
    const data = doc.data();
    const id = typeof data?.id === "number" ? data.id : parseInt(String(doc.id), 10);
    const slug = (data?.slug as string) ?? "";
    if (slug && !Number.isNaN(id)) categoryIdBySlug.set(slug, id);
  });

  // Obtener siguiente ID para sub_categories (contador o max existente)
  let nextId = 1;
  const subSnap = await subCategoriesColl.get();
  subSnap.docs.forEach((doc) => {
    const id = typeof doc.data()?.id === "number" ? doc.data().id : parseInt(doc.id, 10);
    if (!Number.isNaN(id)) nextId = Math.max(nextId, id + 1);
  });

  const existingBySlug = new Set(
    subSnap.docs.map((d) => (d.data()?.slug as string) ?? "").filter(Boolean)
  );

  let created = 0;
  for (const sub of DEFAULT_SUBCATEGORIES) {
    if (existingBySlug.has(sub.slug)) {
      console.log("  —", sub.slug, "(ya existe)");
      continue;
    }

    const categoryId = categoryIdBySlug.get(sub.categorySlug);
    if (categoryId == null) {
      console.warn("  ⚠ Categoría con slug '%s' no encontrada. Ejecuta npm run seed:categories. Omitiendo subcategoría '%s'.", sub.categorySlug, sub.slug);
      continue;
    }

    const id = nextId++;
    await subCategoriesColl.doc(String(id)).set({
      id,
      name: sub.name,
      slug: sub.slug,
      categoria: categoryId,
      categoryId,
      categorySlug: sub.categorySlug,
      icon: sub.icon ?? null,
    });
    console.log("  ✓", sub.slug, "→ id", id, "(categoría id", categoryId, ")");
    created++;
  }

  console.log("\n✅ Subcategorías listas. Creadas:", created);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
