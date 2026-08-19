import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StoreMemberRole, StoreStaffDirectoryEntry } from "@shared/store-staff-schema";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type StoreStaffListFilters = {
  email?: string;
  phone?: string;
  name?: string;
  role?: StoreMemberRole;
  branchId?: string;
};

export function storeStaffQueryKey(storeId: number, filters?: StoreStaffListFilters) {
  return ["/api/stores", storeId, "staff", filters ?? {}] as const;
}

export function useStoreStaffDirectory(storeId: number, filters?: StoreStaffListFilters, enabled = true) {
  return useQuery({
    queryKey: storeStaffQueryKey(storeId, filters),
    queryFn: async (): Promise<StoreStaffDirectoryEntry[]> => {
      const params = new URLSearchParams();
      if (filters?.email?.trim()) params.set("email", filters.email.trim());
      if (filters?.phone?.trim()) params.set("phone", filters.phone.trim());
      if (filters?.name?.trim()) params.set("name", filters.name.trim());
      if (filters?.role) params.set("role", filters.role);
      if (filters?.branchId?.trim()) params.set("branchId", filters.branchId.trim());
      const qs = params.toString();
      const res = await fetch(`/api/stores/${storeId}/staff${qs ? `?${qs}` : ""}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar los usuarios");
      }
      const data = (await res.json()) as { members: StoreStaffDirectoryEntry[] };
      return data.members;
    },
    enabled: enabled && storeId > 0,
  });
}

export function useUpdateStoreStaffMember(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      role,
      branchId,
    }: {
      userId: string;
      role: StoreMemberRole;
      branchId?: string | null;
    }) => {
      const res = await fetch(`/api/stores/${storeId}/staff/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ role, branchId: role === "employee" ? branchId : null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo actualizar el usuario");
      }
      const data = (await res.json()) as { member: StoreStaffDirectoryEntry | null };
      return data.member;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["/api/stores", storeId, "staff"] });
    },
  });
}
