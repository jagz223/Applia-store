import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type {
  CreatePromotionalCodeInput,
  RedeemPromotionalCodeResult,
} from "@shared/promotional-code-schema";
import type { PromotionalCodeRecord } from "@shared/promotional-code-utils";

export const ADMIN_PROMOTIONAL_CODES_QUERY_KEY = ["/api/admin/promotional-codes"] as const;

const getToken = () => {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
};

async function parseApiError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return (data as { message?: string }).message ?? "Error en la solicitud";
}

export type PromotionalCodeApiError = {
  message: string;
  errors?: {
    fieldErrors?: Record<string, string[]>;
    formErrors?: string[];
  };
};

export function useAdminPromotionalCodes(enabled = true) {
  return useQuery({
    queryKey: ADMIN_PROMOTIONAL_CODES_QUERY_KEY,
    enabled,
    queryFn: async (): Promise<PromotionalCodeRecord[]> => {
      const token = getToken();
      const res = await fetch("/api/admin/promotional-codes", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      return res.json();
    },
  });
}

export function useCreatePromotionalCode() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (body: CreatePromotionalCodeInput) => {
      const token = getToken();
      const res = await fetch("/api/admin/promotional-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...body,
          expiresAt: body.expiresAt ? new Date(body.expiresAt).toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err: PromotionalCodeApiError = {
          message: (data as { message?: string }).message ?? "Error al crear código",
          errors: (data as { errors?: PromotionalCodeApiError["errors"] }).errors,
        };
        throw err;
      }
      return data as PromotionalCodeRecord;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_PROMOTIONAL_CODES_QUERY_KEY });
      toast({ title: "Código creado", description: "El código promocional se guardó correctamente." });
    },
    onError: (error: PromotionalCodeApiError) => {
      toast({
        title: "No se pudo crear",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdatePromotionalCode() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...body }: CreatePromotionalCodeInput & { id: number }) => {
      const token = getToken();
      const res = await fetch(`/api/admin/promotional-codes/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...body,
          expiresAt: body.expiresAt ? new Date(body.expiresAt).toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err: PromotionalCodeApiError = {
          message: (data as { message?: string }).message ?? "Error al actualizar código",
          errors: (data as { errors?: PromotionalCodeApiError["errors"] }).errors,
        };
        throw err;
      }
      return data as PromotionalCodeRecord;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_PROMOTIONAL_CODES_QUERY_KEY });
      toast({ title: "Código actualizado", description: "Los cambios se guardaron correctamente." });
    },
    onError: (error: PromotionalCodeApiError) => {
      toast({
        title: "No se pudo actualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRedeemPromotionalCode() {
  return useMutation({
    mutationFn: async (body: {
      code: string;
      subscriptionMonths: number;
      monthlyUsd: number;
    }): Promise<RedeemPromotionalCodeResult> => {
      const token = getToken();
      const res = await fetch("/api/promotional-codes/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? "No se pudo aplicar el código");
      }
      return data as RedeemPromotionalCodeResult;
    },
  });
}

export function useDeletePromotionalCode() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const token = getToken();
      const res = await fetch(`/api/admin/promotional-codes/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(await parseApiError(res));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_PROMOTIONAL_CODES_QUERY_KEY });
      toast({ title: "Código eliminado", description: "El código promocional fue eliminado." });
    },
    onError: (error: Error) => {
      toast({
        title: "No se pudo eliminar",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
