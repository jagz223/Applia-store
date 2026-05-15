/**
 * Migración: reasigna subcategorías del catálogo por defecto que sigan bajo `maintenance`
 * (o con categorySlug legacy) al padre canónico Man Go (`technical`).
 *
 * Idempotente. Ejecutar: npm run migrate:subcategories
 */
import "dotenv/config";
import { initializeFirebase, getFirestore, FIRESTORE_COLLECTIONS } from "../server/firebase-admin";
import {
  DEFAULT_SUBCATEGORIES,
  getSubcategoryParentCategorySlug,
} from "../shared/default-subcategories";
import { MAN_GO_CATEGORY_SLUG } from "../shared/default-categories";

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

  const categoriesSnap = await db.collection(FIRESTORE_COLLECTIONS.CATEGORIES).get();
  const categoryIdBySlug = new Map<string, number>();
  categoriesSnap.docs.forEach((doc) => {
    const data = doc.data();
    const id = typeof data?.id === "number" ? data.id : parseInt(String(doc.id), 10);
    const slug = String(data?.slug ?? "").trim().toLowerCase();
    if (slug && !Number.isNaN(id)) categoryIdBySlug.set(slug, id);
  });

  const maintenanceCategoryId = categoryIdBySlug.get("maintenance");
  const defaultSlugs = new Set(DEFAULT_SUBCATEGORIES.map((s) => s.slug));

  const subSnap = await db.collection(FIRESTORE_COLLECTIONS.SUB_CATEGORIES).get();
  let updated = 0;

  for (const doc of subSnap.docs) {
    const data = doc.data();
    const slug = String(data?.slug ?? "").trim();
    if (!slug || !defaultSlugs.has(slug)) continue;

    const def = DEFAULT_SUBCATEGORIES.find((s) => s.slug === slug)!;
    const parentSlug = getSubcategoryParentCategorySlug(def.categorySlug);
    const targetCategoryId = categoryIdBySlug.get(parentSlug);
    if (targetCategoryId == null) {
      console.log("  —", slug, "sin categoría padre", parentSlug, "en BD");
      continue;
    }

    const currentId = Number(data.categoryId ?? data.categoria);
    const currentSlug = String(data.categorySlug ?? "").trim().toLowerCase();
    const underMaintenance =
      currentSlug === "maintenance" ||
      (maintenanceCategoryId != null && currentId === maintenanceCategoryId);

    if (!underMaintenance && currentId === targetCategoryId && currentSlug === parentSlug) continue;

    await doc.ref.update({
      categoryId: targetCategoryId,
      categoria: targetCategoryId,
      categorySlug: parentSlug,
    });
    console.log("  ✓", slug, "→", parentSlug, "(id", targetCategoryId, ")");
    updated++;
  }

  console.log(
    "\n✅ Migración de subcategorías lista. Actualizadas:",
    updated,
    maintenanceCategoryId != null
      ? `(documento legacy maintenance id ${maintenanceCategoryId} sin uso en catálogo)`
      : "",
  );
  if (!categoryIdBySlug.has(MAN_GO_CATEGORY_SLUG)) {
    console.warn("  ⚠ No existe categoría '%s'. Ejecuta npm run seed:categories.", MAN_GO_CATEGORY_SLUG);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
