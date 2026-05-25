/**
 * Migración: quita `marketplace` de `providers.goBrands` en todos los perfiles.
 * Marketplace es categoría propia (coming soon), no marca dentro de Car Go.
 *
 * Comando: npm run migrate:remove-marketplace-go-brands
 */
import "dotenv/config";
import { initializeFirebase, getFirestore, FIRESTORE_COLLECTIONS } from "../server/firebase-admin";
import { sanitizeCarGoBrands } from "../shared/go-brands";

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

  const snap = await db.collection(FIRESTORE_COLLECTIONS.PROVIDERS).get();
  let scanned = 0;
  let updated = 0;
  let alreadyClean = 0;
  let clearedEmpty = 0;

  for (const doc of snap.docs) {
    scanned++;
    const data = doc.data();
    const raw = data.goBrands;
    if (!Array.isArray(raw) || raw.length === 0) {
      alreadyClean++;
      continue;
    }

    const hadMarketplace = raw.some((b) => String(b ?? "").trim().toLowerCase() === "marketplace");
    const next = sanitizeCarGoBrands(raw);
    const unchanged =
      !hadMarketplace &&
      next.length === raw.length &&
      next.every((b, i) => String(raw[i] ?? "").trim().toLowerCase() === b);

    if (unchanged) {
      alreadyClean++;
      continue;
    }

    const patch: Record<string, unknown> = { goBrands: next.length > 0 ? next : null };
    await doc.ref.update(patch);
    updated++;
    if (next.length === 0 && raw.length > 0) clearedEmpty++;
    console.log(
      `  ✓ provider ${doc.id}: [${raw.join(", ")}] → [${next.length ? next.join(", ") : "(vacío)"}]`,
    );
  }

  console.log("\n✅ Migración marketplace / goBrands");
  console.log("   Proveedores revisados:", scanned);
  console.log("   Actualizados:", updated);
  console.log("   Sin cambios:", alreadyClean);
  if (clearedEmpty > 0) {
    console.log("   goBrands quedó vacío (solo tenían marketplace):", clearedEmpty);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
