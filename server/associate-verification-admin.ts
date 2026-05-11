import {
  isAssociateOnboardingDossierComplete,
  type ProfessionalVerification,
} from "@shared/professional-verification";

type MinimalStorage = {
  getPendingVerifyingStatuses(): Promise<Array<{ user?: string }>>;
  getProfessionalVerificationByUserId(userId: string): Promise<unknown>;
  getProviderByUserId(userId: string): Promise<unknown>;
};

/**
 * Cuenta solicitudes que el admin debe atender: renovaciones (solo pago) o onboarding con los 3 requisitos completos.
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
    if (isAssociateOnboardingDossierComplete(prof as ProfessionalVerification | null)) {
      n++;
    }
  }
  return n;
}
