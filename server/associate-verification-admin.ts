import {
  isAssociateOnboardingAdminQueueReady,
  type PrefundPromoProviderSlice,
  type ProfessionalVerification,
  type VerifyingStatus,
} from "@shared/professional-verification";

type MinimalStorage = {
  getPendingVerifyingStatuses(): Promise<Array<{ user?: string }>>;
  getProfessionalVerificationByUserId(userId: string): Promise<unknown>;
  getProviderByUserId(userId: string): Promise<unknown>;
};

/**
 * Cuenta solicitudes que el admin debe atender: renovaciones, onboarding listo para cola,
 * o asociados con mes(es) gratis por código que aún deben completar documentación (prefund).
 */
export async function countVerificationsAwaitingAdminReview(storage: MinimalStorage): Promise<number> {
  const pending = await storage.getPendingVerifyingStatuses();
  let n = 0;
  for (const st of pending) {
    const userId = String((st as { user?: string }).user ?? "").trim();
    if (!userId) continue;
    const provider = (await storage.getProviderByUserId(userId)) as { isVerified?: boolean } | null;
    if (provider?.isVerified) {
      n++;
      continue;
    }
    const prof = await storage.getProfessionalVerificationByUserId(userId);
    const vst = st as VerifyingStatus;
    if (
      vst.prefundPromoAwaitingDossier === true ||
      isAssociateOnboardingAdminQueueReady(prof as ProfessionalVerification | null, provider as PrefundPromoProviderSlice | null)
    ) {
      n++;
    }
  }
  return n;
}
