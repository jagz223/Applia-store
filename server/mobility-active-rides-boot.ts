/**
 * Arranca viajes Go activos desde Firestore (taxi + delivery).
 */

export async function bootstrapActiveMobilityRidesFromFirestore(): Promise<void> {
  const { isFirebaseConfigured } = await import("./firebase-admin");
  if (!isFirebaseConfigured()) return;

  try {
    const [{ hydrateTaxiMobilityRidesFromFirestore }, { hydratePackMobilityRidesFromFirestore }] =
      await Promise.all([import("./mobility-rides"), import("./pack-rides")]);
    const [taxiCount, packCount] = await Promise.all([
      hydrateTaxiMobilityRidesFromFirestore(),
      hydratePackMobilityRidesFromFirestore(),
    ]);
    if (taxiCount > 0 || packCount > 0) {
      console.log(
        `[mobility-active] Viajes activos restaurados desde Firestore: ${taxiCount} taxi, ${packCount} delivery`,
      );
      const { getIO } = await import("./socket");
      const { scheduleReconcileSearchingClassicRides } = await import("./go-driver-classic-offer-reconcile");
      const io = getIO();
      if (io) scheduleReconcileSearchingClassicRides(io);
    }
  } catch (e) {
    console.error("[mobility-active] bootstrap failed", e);
  }
}
