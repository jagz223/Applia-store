/**
 * Migración: asigna categoryId a cada proveedor según su category (string).
 * Busca en la colección categories un documento con slug = provider.category y asigna su id a provider.categoryId.
 * Ejecutar después de seed:categories. Comando: npm run migrate:provider-categories
 */
import "dotenv/config";
import { initializeFirebase, getFirestore, FIRESTORE_COLLECTIONS } from "../server/firebase-admin";

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
  const slugToId = new Map<string, number>();
  categoriesSnap.docs.forEach((doc) => {
    const data = doc.data();
    const slug = (data.slug as string) ?? "";
    const id = typeof doc.id === "string" && /^\d+$/.test(doc.id) ? parseInt(doc.id, 10) : (data.id as number);
    if (slug && !Number.isNaN(id)) slugToId.set(slug.trim(), id);
  });

  const providersSnap = await db.collection(FIRESTORE_COLLECTIONS.PROVIDERS).get();
  let updated = 0;
  for (const doc of providersSnap.docs) {
    const data = doc.data();
    const category = (data.category as string)?.trim();
    if (!category) continue;
    const categoryId = slugToId.get(category);
    if (categoryId == null) {
      console.log("  — provider", doc.id, "category", category, "sin categoría en BD, omitido");
      continue;
    }
    const currentId = data.categoryId;
    if (currentId === categoryId) continue;
    await doc.ref.update({ categoryId });
    console.log("  ✓ provider", doc.id, "category", category, "→ categoryId", categoryId);
    updated++;
  }

  console.log("\n✅ Migración lista. Proveedores actualizados:", updated);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
