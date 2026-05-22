import { getIO } from "./socket";
import { notificationService } from "./services/notification.service";
import { genFebStorage } from "./storage-genfeb";
import {
  CENTRAL_SETUP_PATH,
  NOTIFICATION_TYPE_ROLE_CHANGED,
  roleLabelEs,
} from "@shared/role-change-notification";
import { isCentralRole, normalizeRoleCode } from "@shared/roles";

export async function applyRoleChangeSideEffects(
  userId: string,
  previousRole: string | undefined,
  newRole: string,
): Promise<void> {
  const prev = normalizeRoleCode(previousRole) ?? String(previousRole ?? "").trim();
  const next = normalizeRoleCode(newRole) ?? newRole.trim();
  if (!next || prev === next) return;

  const patch: Record<string, unknown> = {};

  if (isCentralRole(next)) {
    patch.dispatchCompanyId = null;
    patch.pendingCentralSetup = true;
  } else {
    patch.pendingCentralSetup = false;
    if (isCentralRole(prev)) {
      patch.dispatchCompanyId = null;
    }
  }

  if (normalizeRoleCode(next) === "professional" && normalizeRoleCode(prev) !== "professional") {
    patch.acceptedProviderTermsOfUse = false;
  }

  if (Object.keys(patch).length > 0) {
    await genFebStorage.updateUser(userId, patch as Record<string, unknown>);
  }

  await notifyUserRoleChanged(userId, prev, next);
}

export async function notifyUserRoleChanged(
  userId: string,
  previousRole: string,
  newRole: string,
): Promise<void> {
  const prevLabel = roleLabelEs(previousRole || "—");
  const newLabel = roleLabelEs(newRole);
  const title = "Tu rol en GenFeb cambió";
  let bodyText = `Tu rol pasó de «${prevLabel}» a «${newLabel}».`;
  let url = "/settings";

  if (isCentralRole(newRole)) {
    bodyText =
      "Ahora eres usuario Central. Asigna el nombre de tu central para activar el panel (debe ser único).";
    url = CENTRAL_SETUP_PATH;
  }

  const notifData = {
    previousRole,
    newRole,
    url,
    message: bodyText,
    title,
  };

  const created = await genFebStorage.createNotification({
    userId,
    type: NOTIFICATION_TYPE_ROLE_CHANGED,
    data: notifData,
  });

  const io = getIO();
  if (io) {
    io.to(`user:${userId}`).emit("notification", {
      id: (created as { id?: unknown })?.id,
      type: NOTIFICATION_TYPE_ROLE_CHANGED,
      title,
      body: bodyText,
      data: notifData,
    });
  }

  void notificationService
    .sendPushToUser(userId, { title, body: bodyText, data: { url } })
    .catch((err) => console.error("[push-role-changed]", err));
}
