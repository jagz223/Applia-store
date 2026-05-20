import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DispatchMobilityFares, DispatchPackFares } from "@shared/dispatch-company";

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
  rating: number;
  vehicleType: string;
  isPetFriendly: boolean;
  lat: number | null;
  lon: number | null;
  receiving: boolean;
  inService: boolean;
  updatedAt: number | null;
};

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
      return res.json() as Promise<{ company: { id: string; name: string }; isAdminView: boolean }>;
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
    queryKey: ["central", "fleet", companyId],
    queryFn: async () => {
      const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const res = await fetch(`/api/central/fleet${q}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("No se pudo cargar la flota");
      const data = (await res.json()) as { drivers: CentralFleetDriver[] };
      return data.drivers;
    },
    enabled: !!localStorage.getItem("token") && !!companyId,
    refetchInterval: 12_000,
  });
}

export function useRegisterCentralMember(companyId: string | null) {
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
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
  });
}
