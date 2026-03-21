/**
 * Agregación de métricas para el panel admin (sin depender de Firestore vs memoria).
 */

export const USER_RECHARGE_DESCRIPTION_PREFIX = "Recarga al usuario ";

export type AdminDashboardStatsPreset = "day" | "week" | "month" | "year";

export type AdminDashboardStatsResult = {
  snapshot: {
    users: { professionals: number; clients: number; staff: number; total: number };
    bookingsByStatus: {
      pending: number;
      confirmed: number;
      in_progress: number;
      completed: number;
      cancelled: number;
    };
    services: { active: number; inactive: number; total: number };
    pendingVerificationAssociates: number;
    pendingRechargeRequests: number;
    pendingWithdrawalRequests: number;
  };
  period: {
    newUsersTotal: number;
    newProfessionals: number;
    newClients: number;
    bookingsCreatedTotal: number;
    bookingsCreatedByStatus: {
      pending: number;
      confirmed: number;
      in_progress: number;
      completed: number;
      cancelled: number;
    };
    userRechargesCompleted: { count: number; totalUsd: number };
    adminBalanceCredits: { count: number; totalUsd: number };
    userRechargesRejected: number;
    userRechargesPendingCreated: number;
  };
};

function toCreatedAtMs(value: unknown): number {
  if (value == null) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  const maybe = value as { toDate?: () => Date; toMillis?: () => number };
  if (typeof maybe.toMillis === "function") {
    const t = maybe.toMillis();
    return typeof t === "number" && Number.isFinite(t) ? t : 0;
  }
  if (typeof maybe.toDate === "function") {
    const d = maybe.toDate();
    return d instanceof Date && Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }
  return 0;
}

function emptyBookingStatus() {
  return {
    pending: 0,
    confirmed: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };
}

function incBookingStatus(
  target: ReturnType<typeof emptyBookingStatus>,
  status: string
): void {
  const s = status || "pending";
  if (s === "pending") target.pending++;
  else if (s === "confirmed") target.confirmed++;
  else if (s === "in_progress") target.in_progress++;
  else if (s === "completed") target.completed++;
  else if (s === "cancelled") target.cancelled++;
}

export function getDashboardStatsRange(
  preset: AdminDashboardStatsPreset,
  anchor: Date = new Date()
): { from: Date; to: Date } {
  const to = new Date(anchor);
  to.setHours(23, 59, 59, 999);
  const from = new Date(anchor);

  if (preset === "day") {
    from.setHours(0, 0, 0, 0);
  } else if (preset === "week") {
    const day = from.getDay();
    const offset = day === 0 ? 6 : day - 1;
    from.setDate(from.getDate() - offset);
    from.setHours(0, 0, 0, 0);
  } else if (preset === "month") {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  } else {
    from.setMonth(0, 1);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

export function aggregateAdminDashboardStats(
  input: {
    users: unknown[];
    bookings: unknown[];
    services: unknown[];
    transfers: unknown[];
    pendingVerificationCount: number;
    pendingWithdrawalRequestsCount: number;
  },
  range: { from: Date; to: Date }
): AdminDashboardStatsResult {
  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  const inRange = (ms: number) => ms >= fromMs && ms <= toMs;

  let professionals = 0;
  let clients = 0;
  let staff = 0;
  let newUsersTotal = 0;
  let newProfessionals = 0;
  let newClients = 0;

  for (const u of input.users) {
    const role = String((u as { role?: string }).role ?? "");
    if (role === "professional") professionals++;
    else if (role === "client") clients++;
    else if (role === "admin" || role === "tiSupport") staff++;

    const cms = toCreatedAtMs((u as { createdAt?: unknown }).createdAt);
    if (!inRange(cms)) continue;
    if (role === "professional") {
      newProfessionals++;
      newUsersTotal++;
    } else if (role === "client") {
      newClients++;
      newUsersTotal++;
    }
  }

  const bookingsByStatus = emptyBookingStatus();
  const bookingsCreatedByStatus = emptyBookingStatus();
  let bookingsCreatedTotal = 0;

  for (const b of input.bookings) {
    const row = b as { status?: string; createdAt?: unknown; date?: unknown };
    const st = String(row.status ?? "pending");
    incBookingStatus(bookingsByStatus, st);

    const bms = toCreatedAtMs(row.createdAt ?? row.date);
    if (bms && inRange(bms)) {
      bookingsCreatedTotal++;
      incBookingStatus(bookingsCreatedByStatus, st);
    }
  }

  let servicesActive = 0;
  let servicesInactive = 0;
  for (const s of input.services) {
    const active = (s as { isActive?: boolean }).isActive;
    if (active === false) servicesInactive++;
    else servicesActive++;
  }

  let pendingRechargeRequests = 0;
  let userRechargesCompletedCount = 0;
  let userRechargesCompletedUsd = 0;
  let adminBalanceCreditsCount = 0;
  let adminBalanceCreditsUsd = 0;
  let userRechargesRejected = 0;
  let userRechargesPendingCreated = 0;

  for (const t of input.transfers) {
    const tr = t as {
      transferType?: string;
      status?: string;
      description?: string | null;
      amount?: number;
      createdAt?: unknown;
    };
    if (tr.transferType !== "recharge") continue;

    const amt = typeof tr.amount === "number" && Number.isFinite(tr.amount) ? tr.amount : 0;
    const desc = String(tr.description ?? "");
    const isUserFlow = desc.startsWith(USER_RECHARGE_DESCRIPTION_PREFIX);
    const cms = toCreatedAtMs(tr.createdAt);

    if (tr.status === "pending_approval") {
      pendingRechargeRequests++;
      if (inRange(cms)) userRechargesPendingCreated++;
    }

    if (tr.status === "completed" && inRange(cms)) {
      if (isUserFlow) {
        userRechargesCompletedCount++;
        userRechargesCompletedUsd += amt;
      } else {
        adminBalanceCreditsCount++;
        adminBalanceCreditsUsd += amt;
      }
    }
    if (tr.status === "rejected" && inRange(cms)) {
      if (isUserFlow) userRechargesRejected++;
    }
  }

  return {
    snapshot: {
      users: {
        professionals,
        clients,
        staff,
        total: input.users.length,
      },
      bookingsByStatus,
      services: {
        active: servicesActive,
        inactive: servicesInactive,
        total: input.services.length,
      },
      pendingVerificationAssociates: input.pendingVerificationCount,
      pendingRechargeRequests,
      pendingWithdrawalRequests: input.pendingWithdrawalRequestsCount,
    },
    period: {
      newUsersTotal,
      newProfessionals,
      newClients,
      bookingsCreatedTotal,
      bookingsCreatedByStatus,
      userRechargesCompleted: { count: userRechargesCompletedCount, totalUsd: userRechargesCompletedUsd },
      adminBalanceCredits: { count: adminBalanceCreditsCount, totalUsd: adminBalanceCreditsUsd },
      userRechargesRejected,
      userRechargesPendingCreated,
    },
  };
}
