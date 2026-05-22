/**
 * Notifica a administradores full una petición pendiente de cambio de cuenta (correo, nombre, teléfono o vehículo).
 * Persistencia + socket en tiempo real + push FCM (best-effort).
 */
import { getFullAdminUsers } from "./staff-users";
import { getIO, sendNotificationToAdmins } from "./socket";
import { notificationService } from "./services/notification.service";
import { genFebStorage } from "./storage-genfeb";

const ADMIN_OVERVIEW_URL = "/admin?tab=overview";

export type PendingAccountChangeNotifyField = "email" | "name" | "phone" | "vehicle" | "recovery_questions";

function fieldLabelEs(field: PendingAccountChangeNotifyField): string {
  switch (field) {
    case "email":
      return "correo";
    case "name":
      return "nombre";
    case "phone":
      return "teléfono";
    case "vehicle":
      return "vehículo (taxi / delivery / marketplace)";
    case "recovery_questions":
      return "preguntas de recuperación de contraseña";
    default:
      return field;
  }
}

function applicantDisplayName(user: Record<string, unknown> | null | undefined, fallbackUserId: string): string {
  if (!user) return fallbackUserId;
  const fromParts = [user.firstName, user.lastName]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  const fromName = String(user.name ?? "").trim();
  const fromEmail = String(user.email ?? "").trim();
  return fromParts || fromName || fromEmail || fallbackUserId;
}

export async function notifyFullAdminsPendingAccountChangeRequest(args: {
  requestId: number;
  applicantUserId: string;
  /** Fila de usuario (p. ej. getUserById); opcional si ya conoces el nombre. */
  applicantUser?: Record<string, unknown> | null;
  applicantDisplayName?: string;
  field: PendingAccountChangeNotifyField;
}): Promise<void> {
  const { requestId, applicantUserId, applicantUser, field } = args;
  const display =
    (args.applicantDisplayName != null && String(args.applicantDisplayName).trim()) ||
    applicantDisplayName(applicantUser, applicantUserId);
  const label = fieldLabelEs(field);
  const message = `${display} solicita revisar un cambio de ${label}.`;

  try {
    const admins = await getFullAdminUsers(genFebStorage);
    for (const admin of admins ?? []) {
      const adminId = String((admin as { id?: string }).id ?? "").trim();
      if (!adminId) continue;
      await genFebStorage.createNotification({
        userId: adminId,
        type: "admin",
        data: {
          type: "pending_account_change_request",
          requestId,
          field,
          applicantUserId,
          applicantDisplayName: display,
          message,
          url: ADMIN_OVERVIEW_URL,
        },
      });
    }

    const io = getIO();
    if (io) {
      sendNotificationToAdmins(io, {
        type: "pending_account_change_request",
        message,
        data: {
          requestId,
          field,
          applicantUserId,
          applicantDisplayName: display,
          url: ADMIN_OVERVIEW_URL,
        },
        timestamp: new Date(),
      });
    }

    await Promise.all(
      (admins ?? []).map((admin: { id?: string }) => {
        const adminId = admin?.id;
        if (!adminId) return Promise.resolve();
        return notificationService.sendPushToUser(String(adminId), {
          title: "Nueva petición de asociado",
          body: message,
          data: {
            url: ADMIN_OVERVIEW_URL,
            type: "admin",
            subType: "pending_account_change_request",
            requestId: String(requestId),
            field,
          },
        });
      }),
    ).catch((err) => console.error("[push] admins pending account change:", err));
  } catch (err) {
    console.error("[notify] pending account change request:", err);
  }
}
