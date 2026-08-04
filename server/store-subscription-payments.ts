/**
 * Pagos de mensualidad de tienda — envío, listado admin y revisión.
 */
import { getIO } from "./socket";
import { notificationService } from "./services/notification.service";
import { appliaStorage } from "./storage-applia";
import { getFullAdminUsers } from "./staff-users";
import { getSubscriptionFeesByCategorySlug } from "./subscription-fees";
import { applyStoreSubscriptionPaymentApproval } from "./store-subscription";
import { subscriptionMonthlyUsdForStore } from "@shared/store-subscription-fee";
import {
  STORE_SUBSCRIPTION_FEE_REPORT_TYPE,
  type StoreSubscriptionPaymentBody,
  type StoreSubscriptionPaymentReviewBody,
} from "@shared/store-subscription-payment";
import { buildStoreSubscriptionReportDescription } from "./subscription-invoice-metadata";
import type { Store } from "@shared/store-schema";
import { isStoreVisibilityActive } from "@shared/store-visibility";
import { parseVisibilitySubscriptionEndMs } from "@shared/professional-listing-subscription";
import {
  buildAdminStoreSubscriptionPendingNotification,
  buildStoreSubscriptionApprovedNotification,
  buildStoreSubscriptionRejectedNotification,
  storePushDataStrings,
} from "@shared/store-notification-copy";

function storePaymentKey(receipt: string, transferDate: string, months: number): string {
  return `${receipt.trim()}|${transferDate.trim()}|${months}`;
}

function approvalAtForStoreSubscription(_transferDate: string): Date {
  /** La vigencia arranca al validar el comprobante (no desde la fecha bancaria). */
  return new Date();
}

export async function submitStoreSubscriptionPayment(args: {
  userId: string;
  storeId: number;
  body: StoreSubscriptionPaymentBody;
}): Promise<{ reportId: number | string; store: Store }> {
  const store = await appliaStorage.getStoreById(args.storeId);
  if (!store) throw new Error("STORE_NOT_FOUND");
  if (store.ownerUserId !== args.userId) throw new Error("STORE_FORBIDDEN");

  const pending = await appliaStorage.findPendingStoreSubscriptionReport(args.storeId);
  if (pending) throw new Error("STORE_PAYMENT_ALREADY_PENDING");

  const fees = await getSubscriptionFeesByCategorySlug();
  const monthlyUsd = subscriptionMonthlyUsdForStore(fees);
  const months = Math.max(1, Math.min(12, Math.trunc(args.body.subscriptionMonths ?? 1)));
  const amountUsd = (Math.round(monthlyUsd * months * 100) / 100).toFixed(2);

  const report = await appliaStorage.createFinancialReport({
    userId: args.userId,
    storeId: args.storeId,
    storeSlug: store.slug,
    storeName: store.name,
    type: STORE_SUBSCRIPTION_FEE_REPORT_TYPE,
    amount: amountUsd,
    currency: "USD",
    status: "pending",
    paymentKind: "store_subscription_transfer",
    subscriptionMonths: months,
    subscriptionMonthlyUsd: monthlyUsd,
    transferReceiptCode: args.body.transferReceiptCode.trim(),
    transferDate: args.body.transferDate.trim(),
    description: buildStoreSubscriptionReportDescription({
      storeName: store.name,
      months,
      transferReceiptCode: args.body.transferReceiptCode,
    }),
    createdAt: new Date(),
  });

  try {
    const admins = await getFullAdminUsers(appliaStorage);
    const user = await appliaStorage.getUserById(args.userId);
    const u = user as { firstName?: string; lastName?: string; name?: string; email?: string } | undefined;
    const name =
      u != null
        ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.name || u.email || args.userId
        : args.userId;
    const adminCopy = buildAdminStoreSubscriptionPendingNotification({
      storeName: store.name,
      ownerName: name,
    });
    for (const admin of admins) {
      const adminId = String(admin.id);
      await appliaStorage.createNotification({
        userId: adminId,
        type: "admin_store_subscription_payment",
        data: {
          title: adminCopy.title,
          body: adminCopy.body,
          message: adminCopy.body,
          url: adminCopy.url,
          storeId: args.storeId,
          storeName: store.name,
          reportId: report.id,
        },
      });
      const io = getIO();
      io?.to(`user:${adminId}`).emit("notification", {
        type: "admin_store_subscription_payment",
        title: adminCopy.title,
        body: adminCopy.body,
        data: {
          title: adminCopy.title,
          body: adminCopy.body,
          url: adminCopy.url,
          storeId: args.storeId,
          storeName: store.name,
          reportId: report.id,
        },
      });
    }
  } catch (err) {
    console.error("[store-subscription] notify admins:", err);
  }

  return { reportId: report.id, store };
}

