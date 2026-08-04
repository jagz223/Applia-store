import {
  NOTIFICATION_TYPE_CENTRAL_AFFILIATION,
  NOTIFICATION_TYPE_CENTRAL_AFFILIATION_APPROVED,
  NOTIFICATION_TYPE_CENTRAL_AFFILIATION_REJECTED,
  NOTIFICATION_TYPE_CENTRAL_DATA_ACCESS,
} from "@shared/central-affiliation";
import { getDispatchCompany } from "./dispatch-companies";
import { listCentralOperatorUserIds } from "./central-members";
import { appliaStorage } from "./storage-applia";
import { notificationService } from "./services/notification.service";
import { getIO, sendNotificationToUser } from "./socket";

function displayName(user: Record<string, unknown> | null | undefined, userId: string): string {
  if (!user) return userId;
  const fn = String(user.firstName ?? user.name ?? "").trim();
  const ln = String(user.lastName ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || String(user.email ?? "").trim() || userId;
}

export async function notifyCentralOperatorsNewAffiliation(params: {
  requestId: string;
  companyId: string;
  applicantUserId: string;
}): Promise<void> {
  const user = (await appliaStorage.getUserById(params.applicantUserId)) as Record<string, unknown> | null | undefined;
  const name = displayName(user, params.applicantUserId);
  const company = await getDispatchCompany(params.companyId);
  const companyName = company?.name ?? "Empresa";
  const url = `/central?companyId=${encodeURIComponent(params.companyId)}&affiliationRequest=${encodeURIComponent(params.requestId)}`;
  const data: Record<string, unknown> = {
    requestId: params.requestId,
    dispatchCompanyId: params.companyId,
    companyName,
    applicantUserId: params.applicantUserId,
    applicantName: name,
    url,
  };
  const io = getIO();
  const targets = await listCentralOperatorUserIds(params.companyId);
  for (const uid of targets) {
    await appliaStorage.createNotification({
      userId: uid,
      type: NOTIFICATION_TYPE_CENTRAL_AFFILIATION,
      data,
    });
    void notificationService
      .sendPushToUser(uid, {
        title: "Solicitud de conductor",
        body: `${name} quiere unirse a ${companyName}.`,
        data: { url, type: NOTIFICATION_TYPE_CENTRAL_AFFILIATION, requestId: params.requestId },
      })
      .catch(() => undefined);
    if (io) sendNotificationToUser(io, uid, { type: NOTIFICATION_TYPE_CENTRAL_AFFILIATION, data });
  }
}

export async function notifyApplicantDataAccessRequested(params: {
  applicantUserId: string;
  companyName: string;
  requestId: string;
}): Promise<void> {
  const url = `/professional-dashboard?tab=overview&centralAffiliation=${encodeURIComponent(params.requestId)}`;
  const data: Record<string, unknown> = {
    requestId: params.requestId,
    companyName: params.companyName,
    url,
  };
  await appliaStorage.createNotification({
    userId: params.applicantUserId,
    type: NOTIFICATION_TYPE_CENTRAL_DATA_ACCESS,
    data,
  });
  const io = getIO();
  void notificationService
    .sendPushToUser(params.applicantUserId, {
      title: "Tu central solicita acceso a datos",
      body: `${params.companyName} solicita tu autorización para ver datos adicionales (correo y teléfono).`,
      data: { url, type: NOTIFICATION_TYPE_CENTRAL_DATA_ACCESS, requestId: params.requestId },
    })
    .catch(() => undefined);
  if (io) sendNotificationToUser(io, params.applicantUserId, { type: NOTIFICATION_TYPE_CENTRAL_DATA_ACCESS, data });
}

/** Tras aprobar la solicitud en el panel central: persistencia + socket + push (FCM web/Android/iOS). */
export async function notifyApplicantAffiliationApproved(params: {
  applicantUserId: string;
  companyName: string;
  requestId: string;
}): Promise<void> {
  const url = `/professional-dashboard?tab=overview&centralAffiliation=${encodeURIComponent(params.requestId)}`;
  const data: Record<string, unknown> = {
    requestId: params.requestId,
    companyName: params.companyName,
    url,
  };
  const title = "Afiliación aprobada";
  const body = `${params.companyName} aprobó tu solicitud como conductor en su central. Ya puedes operar bajo su despacho.`;
  await appliaStorage.createNotification({
    userId: params.applicantUserId,
    type: NOTIFICATION_TYPE_CENTRAL_AFFILIATION_APPROVED,
    data: { ...data, message: body },
  });
  const io = getIO();
  if (io) {
    sendNotificationToUser(io, params.applicantUserId, {
      type: NOTIFICATION_TYPE_CENTRAL_AFFILIATION_APPROVED,
      title,
      body,
      data,
    });
  }
  void notificationService
    .sendPushToUser(params.applicantUserId, {
      title,
      body,
      data: {
        url,
        type: NOTIFICATION_TYPE_CENTRAL_AFFILIATION_APPROVED,
        requestId: params.requestId,
      },
    })
    .catch(() => undefined);
}

/** Tras rechazar la solicitud en el panel central. */
export async function notifyApplicantAffiliationRejected(params: {
  applicantUserId: string;
  companyName: string;
  requestId: string;
}): Promise<void> {
  const url = `/professional-dashboard?tab=overview&centralAffiliation=${encodeURIComponent(params.requestId)}`;
  const data: Record<string, unknown> = {
    requestId: params.requestId,
    companyName: params.companyName,
    url,
  };
  const title = "Afiliación no aprobada";
  const body = `${params.companyName} no aprobó tu solicitud de afiliación como conductor. Puedes revisar el estado en tu panel o contactar a la central.`;
  await appliaStorage.createNotification({
    userId: params.applicantUserId,
    type: NOTIFICATION_TYPE_CENTRAL_AFFILIATION_REJECTED,
    data: { ...data, message: body },
  });
  const io = getIO();
  if (io) {
    sendNotificationToUser(io, params.applicantUserId, {
      type: NOTIFICATION_TYPE_CENTRAL_AFFILIATION_REJECTED,
      title,
      body,
      data,
    });
  }
  void notificationService
    .sendPushToUser(params.applicantUserId, {
      title,
      body,
      data: {
        url,
        type: NOTIFICATION_TYPE_CENTRAL_AFFILIATION_REJECTED,
        requestId: params.requestId,
      },
    })
    .catch(() => undefined);
}
