/**
 * Seeder de subcategorías por defecto.
 * Crea en Firestore las subcategorías de shared/default-subcategories.
 * Siempre asocia al padre canónico (Man Go = `technical`; nunca recrea bajo `maintenance`).
 * Repara documentos legacy que sigan con categorySlug/categoryId de `maintenance`.
 *
 * Ejecutar: npm run seed:subcategories
 * Requiere categorías base: npm run seed:categories
 */
import "dotenv/config";
import { getFirestore, initializeFirebase, FIRESTORE_COLLECTIONS } from "../server/firebase-admin";
import {
  DEFAULT_SUBCATEGORIES,
  getSubcategoryParentCategorySlug,
} from "../shared/default-subcategories";
import {
  isRetiredProviderCategorySlug,
  MAN_GO_CATEGORY_SLUG,
} from "../shared/default-categories";

type ExistingSub = { data: Record<string, unknown>; docId: string };

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

  const categoriesSnap = await categoriesColl.get();
  const categoryIdBySlug = new Map<string, number>();
  categoriesSnap.docs.forEach((doc) => {
    const data = doc.data();
    const id = typeof data?.id === "number" ? data.id : parseInt(String(doc.id), 10);
    const slug = String(data?.slug ?? "").trim().toLowerCase();
    if (slug && !Number.isNaN(id)) categoryIdBySlug.set(slug, id);
  });

  const maintenanceCategoryId = categoryIdBySlug.get("maintenance");
  const technicalCategoryId = categoryIdBySlug.get(MAN_GO_CATEGORY_SLUG);
  if (maintenanceCategoryId != null) {
    console.log(
      "  ℹ Documento legacy categories/maintenance (id %s). El catálogo enlaza solo a '%s' (id %s).",
      maintenanceCategoryId,
      MAN_GO_CATEGORY_SLUG,
      technicalCategoryId ?? "?",
    );
  }

  let nextId = 1;
  const subSnap = await subCategoriesColl.get();
  subSnap.docs.forEach((doc) => {
    const id = typeof doc.data()?.id === "number" ? doc.data().id : parseInt(doc.id, 10);
    if (!Number.isNaN(id)) nextId = Math.max(nextId, id + 1);
  });

  const existingBySlug = new Map<string, ExistingSub>();
  subSnap.docs.forEach((d) => {
    const slug = String(d.data()?.slug ?? "").trim();
    if (slug) existingBySlug.set(slug, { data: d.data() as Record<string, unknown>, docId: d.id });
  });

  let created = 0;
  let repaired = 0;

  for (const sub of DEFAULT_SUBCATEGORIES) {
    const parentSlug = getSubcategoryParentCategorySlug(sub.categorySlug);
    if (isRetiredProviderCategorySlug(sub.categorySlug) && parentSlug !== MAN_GO_CATEGORY_SLUG) {
      console.log("  —", sub.slug, `(categoría padre retirada '${sub.categorySlug}', omitida)`);
      continue;
    }

    const categoryId = categoryIdBySlug.get(parentSlug);
    if (categoryId == null) {
      console.warn(
        "  ⚠ Categoría '%s' no encontrada. Ejecuta npm run seed:categories. Omitiendo '%s'.",
        parentSlug,
        sub.slug,
      );
      continue;
    }

    const existing = existingBySlug.get(sub.slug);
    if (existing) {
      const currentId = Number(existing.data.categoryId ?? existing.data.categoria);
      const currentSlug = String(existing.data.categorySlug ?? "").trim().toLowerCase();
      const underMaintenance =
        currentSlug === "maintenance" ||
        (maintenanceCategoryId != null && currentId === maintenanceCategoryId);
      const wrongParent = underMaintenance || currentId !== categoryId || currentSlug !== parentSlug;

      if (wrongParent) {
        await subCategoriesColl.doc(existing.docId).update({
          categoryId,
          categoria: categoryId,
          categorySlug: parentSlug,
        });
        console.log("  ↻", sub.slug, "→ categoría", parentSlug, "(id", categoryId, ")");
        repaired++;
      } else {
        console.log("  —", sub.slug, "(ya existe, padre correcto)");
      }
      continue;
    }

    const id = nextId++;
    await subCategoriesColl.doc(String(id)).set({
      id,
      name: sub.name,
      slug: sub.slug,
      categoria: categoryId,
      categoryId,
      categorySlug: parentSlug,
      icon: sub.icon ?? null,
    });
    console.log("  ✓", sub.slug, "→ id", id, "(categoría", parentSlug, "id", categoryId, ")");
    created++;
  }

  console.log("\n✅ Subcategorías listas. Creadas:", created, "· Reparadas:", repaired);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
