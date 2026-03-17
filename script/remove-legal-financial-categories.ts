/**
 * Elimina de la colección Firestore "categories" los documentos con slug "legal" o "financial".
 * Esas entradas son subcategorías (están en sub_categories), no categorías de nivel superior.
 * Ejecutar: npm run remove:legal-financial-categories
 */
import "dotenv/config";
import { initializeFirebase, getFirestore, FIRESTORE_COLLECTIONS } from "../server/firebase-admin";

const SLUGS_TO_REMOVE = ["legal", "financial"] as const;

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
  let removed = 0;

  for (const slug of SLUGS_TO_REMOVE) {
    const snapshot = await coll.where("slug", "==", slug).get();
    for (const doc of snapshot.docs) {
      await doc.ref.delete();
      const data = doc.data();
      console.log("  ✓ Eliminado:", data?.name ?? slug, "(id", doc.id, ", slug:", slug, ")");
      removed++;
    }
  }

  console.log("\n✅ Listo. Documentos eliminados de categories:", removed);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
