import type { MobilityRideHistoryListItem } from "@shared/mobility-ride-history";
import { fetchAdminJson } from "@/lib/admin-api";

export type CargoGoRidesAdminResponse = {
  rides: Array<{
    id: string;
    bucket: string;
    status: string;
    statusLabel: string;
    riderName: string;
    driverName: string | null;
    vehicleLabel: string;
    startLabel: string;
    endLabel: string;
    createdAt: string;
  }>;
  bucket: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  counts: { active: number; completed: number; cancelled: number };
};

export async function fetchCargoGoRidesAdmin(params: {
  bucket: "active" | "completed" | "cancelled";
  page: number;
  limit?: number;
}): Promise<CargoGoRidesAdminResponse> {
  const qs = new URLSearchParams({
    bucket: params.bucket,
    page: String(params.page),
    limit: String(params.limit ?? 10),
  });
  return fetchAdminJson<CargoGoRidesAdminResponse>(`/api/admin/cargo-go/rides?${qs}`);
}

export async function fetchMobilityRideHistoryForUser(
  limit = 50,
  role?: "rider" | "driver"
): Promise<MobilityRideHistoryListItem[]> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (role) qs.set("role", role);
  const data = await fetchAdminJson<{ rides: MobilityRideHistoryListItem[] }>(
    `/api/mobility/rides/history?${qs}`
  );
  return Array.isArray(data.rides) ? data.rides : [];
}
