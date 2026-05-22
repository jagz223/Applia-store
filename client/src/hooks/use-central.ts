import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DispatchCompany, DispatchMobilityFares, DispatchPackFares } from "@shared/dispatch-company";
import type { CentralActiveService } from "@shared/central-fleet";
import type { CentralMemberSummary, RegisterCentralMemberInput, PatchCentralMemberInput } from "@shared/central-member";
import type { CentralAffiliationRequestRecord } from "@shared/central-affiliation";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type DispatchCompanyOption = { id: string; name: string };

export type CentralFleetDriver = {
  userId: string;
  name: string;
  lastName: string;
  avatar: string | null;
  /** Teléfono para coordinación (panel central). */
  phone: string | null;
  /** Placa del vehículo principal. */
  licensePlate: string | null;
  rating: number;
  vehicleType: string;
  isPetFriendly: boolean;
  lat: number | null;
  lon: number | null;
  /** Recibiendo ofertas de movilidad (taxi) según presencia en tiempo real. */
  receivingTaxi: boolean;
  /** Recibiendo ofertas de delivery (pack) según presencia en tiempo real. */
  receivingDelivery: boolean;
  /** Verdadero si recibe al menos un tipo de oferta (taxi o delivery). */
  receiving: boolean;
  inService: boolean;
  updatedAt: number | null;
  /** Viaje taxi o delivery en curso (solo si `inService`). */
  activeService: CentralActiveService | null;
};

/** Payload de `central:fleet:update` (Socket.IO) — solo posición/vehículo; el resto se fusiona con la fila del GET. */
export type CentralFleetSocketPatch = {
  userId: string;
  vehicleType: string;
  isPetFriendly: boolean;
  lat: number;
  lon: number;
  updatedAt: number;
  dispatchCompanyId: string | null;
  offline?: boolean;
};

export const CENTRAL_FLEET_QUERY_KEY = (companyId: string) => ["central", "fleet", companyId] as const;

/** Actualiza una fila de flota en caché sin refetch HTTP (escala con muchos conductores). */
export function mergeCentralFleetDriverPatch(
  prevDrivers: CentralFleetDriver[] | undefined,
  patch: CentralFleetSocketPatch,
): CentralFleetDriver[] {
  const list = prevDrivers ?? [];
  if (patch.offline === true) {
    return list.filter((d) => d.userId !== patch.userId);
  }
  const idx = list.findIndex((d) => d.userId === patch.userId);
  const existing = idx >= 0 ? list[idx] : undefined;
  const merged: CentralFleetDriver = {
    userId: patch.userId,
    name: existing?.name ?? "",
    lastName: existing?.lastName ?? "",
    avatar: existing?.avatar ?? null,
    phone: existing?.phone ?? null,
    licensePlate: existing?.licensePlate ?? null,
    rating: existing?.rating ?? 5,
    vehicleType: patch.vehicleType?.trim() || existing?.vehicleType || "car",
    isPetFriendly: patch.isPetFriendly,
    lat: patch.lat,
    lon: patch.lon,
    receivingTaxi: existing?.receivingTaxi ?? false,
    receivingDelivery: existing?.receivingDelivery ?? false,
    receiving: existing?.receiving ?? false,
    inService: existing?.inService ?? false,
    updatedAt: patch.updatedAt,
    activeService: existing?.activeService ?? null,
  };
  if (idx >= 0) {
    const next = [...list];
    next[idx] = merged;
    return next;
  }
  return [...list, merged];
}