export type StoreSubscriptionPaymentAdminRow = {
  id: number | string;
  userId: string;
  userName: string;
  userEmail: string | null;
  storeId: number;
  storeName: string;
  storeSlug: string;
  amount: string | number;
  status: string;
  subscriptionMonths: number;
  subscriptionMonthlyUsd: number;
  transferReceiptCode: string | null;
  transferDate: string | null;
  createdAt: string | null;
};

export async function listStoreSubscriptionPaymentsForAdmin(
  status?: "pending" | "completed" | "rejected",
): Promise<StoreSubscriptionPaymentAdminRow[]> {
  const reports = await appliaStorage.listStoreSubscriptionFinancialReports(status);
  const rows: StoreSubscriptionPaymentAdminRow[] = [];
  for (const r of reports) {
    const userId = String(r.userId ?? "");
    const user = userId ? await appliaStorage.getUserById(userId) : undefined;
    const u = user as { firstName?: string; lastName?: string; name?: string; email?: string } | undefined;
    const userName =
      u != null
        ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.name || userId
        : userId;
    rows.push({
      id: r.id,
      userId,
      userName,
      userEmail: u?.email ?? null,
      storeId: Number(r.storeId),
      storeName: String(r.storeName ?? ""),
      storeSlug: String(r.storeSlug ?? ""),
      amount: r.amount ?? 0,
      status: String(r.status ?? "pending"),
      subscriptionMonths: Number(r.subscriptionMonths ?? 1),
      subscriptionMonthlyUsd: Number(r.subscriptionMonthlyUsd ?? 0),
      transferReceiptCode: r.transferReceiptCode ?? null,
      transferDate: r.transferDate ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt ?? null,
    });
  }
  return rows;
}

export async function reviewStoreSubscriptionPayment(args: {
  reportId: number | string;
  adminUserId: string;
  review: StoreSubscriptionPaymentReviewBody;
}): Promise<{ ok: true; store?: Store }> {
  const report = await appliaStorage.getFinancialReport(args.reportId);
  if (!report || report.type !== STORE_SUBSCRIPTION_FEE_REPORT_TYPE) {
    throw new Error("REPORT_NOT_FOUND");
  }
  if (report.status !== "pending") throw new Error("REPORT_NOT_PENDING");

  const storeId = Number(report.storeId);
  const store = await appliaStorage.getStoreById(storeId);
  if (!store) throw new Error("STORE_NOT_FOUND");

  const userId = String(report.userId ?? "");
  const months = Math.max(1, Math.min(12, Math.trunc(Number(report.subscriptionMonths ?? 1))));
  const receipt = String(report.transferReceiptCode ?? "").trim();
  const txDate = String(report.transferDate ?? "").trim();
  const paymentKey = storePaymentKey(receipt, txDate, months);

  if (args.review.action === "approve") {
    const alreadyApplied =
      paymentKey &&
      String((store as { visibilitySubscriptionLastPaymentKey?: string }).visibilitySubscriptionLastPaymentKey ?? "").trim() ===
        paymentKey;

    let updatedStore = store;
    if (!alreadyApplied) {
      updatedStore = await applyStoreSubscriptionPaymentApproval({
        storeId,
        months,
        approvedAt: approvalAtForStoreSubscription(txDate),
      });
      await appliaStorage.patchStoreSubscriptionPaymentMeta(storeId, {
        visibilitySubscriptionLastPaymentKey: paymentKey || null,
        visibilitySubscriptionLastPaymentApprovedAt: new Date().toISOString(),
        visibilitySubscriptionLastPaymentApprovedBy: args.adminUserId,
      });
    }
    await appliaStorage.updateFinancialReportStatus(args.reportId, "completed");

    const otherPending = (await appliaStorage.listStoreSubscriptionFinancialReports("pending")).filter(
      (r) => Number(r.storeId) === storeId && String(r.id) !== String(args.reportId),
    );
    for (const dup of otherPending) {
      try {
        await appliaStorage.updateFinancialReportStatus(dup.id, "completed");
      } catch (err) {
        console.error("[store-subscription] close duplicate pending", dup.id, err);
      }
    }

    const copy = buildStoreSubscriptionApprovedNotification({
      storeName: store.name,
      storeSlug: store.slug,
    });
    const notifyData = {
      status: "approved",
      message: copy.body,
      title: copy.title,
      body: copy.body,
      url: copy.url,
      storeId,
      storeSlug: store.slug,
      storeName: store.name,
    };
    await notifyStorePaymentResult(userId, copy.title, copy.body, notifyData);
    return { ok: true, store: updatedStore };
  }

  const rejectReason = String(args.review.reason ?? "").trim();
  if (rejectReason.length < 3) throw new Error("REJECT_REASON_REQUIRED");

  await appliaStorage.updateFinancialReportStatus(args.reportId, "rejected");

  const copy = buildStoreSubscriptionRejectedNotification({
    storeName: store.name,
    storeSlug: store.slug,
    rejectReason,
  });
  const notifyData = {
    status: "rejected",
    message: copy.body,
    title: copy.title,
    body: copy.body,
    url: copy.url,
    chatUrl: "/chat?support=1",
    storeId,
    storeSlug: store.slug,
    storeName: store.name,
    rejectReason,
  };
  await notifyStorePaymentResult(userId, copy.title, copy.body, notifyData);
  return { ok: true };
}

