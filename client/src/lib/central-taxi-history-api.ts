function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type CentralTaxiHistoryRide = {
  id: string;
  module: "taxi" | "pack";
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

export type CentralTaxiHistoryResponse = {
  rides: CentralTaxiHistoryRide[];
  bucket: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  counts: { completed: number; cancelled: number };
};

export async function fetchCentralTaxiHistory(params: {
  companyId: string;
  bucket: "completed" | "cancelled";
  page: number;
  limit?: number;
}): Promise<CentralTaxiHistoryResponse> {
  const qs = new URLSearchParams({
    companyId: params.companyId,
    bucket: params.bucket,
    page: String(params.page),
    limit: String(params.limit ?? 10),
  });
  const res = await fetch(`/api/central/taxi/rides?${qs}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Error al cargar historial");
  return data as CentralTaxiHistoryResponse;
}
