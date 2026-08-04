import { isVisibilitySubscriptionWindowActive } from "@shared/professional-listing-subscription";
import { appliaStorage } from "./storage-applia";
import { getIO } from "./socket";
import { notificationService } from "./services/notification.service";

/**
 * Marca `providers.isVerified` y envía bienvenida cuando:
 * - identificación aprobada por admin, y
 * - (comprobante de cuota aprobado) o (meses gratis por código con suscripción vigente).
 *
 * Los meses gratis no marcan `transacction_verified`; el cuadro de cuota queda en `visibilitySubscription*`.
 */
export async function maybeVerifyProfessional(userId: string): Promise<void> {
  const st = await appliaStorage.getVerifyingStatusByUserId(userId);
  if (!st) return;

  const provider = await appliaStorage.getProviderByUserId(userId);
  if (!provider) return;

  if ((provider as { isVerified?: boolean }).isVerified === true) return;

  const idOk = st.identification_verified === "verified";
  const txOk = st.transacction_verified === "verified";
  const promoFundedActive =
    String((provider as { visibilitySubscriptionLastPaymentApprovedBy?: string | null }).visibilitySubscriptionLastPaymentApprovedBy ?? "") ===
      "promotional_code" &&
    isVisibilitySubscriptionWindowActive((provider as { visibilitySubscriptionEndsAt?: unknown }).visibilitySubscriptionEndsAt);

  if (!idOk) return;
  if (!txOk && !promoFundedActive) return;

  await appliaStorage.updateProvider((provider as { id: number }).id, { isVerified: true } as any);

  try {
    const msg = "¡Felicidades! Ahora eres un Asociado verificado de Applia. ¡Bienvenido!";
    await appliaStorage.createNotification({
      userId,
      type: "verification_welcome",
      data: { message: msg, url: "/professional-dashboard" },
    });

    const io = getIO();
    if (io) {
      io.to(`user:${userId}`).emit("notification", {
        type: "verification_welcome",
        title: "¡Bienvenido Asociado!",
        body: msg,
        data: { url: "/professional-dashboard" },
      });
    }

    void notificationService
      .sendPushToUser(userId, {
        title: "¡Bienvenido Asociado!",
        body: msg,
        data: { url: "/professional-dashboard" },
      })
      .catch((err) => console.error("[push-welcome] Error:", err));
  } catch (err) {
    console.error("Error notificando bienvenida:", err);
  }
}
