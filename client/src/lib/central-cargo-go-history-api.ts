function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type CentralCargoGoHistoryRide = {
  id: string;
  module: "cargo" | "pack";
  moduleLabel: string;
  bucket: string;
  status: string;
  statusLabel: string;
  driverName: string | null;
  vehicleLabel: string;
  startLabel: string;
  endLabel: string;
  endedAt: string;
  durationMin: number;
  amountUsd: number;
  payment: string;
};

export type CentralCargoGoHistoryResponse = {
  rides: CentralCargoGoHistoryRide[];
  bucket: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  counts: { completed: number; cancelled: number };
};

export async function fetchCentralCargoGoHistory(params: {
  companyId: string;
  bucket: "completed" | "cancelled";
  page: number;
  limit?: number;
}): Promise<CentralCargoGoHistoryResponse> {
  const qs = new URLSearchParams({
    companyId: params.companyId,
    bucket: params.bucket,
    page: String(params.page),
    limit: String(params.limit ?? 10),
  });
  const res = await fetch(`/api/central/cargo-go/rides?${qs}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Error al cargar historial");
  return data as CentralCargoGoHistoryResponse;
}