export function useDispatchCompanyOptions() {
  return useQuery({
    queryKey: ["dispatch-companies", "options"],
    queryFn: async (): Promise<DispatchCompanyOption[]> => {
      const res = await fetch("/api/dispatch-companies/options");
      if (!res.ok) throw new Error("No se pudieron cargar las empresas");
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function useCentralCompaniesForAdmin(search: string, enabled: boolean) {
  return useQuery({
    queryKey: ["central", "companies", search],
    queryFn: async (): Promise<DispatchCompanyOption[]> => {
      const q = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      const res = await fetch(`/api/central/companies${q}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Sin acceso a empresas");
      return res.json();
    },
    enabled: enabled && !!localStorage.getItem("token"),
  });
}

export function useCentralMe(companyId: string | null) {
  return useQuery({
    queryKey: ["central", "me", companyId],
    queryFn: async () => {
      const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const res = await fetch(`/api/central/me${q}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("No se pudo cargar la central");
      return res.json() as Promise<{ company: DispatchCompany; isAdminView: boolean }>;
    },
    enabled: !!localStorage.getItem("token"),
  });
}

export function useCentralFares(companyId: string | null) {
  return useQuery({
    queryKey: ["central", "fares", companyId],
    queryFn: async () => {
      const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const res = await fetch(`/api/central/fares${q}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("No se pudieron cargar tarifas");
      return res.json() as Promise<{ mobilityFares: DispatchMobilityFares; packFares: DispatchPackFares }>;
    },
    enabled: !!localStorage.getItem("token") && !!companyId,
  });
}

export function usePatchCentralServiceMap(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { lat: number; lon: number; cityZoom?: number }) => {
      const res = await fetch("/api/central/service-map", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ ...body, companyId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? "Error al guardar el mapa");
      }
      return res.json() as Promise<DispatchCompany>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["central", "me", companyId] });
    },
  });
}

export function usePatchCentralFares(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      mobilityFares?: Partial<DispatchMobilityFares>;
      packFares?: Partial<DispatchPackFares>;
    }) => {
      const res = await fetch("/api/central/fares", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ ...body, companyId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? "Error al guardar tarifas");
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["central", "fares", companyId] });
    },
  });
}

export function useCentralFleet(companyId: string | null) {
  return useQuery({
    queryKey: CENTRAL_FLEET_QUERY_KEY(companyId ?? ""),
    queryFn: async () => {
      const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const res = await fetch(`/api/central/fleet${q}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("No se pudo cargar la flota");
      const data = (await res.json()) as { drivers: CentralFleetDriver[] };
      return data.drivers.map((d) => ({
        ...d,
        phone: d.phone ?? null,
        licensePlate: d.licensePlate ?? null,
        receivingTaxi: Boolean(d.receivingTaxi),
        receivingDelivery: Boolean(d.receivingDelivery),
        receiving: Boolean(d.receivingTaxi || d.receivingDelivery || d.receiving),
        activeService: (d as { activeService?: CentralActiveService | null }).activeService ?? null,
      }));
    },
    enabled: !!localStorage.getItem("token") && !!companyId,
    refetchInterval: 12_000,
  });
}

export function useCentralMembers(companyId: string | null) {
  return useQuery({
    queryKey: ["central", "members", companyId],
    queryFn: async () => {
      const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const res = await fetch(`/api/central/members${q}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("No se pudieron cargar los usuarios");
      const data = (await res.json()) as { members: CentralMemberSummary[] };
      return data.members;
    },
    enabled: !!localStorage.getItem("token") && !!companyId,
  });
}

export function useRegisterCentralMember(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Omit<RegisterCentralMemberInput, "companyId">) => {
      const res = await fetch("/api/central/members", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ ...body, companyId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? "Error al registrar usuario");
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["central", "members", companyId] });
    },
  });
}

export function usePatchCentralMember(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      ...patch
    }: Omit<PatchCentralMemberInput, "companyId"> & { userId: string }) => {
      const res = await fetch(`/api/central/members/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ ...patch, companyId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? "Error al actualizar usuario");
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["central", "members", companyId] });
    },
  });
}

export type MyCentralAffiliationRequest = CentralAffiliationRequestRecord & { companyName: string };

export function useMyCentralAffiliationRequests(enabled = true) {
  return useQuery({
    queryKey: ["my-central-affiliation-requests"],
    queryFn: async () => {
      const res = await fetch("/api/me/central-affiliation-requests", { headers: authHeaders() });
      if (!res.ok) throw new Error("No se pudieron cargar tus solicitudes de central");
      const data = (await res.json()) as { requests: MyCentralAffiliationRequest[] };
      return data.requests;
    },
    enabled: !!localStorage.getItem("token") && enabled,
    staleTime: 20_000,
  });
}

export function useCentralAffiliationRequests(companyId: string | null) {
  return useQuery({
    queryKey: ["central", "affiliation-requests", companyId],
    queryFn: async () => {
      const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const res = await fetch(`/api/central/affiliation-requests${q}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("No se pudieron cargar las solicitudes");
      const data = (await res.json()) as { requests: CentralAffiliationRequestRecord[] };
      return data.requests;
    },
    enabled: !!localStorage.getItem("token") && !!companyId,
    staleTime: 15_000,
  });
}

export type CentralApplicantPreviewResponse = {
  request: CentralAffiliationRequestRecord;
  applicant: {
    userId: string;
    name: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    credentialsManagedByUser: boolean;
  };
  vehicle: {
    license_plate: string;
    brand: string;
    model: string;
    model_year: number;
    vehicle_type: string;
  } | null;
  verification: { professionalCredentialUrl: string | null; imageVerified: boolean };
  dataAccessGranted: boolean;
};

export function useCentralApplicantPreview(requestId: string | null, companyId: string | null) {
  return useQuery({
    queryKey: ["central", "affiliation-preview", companyId, requestId],
    queryFn: async () => {
      const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const res = await fetch(
        `/api/central/affiliation-requests/${encodeURIComponent(requestId!)}/applicant-preview${q}`,
        { headers: authHeaders() },
      );
      if (!res.ok) throw new Error("No se pudo cargar el detalle");
      return res.json() as Promise<CentralApplicantPreviewResponse>;
    },
    enabled: !!localStorage.getItem("token") && !!companyId && !!requestId,
  });
}

export function useRequestCentralDataAccess(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch(
        `/api/central/affiliation-requests/${encodeURIComponent(requestId)}/request-data-access`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ companyId }),
        },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { message?: string }).message ?? "No se pudo enviar la solicitud");
      return j as { ok?: boolean; alreadySent?: boolean };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["central", "affiliation-requests", companyId] });
      void qc.invalidateQueries({ queryKey: ["central", "affiliation-preview", companyId] });
    },
  });
}

export function useApproveCentralAffiliation(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch(`/api/central/affiliation-requests/${encodeURIComponent(requestId)}/approve`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ companyId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { message?: string }).message ?? "No se pudo aprobar");
      return j;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["central", "affiliation-requests", companyId] });
      void qc.invalidateQueries({ queryKey: ["central", "members", companyId] });
      void qc.invalidateQueries({ queryKey: CENTRAL_FLEET_QUERY_KEY(companyId ?? "") });
      void qc.invalidateQueries({ queryKey: ["central", "affiliation-preview"] });
    },
  });
}

export function useRejectCentralAffiliation(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch(`/api/central/affiliation-requests/${encodeURIComponent(requestId)}/reject`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ companyId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { message?: string }).message ?? "No se pudo rechazar");
      return j;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["central", "affiliation-requests", companyId] });
    },
  });
}

export function useSetupCentralCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/central/setup-company", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { message?: string }).message ?? "No se pudo crear la central");
      return j as { company: { id: string; name: string }; dispatchCompanyId: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["user"] });
      void qc.invalidateQueries({ queryKey: ["central"] });
    },
  });
}

export function useGrantCentralDataSharing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch("/api/me/central-affiliation/grant-data-sharing", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ requestId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { message?: string }).message ?? "No se pudo ceder el acceso");
      return j;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-central-affiliation-requests"] });
      void qc.invalidateQueries({ queryKey: ["central", "affiliation-preview"] });
    },
  });
}
