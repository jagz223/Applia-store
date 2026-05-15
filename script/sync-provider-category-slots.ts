/**
 * Repara proveedores con categoría principal sobrescrita (p. ej. delivery) cuando tienen
 * fichas Man Go / Pro Go: reconstruye categoryId + secondCategoryId + thirdCategoryId desde services.
 *
 * Ejecutar: npm run sync:provider-category-slots
 */
import "dotenv/config";
import { initializeFirebase, getFirestore, FIRESTORE_COLLECTIONS } from "../server/firebase-admin";
import { buildSyncProviderSlotsFromServiceCategoryIds } from "../shared/provider-category-membership";

async function main() {
  const ok = initializeFirebase();
  if (!ok) {
    console.error("Firebase no configurado.");
    process.exit(1);
  }
  const db = getFirestore();
  if (!db) process.exit(1);

  const categoriesSnap = await db.collection(FIRESTORE_COLLECTIONS.CATEGORIES).get();
  const categories = categoriesSnap.docs.map((d) => ({ id: d.data().id ?? parseInt(d.id, 10), slug: d.data().slug }));

  const servicesSnap = await db.collection(FIRESTORE_COLLECTIONS.SERVICES).get();
  const byProvider = new Map<number, number[]>();
  servicesSnap.docs.forEach((doc) => {
    const d = doc.data();
    const pid = Number(d.providerId);
    const cid = Number(d.categoryId);
    if (!Number.isFinite(pid) || !Number.isFinite(cid)) return;
    const arr = byProvider.get(pid) ?? [];
    arr.push(cid);
    byProvider.set(pid, arr);
  });

  const providersSnap = await db.collection(FIRESTORE_COLLECTIONS.PROVIDERS).get();
  let updated = 0;

  for (const doc of providersSnap.docs) {
    const data = doc.data();
    const pid = parseInt(doc.id, 10);
    const serviceIds = byProvider.get(pid) ?? [];
    if (serviceIds.length === 0) continue;

    const patch = buildSyncProviderSlotsFromServiceCategoryIds(
      {
        categoryId: data.categoryId,
        category: data.category,
        secondCategoryId: data.secondCategoryId,
        thirdCategoryId: data.thirdCategoryId,
      },
      serviceIds,
      categories,
    );

    if (!patch || Object.keys(patch).length === 0) continue;

    await doc.ref.update(patch);
    console.log("  ✓ provider", pid, JSON.stringify(patch));
    updated++;
  }

  console.log("\n✅ Proveedores actualizados:", updated);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
