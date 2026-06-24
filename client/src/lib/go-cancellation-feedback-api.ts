import { fetchAdminJson } from "@/lib/admin-api";
import type { GoCancellationFeedbackRecord } from "@shared/go-cancellation-feedback";

export async function fetchAdminGoCancellations(opts?: {
  page?: number;
  limit?: number;
}): Promise<{
  rows: GoCancellationFeedbackRecord[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const q = new URLSearchParams();
  if (opts?.page) q.set("page", String(opts.page));
  if (opts?.limit) q.set("limit", String(opts.limit));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAdminJson(`/api/admin/go-cancellations${suffix}`);
}

export async function reviewAdminGoCancellation(
  id: string,
  body: { action: "no_penalty" | "penalty"; penaltyAmount?: number },
): Promise<{ row: GoCancellationFeedbackRecord }> {
  return fetchAdminJson(`/api/admin/go-cancellations/${encodeURIComponent(id)}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