async function notifyStorePaymentResult(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  if (!userId) return;
  await appliaStorage.createNotification({
    userId,
    type: "store_subscription_result",
    data,
  });
  const io = getIO();
  io?.to(`user:${userId}`).emit("notification", {
    type: "store_subscription_result",
    title,
    body,
    data,
  });
  void notificationService
    .sendPushToUser(userId, {
      title,
      body,
      data: storePushDataStrings("store_subscription_result", data),
    })
    .catch((err) => console.error("[store-subscription] push:", err));
}

export async function storeHasPendingSubscriptionPayment(storeId: number): Promise<boolean> {
  const store = await appliaStorage.getStoreById(storeId);
  if (store && isStoreVisibilityActive(store)) {
    await reconcileStalePendingStoreSubscriptionReports(storeId);
    return false;
  }
  const pending = await appliaStorage.findPendingStoreSubscriptionReport(storeId);
  return pending != null;
}

/** Cierra comprobantes pending obsoletos cuando la suscripción de tienda ya está activa. */
async function reconcileStalePendingStoreSubscriptionReports(storeId: number): Promise<void> {
  const pendingList = (await appliaStorage.listStoreSubscriptionFinancialReports("pending")).filter(
    (r) => Number(r.storeId) === storeId,
  );
  for (const report of pendingList) {
    try {
      await appliaStorage.updateFinancialReportStatus(report.id, "completed");
    } catch (err) {
      console.error("[store-subscription] reconcile stale pending", report.id, err);
    }
  }
}

/**
 * Corrige tiendas cuyo pago fue aprobado pero la vigencia quedó mal (p. ej. fecha base = transferencia antigua).
 */
export async function repairStoreSubscriptionVisibilityIfNeeded(store: Store): Promise<Store> {
  if (isStoreVisibilityActive(store)) return store;
  if (await storeHasPendingSubscriptionPayment(store.id)) return store;

  const reports = await appliaStorage.listStoreSubscriptionFinancialReports("completed");
  const latest = reports.find((r) => Number(r.storeId) === store.id);
  if (!latest) return store;

  const completedRaw = (latest as { approvedAt?: unknown; updatedAt?: unknown; createdAt?: unknown }).approvedAt
    ?? (latest as { updatedAt?: unknown }).updatedAt
    ?? (latest as { createdAt?: unknown }).createdAt;
  const completedMs = parseVisibilitySubscriptionEndMs(completedRaw);
  const endMs = parseVisibilitySubscriptionEndMs(store.visibilitySubscriptionEndsAt);

  const neverActivated = endMs == null;
  const endBeforeApproval = completedMs != null && endMs != null && endMs < completedMs;
  if (!neverActivated && !endBeforeApproval) return store;

  const months = Math.max(1, Math.min(12, Math.trunc(Number(latest.subscriptionMonths ?? 1))));
  try {
    return await applyStoreSubscriptionPaymentApproval({
      storeId: store.id,
      months,
      approvedAt: new Date(),
    });
  } catch (err) {
    console.error("[store-subscription] repair visibility", err);
    return store;
  }
}
