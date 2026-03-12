import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertProvider, type InsertService, type InsertBooking, type ServiceWithProvider } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// ==========================================
// HELPERS
// ==========================================
const getToken = () => {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
};

// ==========================================
// CATEGORIES
// ==========================================
export function useCategories() {
  return useQuery({
    queryKey: [api.categories.list.path],
    queryFn: async () => {
      const res = await fetch(api.categories.list.path);
      if (!res.ok) throw new Error("Failed to fetch categories");
      return api.categories.list.responses[200].parse(await res.json());
    },
  });
}

// ==========================================
// PROVIDERS
// ==========================================

/** Lista de categorías de proveedor permitidas (desde API) */
export function useProviderCategories() {
  return useQuery({
    queryKey: ["/api/provider-categories"],
    queryFn: async () => {
      const res = await fetch("/api/provider-categories");
      if (!res.ok) throw new Error("Failed to fetch provider categories");
      return res.json() as Promise<Array<{ code: string; label: string; professionLabel?: string }>>;
    },
  });
}

/** Disponibilidad por categoría de proveedor (al menos un profesional). Para Explore: cartas encendidas/apagadas. */
export function useProviderCategoryAvailability() {
  return useQuery({
    queryKey: ["/api/provider-categories/availability"],
    queryFn: async () => {
      const res = await fetch("/api/provider-categories/availability");
      if (!res.ok) throw new Error("Failed to fetch provider category availability");
      return res.json() as Promise<Record<string, boolean>>;
    },
  });
}

export function useProviders(params?: { profession?: string; category?: string }) {
  const profession = params?.profession;
  const category = params?.category;
  return useQuery({
    queryKey: [api.providers.list.path, profession, category],
    queryFn: async () => {
      const search = new URLSearchParams();
      if (profession) search.set("profession", profession);
      if (category) search.set("category", category);
      const url = `${api.providers.list.path}${search.toString() ? `?${search.toString()}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch providers");
      return api.providers.list.responses[200].parse(await res.json());
    },
  });
}

export function useProvider(id: number) {
  return useQuery({
    queryKey: [api.providers.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.providers.get.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch provider");
      return api.providers.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCurrentProvider() {
  return useQuery({
    queryKey: [api.providers.me.path],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(api.providers.me.path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch current provider profile");
      return api.providers.me.responses[200].parse(await res.json());
    },
    retry: false,
  });
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: InsertProvider) => {
      const token = getToken();
      const res = await fetch(api.providers.create.path, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create provider profile");
      }
      return api.providers.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.providers.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.providers.me.path] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
      toast({ title: "Welcome Pro!", description: "Your provider profile is now live." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });
}

// ==========================================
// SERVICES
// ==========================================
export function useServices(
  params?: {
    categoryId?: string;
    search?: string;
    providerCategoryId?: number;
  },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: [api.services.list.path, params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.categoryId) queryParams.append("categoryId", params.categoryId);
      if (params?.search) queryParams.append("search", params.search);
      if (params?.providerCategoryId != null)
        queryParams.append("providerCategoryId", String(params.providerCategoryId));
      const url = `${api.services.list.path}?${queryParams.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch services");
      const parsed = api.services.list.responses[200].parse(await res.json());
      return parsed as ServiceWithProvider[];
    },
    enabled: options?.enabled !== false,
  });
}

export function useService(id: number) {
  return useQuery({
    queryKey: [api.services.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.services.get.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch service");
      return api.services.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertService) => {
      const token = getToken();
      const res = await fetch(api.services.create.path, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create service");
      return api.services.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.services.list.path] });
      toast({ title: "Service Created", description: "Your service is now available for booking." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });
}

export type ServiceUpdatePayload = {
  title?: string;
  description?: string;
  price?: string;
  imageUrl?: string;
  isActive?: boolean;
  categoryId?: number;
};

/** Servicios del proveedor actual (solo si está autenticado y es proveedor). */
export function useMyServices(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["/api/me/services"],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch("/api/me/services", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to fetch my services");
      return res.json() as Promise<ServiceWithProvider[]>;
    },
    retry: false,
    enabled: options?.enabled !== false,
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (serviceId: number) => {
      const token = getToken();
      const res = await fetch(`/api/services/${serviceId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to delete service");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.services.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/services"] });
      toast({ title: "Servicio eliminado", description: "El servicio se ha eliminado correctamente." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateService(serviceId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: ServiceUpdatePayload) => {
      const token = getToken();
      const res = await fetch(`/api/services/${serviceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update service");
      }
      return res.json();
    },
    onSuccess: (_, __, context) => {
      queryClient.invalidateQueries({ queryKey: [api.services.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.services.get.path, serviceId] });
      toast({ title: "Servicio actualizado", description: "Los cambios se han guardado correctamente." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

// ==========================================
// BOOKINGS
// ==========================================
export function useBookings() {
  return useQuery({
    queryKey: [api.bookings.list.path],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(api.bookings.list.path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Failed to fetch bookings");
      return api.bookings.list.responses[200].parse(await res.json());
    },
  });
}

/** Reservas del profesional (como proveedor). Requiere JWT. */
export function useBookingsByProvider(params?: { status?: string }) {
  const queryKey = ["/api/bookings/provider", params?.status].filter(Boolean);
  return useQuery({
    queryKey,
    queryFn: async () => {
      const token = getToken();
      const url = params?.status ? `/api/bookings/provider?status=${encodeURIComponent(params.status)}` : "/api/bookings/provider";
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Failed to fetch provider bookings");
      return res.json();
    },
  });
}

/** Mensajes de feedback al crear una reserva (centralizados para consistencia y mantenibilidad). */
const BOOKING_SUCCESS_TOAST = {
  title: "Reserva realizada con éxito",
  description: "El profesional ha sido notificado. Puedes ver el estado de tu reserva en Mi Cuenta → Mis Reservas.",
} as const;

const BOOKING_ERROR_TOAST = {
  title: "Error al crear la reserva",
} as const;

export function useCreateBooking() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertBooking) => {
      const token = getToken();
      const res = await fetch(api.bookings.create.path, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create booking");
      return api.bookings.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bookings.list.path] });
      toast({
        title: BOOKING_SUCCESS_TOAST.title,
        description: BOOKING_SUCCESS_TOAST.description,
      });
    },
    onError: (err: Error) => {
      toast({
        title: BOOKING_ERROR_TOAST.title,
        description: err.message || "Intenta de nuevo más tarde.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateBookingStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const token = getToken();
      const url = buildUrl(api.bookings.updateStatus.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return api.bookings.updateStatus.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bookings.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
      toast({ title: "Estado actualizado", description: "El estado de la reserva se ha actualizado." });
    },
  });
}
