import {
  buildPublicPromoNewPushCopy,
  buildPublicPromoReminderPushCopy,
  NOTIFICATION_TYPE_PUBLIC_PROMO_NEW,
  NOTIFICATION_TYPE_PUBLIC_PROMO_REMINDER,
  PUBLIC_PROMO_REMINDER_INTERVAL_MS,
  PUBLIC_PROMOS_PAGE_URL,
} from "@shared/public-promotional-notifications";
import {
  isPromotionalCodeCurrentlyActive,
  parsePromotionalExpiresAt,
  userHasRedeemedPromotionalCode,
  type PromotionalCodeRecord,
} from "@shared/promotional-code-utils";
import { appliaStorage } from "./storage-applia";
import { notificationService } from "./services/notification.service";
import { getIO, sendNotificationToUser } from "./socket";
const TICK_MS = 5 * 60 * 1000;
let schedulerStarted = false;
let tickInFlight = false;

function parsePromoNotifyDate(raw: unknown): Date | null {
  return parsePromotionalExpiresAt(raw);
}

async function sendPublicPromoPushAndInApp(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  promoId: number;
  code: string;
}): Promise<void> {
  const url = `${PUBLIC_PROMOS_PAGE_URL}?promo=${params.promoId}`;
  const data: Record<string, unknown> = {
    url,
    type: params.type,
    promoId: params.promoId,
    title: params.title,
    body: params.body,
  };
  await appliaStorage.createNotification({
    userId: params.userId,
    type: params.type,
    data,
  });
  void notificationService
    .sendPushToUser(params.userId, {
      title: params.title,
      body: params.body,
      data: { url, type: params.type, promoId: String(params.promoId) },
    })
    .catch(() => undefined);
  const io = getIO();
  if (io) sendNotificationToUser(io, params.userId, { type: params.type, data });
}

async function processPublicPromotionalCodeNotifications(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const nowMs = Date.now();
    const all = (await appliaStorage.getPromotionalCodes()) as PromotionalCodeRecord[];
    const recipientIds = await appliaStorage.listPublicPromoNotificationRecipientUserIds();
    if (recipientIds.length === 0) return;

    for (const promo of all) {
      if (promo.isPublic !== true) continue;
      if (!isPromotionalCodeCurrentlyActive(promo, nowMs)) continue;

      const promoId = Number(promo.id);
      if (!Number.isFinite(promoId) || promoId <= 0) continue;
      const code = String(promo.code).toUpperCase();

      const dueAt = parsePromoNotifyDate(promo.publicAnnouncementDueAt);
      const sentAt = parsePromoNotifyDate(promo.publicAnnouncementSentAt);
      if (dueAt && !sentAt && dueAt.getTime() <= nowMs) {
        const { title, body } = buildPublicPromoNewPushCopy();
        for (const uid of recipientIds) {
          await sendPublicPromoPushAndInApp({
            userId: uid,
            type: NOTIFICATION_TYPE_PUBLIC_PROMO_NEW,
            title,
            body,
            promoId,
            code,
          });
        }
        await appliaStorage.patchPromotionalCodePublicNotifyFields(promoId, {
          publicAnnouncementSentAt: new Date(),
        });
      }

      const announceSent = parsePromoNotifyDate(promo.publicAnnouncementSentAt);
      if (!announceSent) continue;

      const reminders = { ...(promo.publicUserReminders ?? {}) };
      const reminderPatch: Record<string, string> = {};
      const { title: remTitle, body: remBody } = buildPublicPromoReminderPushCopy(promo, nowMs);

      for (const uid of recipientIds) {
        if (userHasRedeemedPromotionalCode(promo.usedByUserCounts, uid)) continue;

        const lastRaw = reminders[uid];
        const lastMs = lastRaw ? parsePromoNotifyDate(lastRaw)?.getTime() : null;
        const baselineMs = lastMs ?? announceSent.getTime();
        const dueForReminder = nowMs - baselineMs >= PUBLIC_PROMO_REMINDER_INTERVAL_MS;
        if (!dueForReminder) continue;

        await sendPublicPromoPushAndInApp({
          userId: uid,
          type: NOTIFICATION_TYPE_PUBLIC_PROMO_REMINDER,
          title: remTitle,
          body: remBody,
          promoId,
          code,
        });
        reminderPatch[uid] = new Date().toISOString();
      }

      if (Object.keys(reminderPatch).length > 0) {
        await appliaStorage.patchPromotionalCodePublicNotifyFields(promoId, {
          publicUserReminders: reminderPatch,
        });
      }
    }
  } catch (err) {
    console.error("[public-promo-notify] Error en tick:", err);
  } finally {
    tickInFlight = false;
  }
}

/** Arranca comprobación periódica de avisos de códigos públicos (15 min post-alta + recordatorios 24 h). */
export function startPublicPromotionalCodeNotificationScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  void processPublicPromotionalCodeNotifications();
  setInterval(() => {
    void processPublicPromotionalCodeNotifications();
  }, TICK_MS);
  console.log("[public-promo-notify] Scheduler activo (alta 15 min, recordatorios 24 h, cierre al expirar)");
}
