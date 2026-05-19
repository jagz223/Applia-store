import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import {
  LISTING_SUBSCRIPTION_WARNING_DAYS,
  listingSubscriptionDaysRemaining,
} from "@shared/professional-listing-subscription";
import { type InsertProvider, type InsertService, type InsertBooking, type ServiceWithProvider } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { debouncedRefetch } from "@/lib/refetch-utils";

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
      if (!res.ok) throw new Error("No se pudieron cargar las categorías");
      return api.categories.list.responses[200].parse(await res.json());
    },
  });
}

/** Lista completa de categorías para el panel admin (incluye documentos legacy legal/financial en `categories`). */
export const ADMIN_CATEGORIES_QUERY_KEY = ["/api/admin/categories"] as const;

export function useAdminCategories() {
  return useQuery({
    queryKey: ADMIN_CATEGORIES_QUERY_KEY,
    queryFn: async () => {
      const token = getToken();
      const res = await fetch("/api/admin/categories", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No se pudieron cargar las categorías (admin)");
      return api.categories.list.responses[200].parse(await res.json());
    },
  });
}

export interface Subcategory {
  id: number;
  name: string;
  slug: string;
  categoryId: number;
  categorySlug?: string;
  icon?: string | null;
}

/** Subcategorías de una categoría (ej. Servicios Legales y Consultoría Financiera bajo Servicios Profesionales). */
export function useSubcategories(categoryId: number | null | undefined) {
  return useQuery({
    queryKey: ["/api/subcategories", categoryId],
    queryFn: async () => {
      const res = await fetch(`/api/subcategories?categoryId=${categoryId}`);
      if (!res.ok) throw new Error("No se pudieron cargar las subcategorías");
      return res.json() as Promise<Subcategory[]>;
    },
    enabled: categoryId != null && !Number.isNaN(Number(categoryId)) && Number(categoryId) >= 1,
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { id: number; name?: string; slug?: string; icon?: string }) => {
      const { id, ...payload } = data;
      const token = getToken();
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resData.message || "Error al actualizar categoría");
      return resData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.categories.list.path] });
      debouncedRefetch(queryClient, [api.categories.list.path]);
      queryClient.invalidateQueries({ queryKey: ADMIN_CATEGORIES_QUERY_KEY });
      toast({ title: "Categoría actualizada", description: "Los cambios se han guardado exitosamente." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Error al actualizar", variant: "destructive" });
    },
  });
}

export function useCreateSubcategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: Omit<Subcategory, "id">) => {
      const token = getToken();
      const res = await fetch(`/api/admin/subcategories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resData.message || "Error al crear subcategoría");
      return resData;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/subcategories", variables.categoryId] });
      toast({ title: "Subcategoría creada", description: "La subcategoría ha sido creada." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Error al crear", variant: "destructive" });
    },
  });
}

export function useUpdateSubcategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { id: number; categoryId: number } & Partial<Omit<Subcategory, "id">>) => {
      const { id, categoryId, ...payload } = data;
      const token = getToken();
      const res = await fetch(`/api/admin/subcategories/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resData.message || "Error al actualizar subcategoría");
      return { data: resData, categoryId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/subcategories", result.categoryId] });
      toast({ title: "Subcategoría actualizada", description: "Los cambios se han guardado." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Error al actualizar", variant: "destructive" });
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
      if (!res.ok) throw new Error("No se pudieron cargar las categorías de asociado");
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
      if (!res.ok) throw new Error("No se pudo cargar la disponibilidad por categoría");
      return res.json() as Promise<Record<string, boolean>>;
    },
  });
}

/** Config pública: slugs de marcas/categorías ocultas en UI (chips). */
export function useCategoryVisibility(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["/api/platform/category-visibility"],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch("/api/platform/category-visibility", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No se pudo cargar la visibilidad de categorías");
      return res.json() as Promise<{ hiddenSlugs: string[] }>;
    },
    staleTime: 30_000,
    enabled: options?.enabled !== false,
  });
}

export type SubscriptionFeesDto = { feesBySlug: Record<string, number> };

/** Mensualidad por categoría (suscripción de visibilidad) */
export function usePlatformSubscriptionFees(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["/api/platform/subscription-fees"],
    queryFn: async () => {
      const res = await fetch("/api/platform/subscription-fees");
      if (!res.ok) throw new Error("No se pudieron cargar las mensualidades");
      return res.json() as Promise<SubscriptionFeesDto>;
    },
    staleTime: 30_000,
    enabled: options?.enabled !== false,
  });
}

export function usePatchPlatformSubscriptionFees() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (feesBySlug: SubscriptionFeesDto["feesBySlug"]) => {
      const token = getToken();
      const res = await fetch("/api/admin/subscription-fees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ feesBySlug }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "No se pudo guardar mensualidades");
      return data as SubscriptionFeesDto;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/subscription-fees"] });
      toast({ title: "Guardado", description: "Mensualidades actualizadas." });
    },
  });
}

/** Tarifas Pack Go (envíos/delivery) */
export function usePlatformPackFares(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["/api/platform/pack-fares"],
    queryFn: async () => {
      const res = await fetch("/api/platform/pack-fares");
      if (!res.ok) throw new Error("No se pudo cargar las tarifas Pack Go");
      return res.json() as Promise<{ fares: { moto: any; auto: any; camioneta: any } }>;
    },
    staleTime: 30_000,
    enabled: options?.enabled !== false,
  });
}

export function usePatchPlatformPackFares() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (fares: { moto: { baseUsd: number; perKmUsd: number }; auto: { baseUsd: number; perKmUsd: number }; camioneta: { baseUsd: number; perKmUsd: number } }) => {
      const token = getToken();
      const res = await fetch("/api/admin/pack-fares", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ fares }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "No se pudo guardar tarifas Pack Go");
      return data as { fares: any };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/pack-fares"] });
      debouncedRefetch(queryClient, ["/api/platform/pack-fares"]);
      toast({ title: "Guardado", description: "Tarifas Pack Go actualizadas." });
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
      if (!res.ok) throw new Error("No se pudieron cargar los asociados");
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
      if (!res.ok) throw new Error("No se pudo cargar el perfil del asociado");
      return api.providers.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

/** Vehículo principal del proveedor (Car Go / taxi / delivery). */
export type ProviderPrimaryVehicle = {
  vehicle_type: string;
  brand?: string | null;
  model?: string | null;
  license_plate?: string | null;
  model_year?: number | null;
  is_pet_friendly?: boolean;
};

export function useProviderVehicle(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["/api/me/provider-vehicle"],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch("/api/me/provider-vehicle", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("No se pudo cargar tu vehículo");
      return (await res.json()) as ProviderPrimaryVehicle | null;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

export type EnrollGoDriverPayload = {
  serviceTitle?: string;
  serviceDescription?: string;
  vehicle?: import("@shared/vehicle-schema").InsertProviderVehicle;
};

export function useEnrollGoDriver() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: EnrollGoDriverPayload) => {
      const token = getToken();
      const res = await fetch("/api/me/go-driver", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message || "No se pudo completar el registro de conductor");
      }
      return data as {
        ok?: boolean;
        goBrands?: string[];
        hasPrimaryVehicle?: boolean;
        hasTransport?: boolean;
        hasDelivery?: boolean;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.providers.me.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/provider-vehicle"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/services"] });
      debouncedRefetch(queryClient, [api.providers.me.path]);
      debouncedRefetch(queryClient, ["/api/me/provider-vehicle"]);
      toast({
        title: "Genfeb Go activado",
        description:
          "Taxi y delivery quedan habilitados en tu cuenta (según verificación y suscripción). Puedes abrir Genfeb Go para conducir.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
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
      if (!res.ok) throw new Error("No se pudo cargar tu perfil de asociado");
      return api.providers.me.responses[200].parse(await res.json());
    },
    retry: false,
    // El default global usa staleTime: Infinity; hace falta refresco para isVerified y nav "Mis servicios".
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      const d = query.state.data as {
        isVerified?: boolean;
        isListingPublished?: boolean;
        visibilitySubscriptionEndsAt?: string | null;
        subscriptionDaysRemaining?: number | null;
      } | null | undefined;
      if (d == null) return false;

      let daysRemaining: number | null = d.subscriptionDaysRemaining ?? null;
      if (
        (daysRemaining == null || Number.isNaN(daysRemaining)) &&
        d.visibilitySubscriptionEndsAt
      ) {
        daysRemaining = listingSubscriptionDaysRemaining(d.visibilitySubscriptionEndsAt);
      }

      const nearRenewalWindow =
        d.isVerified === true &&
        typeof daysRemaining === "number" &&
        daysRemaining <= LISTING_SUBSCRIPTION_WARNING_DAYS + 1 &&
        daysRemaining >= 0;

      if (nearRenewalWindow) return 60_000;

      if (d.isVerified !== true) return 20_000;

      return false;
    },
  });
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (
      data: InsertProvider & {
        serviceTitle?: string;
        serviceDescription?: string;
        vehicle?: import("@shared/vehicle-schema").InsertProviderVehicle;
        preparationLevel?: string;
        coursesCompleted?: string;
        certifications?: string;
      }
    ) => {
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
        throw new Error(error.message || "No se pudo crear el perfil de asociado");
      }
      return api.providers.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.providers.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.providers.me.path] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
      toast({ title: "¡Perfil de asociado listo!", description: "Tu perfil ya está publicado y visible para los clientes." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });
}

export type ProviderPatchPayload = {
  profession?: string;
  bio?: string;
  yearsExperience?: number;
  hourlyRate?: string;
  categoryId?: number;
  skills?: string[];
  preparationLevel?: string;
  certifications?: string;
  coursesCompleted?: string;
};

/** Actualizar perfil de proveedor (p. ej. biografía). No muestra toast en éxito; invalida caché. */
export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      providerId,
      data,
    }: {
      providerId: number;
      data: ProviderPatchPayload;
    }) => {
      const token = getToken();
      const res = await fetch(`/api/providers/${providerId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "No se pudo actualizar el perfil de asociado");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.providers.me.path] });
      queryClient.invalidateQueries({ queryKey: [api.providers.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.services.get.path] });
      debouncedRefetch(queryClient, [api.providers.list.path]);
    },
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
    subcategoryId?: number;
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
      if (params?.subcategoryId != null)
        queryParams.append("subcategoryId", String(params.subcategoryId));
      const url = `${api.services.list.path}?${queryParams.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("No se pudieron cargar los servicios");
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
      const token = getToken();
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No se pudo cargar el servicio");
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
      if (!res.ok) throw new Error("No se pudo crear el servicio");
      return api.services.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.services.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/services"] });
      debouncedRefetch(queryClient, [api.services.list.path]);
      debouncedRefetch(queryClient, ["/api/me/services"]);
      toast({ title: "Servicio creado", description: "Tu servicio ya está disponible para reservas." });
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
  subcategoryId?: number | null;
  listingBio?: string;
  listingProfession?: string;
  listingYearsExperience?: number;
  listingSkills?: string[];
  listingPreparationLevel?: string;
  listingCertifications?: string;
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
      if (!res.ok) throw new Error("No se pudieron cargar tus servicios");
      return res.json() as Promise<ServiceWithProvider[]>;
    },
    retry: false,
    enabled: options?.enabled !== false,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    /** Tras alta/verificación, la lista puede tardar; reintentamos si sigue vacía. */
    refetchInterval: (query) => {
      const data = query.state.data as ServiceWithProvider[] | undefined;
      if (data === undefined) return false;
      return data.length === 0 ? 20_000 : false;
    },
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
        throw new Error(err.message || "No se pudo eliminar el servicio");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.services.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/services"] });
      debouncedRefetch(queryClient, [api.services.list.path]);
      debouncedRefetch(queryClient, ["/api/me/services"]);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.services.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.services.get.path, serviceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/services"] });
      debouncedRefetch(queryClient, [api.services.list.path]);
      debouncedRefetch(queryClient, [api.services.get.path, serviceId]);
      debouncedRefetch(queryClient, ["/api/me/services"]);
      toast({ title: "Servicio actualizado", description: "Los cambios se han guardado correctamente." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

/** PATCH /api/services/:id con cualquier id (p. ej. lista en dashboard). */
export function usePatchService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ serviceId, data }: { serviceId: number; data: ServiceUpdatePayload }) => {
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
        throw new Error((err as { message?: string }).message || "No se pudo actualizar el servicio");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.services.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.services.get.path, variables.serviceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/services"] });
      debouncedRefetch(queryClient, [api.services.list.path]);
      debouncedRefetch(queryClient, [api.services.get.path, variables.serviceId]);
      debouncedRefetch(queryClient, ["/api/me/services"]);
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
export function useBookings(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  return useQuery({
    queryKey: [api.bookings.list.path],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(api.bookings.list.path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("No se pudieron cargar las reservas");
      const json = await res.json();
      try {
        return api.bookings.list.responses[200].parse(json);
      } catch (e) {
        if (Array.isArray(json)) return json;
        throw e;
      }
    },
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
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
      if (!res.ok) throw new Error("No se pudieron cargar las reservas del asociado");
      return res.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** Mensajes de feedback al crear una reserva (centralizados para consistencia y mantenibilidad). */
const BOOKING_SUCCESS_TOAST = {
  title: "Reserva realizada con éxito",
  description: "El asociado ha sido notificado. Puedes ver el estado de tu reserva en Mi Cuenta → Mis Reservas.",
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
      if (!res.ok) throw new Error("No se pudo crear la reserva");
      return api.bookings.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bookings.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
      debouncedRefetch(queryClient, [api.bookings.list.path]);
      debouncedRefetch(queryClient, ["/api/bookings/provider"]);
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { message?: string }).message ?? "No se pudo actualizar el estado");
      }
      const parsed = api.bookings.updateStatus.responses[200].safeParse(json);
      return parsed.success ? parsed.data : json;
    },
    onSuccess: (data, { id, status }) => {
      const mergeBookingRow = (row: Record<string, unknown>) => {
        if (Number(row?.id) !== Number(id)) return row;
        const server = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
        return { ...row, ...server, status: (server.status as string) ?? status };
      };
      queryClient.setQueryData([api.bookings.list.path], (old: unknown) =>
        Array.isArray(old) ? old.map((b) => mergeBookingRow(b as Record<string, unknown>)) : old,
      );
      queryClient.setQueriesData({ queryKey: ["/api/bookings/provider"] }, (old: unknown) =>
        Array.isArray(old) ? old.map((b) => mergeBookingRow(b as Record<string, unknown>)) : old,
      );
      queryClient.setQueryData(["booking", id], (old: unknown) =>
        old && typeof old === "object" && !Array.isArray(old)
          ? mergeBookingRow(old as Record<string, unknown>)
          : mergeBookingRow({ id } as Record<string, unknown>),
      );

      queryClient.invalidateQueries({ queryKey: ["booking", id] });
      // Refrescar listas para alinear con servidor (caché ya optimista arriba).
      queryClient.invalidateQueries({ queryKey: [api.bookings.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
      queryClient.refetchQueries({ queryKey: [api.bookings.list.path] });
      queryClient.refetchQueries({ queryKey: ["/api/bookings/provider"] });
      if (status === "completed") {
        queryClient.invalidateQueries({ queryKey: [api.genfeb.wallet.me.path] });
        queryClient.invalidateQueries({ queryKey: ["/api/professional/stats"] });
        queryClient.invalidateQueries({ queryKey: RATINGS_PENDING_QUERY_KEY });
        debouncedRefetch(queryClient, [api.genfeb.wallet.me.path]);
        debouncedRefetch(queryClient, ["/api/professional/stats"]);
        void queryClient.refetchQueries({ queryKey: RATINGS_PENDING_QUERY_KEY });
      }
      toast({ title: "Estado actualizado", description: "El estado de la reserva se ha actualizado." });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "No se pudo cambiar el estado",
        description: message,
        variant: "destructive",
      });
    },
  });
}

/** Actualizar costo de una reserva (solo permitido para el profesional y solo si la reserva está pendiente). */
export function useUpdateBookingCost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, cost }: { id: number; cost: number }) => {
      const token = getToken();
      const res = await fetch(`/api/bookings/${id}/cost`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ cost: Number(cost) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "No se pudo actualizar el costo");
      }
      return res.json();
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["booking", id] });
      queryClient.invalidateQueries({ queryKey: [api.bookings.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
      debouncedRefetch(queryClient, [api.bookings.list.path]);
      debouncedRefetch(queryClient, ["/api/bookings/provider"]);
      toast({ title: "Costo actualizado", description: "El costo de la reserva se ha guardado correctamente." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

/** Actualizar fecha/hora de una reserva (solo profesional, solo si estado es 'pending'). */
export function useUpdateBookingSchedule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, date }: { id: number; date: string }) => {
      const token = getToken();
      const res = await fetch(`/api/bookings/${id}/schedule`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "No se pudo actualizar la fecha");
      }
      return res.json();
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["booking", id] });
      queryClient.invalidateQueries({ queryKey: [api.bookings.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
      debouncedRefetch(queryClient, [api.bookings.list.path]);
      debouncedRefetch(queryClient, ["/api/bookings/provider"]);
      toast({ title: "Fecha actualizada", description: "La fecha del servicio se ha guardado correctamente." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

/** Cliente confirma que acepta el último monto/fecha definidos por el profesional (reserva pendiente). */
export function useAcknowledgeBookingProChanges() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (bookingId: number) => {
      const token = getToken();
      const res = await fetch(`/api/bookings/${bookingId}/acknowledge-pro-changes`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || "No se pudo registrar tu aceptación");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bookings.list.path] });
      queryClient.refetchQueries({ queryKey: [api.bookings.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
      toast({
        title: "Cambios aceptados",
        description: "El asociado ya puede confirmar la reserva con el monto y la fecha acordados.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

/** Confirmación del cliente respecto a la reserva (endpoint puede incluir lógica de retención según backend). */
export function useConfirmBookingByClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (bookingId: number) => {
      const token = getToken();
      const res = await fetch(`/api/bookings/${bookingId}/confirm-client`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "No se pudo registrar la confirmación");
      return data;
    },
    onSuccess: (_data, bookingId) => {
      queryClient.invalidateQueries({ queryKey: ["booking", bookingId] });
      queryClient.invalidateQueries({ queryKey: [api.bookings.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
      queryClient.invalidateQueries({ queryKey: [api.genfeb.wallet.me.path] });
      queryClient.refetchQueries({ queryKey: [api.bookings.list.path] });
      queryClient.refetchQueries({ queryKey: ["/api/bookings/provider"] });
      queryClient.refetchQueries({ queryKey: [api.genfeb.wallet.me.path] });
      toast({
        title: "Confirmación registrada",
        description: "Tu conformidad quedó guardada. El asociado puede seguir con la reserva.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

// ==========================================
// WALLET
// ==========================================

/** Wallet y totalEarnings del usuario autenticado. */
export function useWallet(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [api.genfeb.wallet.me.path],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(api.genfeb.wallet.me.path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No se pudo cargar el Saldo Genfeb");
      return api.genfeb.wallet.me.responses[200].parse(await res.json());
    },
    enabled: options?.enabled !== false,
  });
}

// ==========================================
// RATINGS (calificaciones post-servicio)
// ==========================================

export type PendingRating = {
  bookingId: number;
  rateeUserId: string;
  rateeName: string;
  roleRated: "professional" | "client";
  serviceTitle?: string;
  completedAt?: string | Date;
};

/** Clave React Query para calificaciones pendientes (invalidar tras completar reserva, etc.). */
export const RATINGS_PENDING_QUERY_KEY = ["/api/ratings/pending"] as const;

export function usePendingRatings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: RATINGS_PENDING_QUERY_KEY,
    queryFn: async () => {
      const token = getToken();
      const res = await fetch("/api/ratings/pending", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No se pudieron cargar las calificaciones pendientes");
      const data = (await res.json()) as { pending: PendingRating[] };
      return data;
    },
    enabled: options?.enabled !== false,
    staleTime: 0,
    // Tras completar un servicio invalidamos esta query; el intervalo cubre al otro usuario (socket) y casos sin invalidación.
    refetchInterval: (q) => {
      const pendingLen = (q.state.data as { pending?: unknown[] } | undefined)?.pending?.length ?? 0;
      return pendingLen > 0 ? 4_000 : 30_000;
    },
  });
}

export function useSubmitRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      bookingId: number;
      ratedUserId: string;
      roleRated: "professional" | "client";
      stars: number;
    }) => {
      const token = getToken();
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Error al enviar la calificación");
      }
      return res.json() as Promise<{ ok: true }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RATINGS_PENDING_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [api.genfeb.wallet.me.path] });
      debouncedRefetch(queryClient, [...RATINGS_PENDING_QUERY_KEY]);
      debouncedRefetch(queryClient, [api.genfeb.wallet.me.path]);
    },
  });
}

const PROFESSIONAL_STATS_KEY = "/api/professional/stats";

const PROVIDER_COMPLETED_COUNT_BASE = "/api/providers";

/**
 * Cantidad de servicios completados por un proveedor.
 * Se usa como prueba social en listados públicos (Explore / Booking / ServiceDetails).
 */
export function useProviderCompletedCount(providerId: number | undefined) {
  return useQuery({
    queryKey: [PROVIDER_COMPLETED_COUNT_BASE, providerId],
    enabled: providerId != null && Number.isFinite(providerId),
    retry: false,
    queryFn: async () => {
      const res = await fetch(`${PROVIDER_COMPLETED_COUNT_BASE}/${providerId}/completed-count`);
      if (!res.ok) throw new Error("No se pudo cargar la cantidad de servicios completados");
      const data = (await res.json()) as { providerId: number; completedCount: number };
      return data.completedCount ?? 0;
    },
  });
}

/** Estadísticas del profesional: servicios completados, rechazados y ganancias totales. */
export function useProfessionalStats(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [PROFESSIONAL_STATS_KEY],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(PROFESSIONAL_STATS_KEY, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No se pudieron cargar las estadísticas del asociado");
      const data = await res.json();
      return data as {
        completedCount: number;
        rejectedCount: number;
        totalEarnings: number;
        earningsThisMonth?: number;
        earningsLastMonth?: number;
        pendingOrActiveCount?: number;
      };
    },
    enabled: options?.enabled !== false,
  });
}

/** Parámetros de listado de transferencias (paginado y filtros). */
export type WalletTransfersParams = {
  page?: number;
  limit?: number;
  transferType?: "service_payment" | "recharge";
  status?: "pending_approval" | "completed" | "rejected";
  description?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  enabled?: boolean;
};

/** Lista de transferencias del usuario (wallet), paginado. */
export function useWalletTransfers(params?: WalletTransfersParams) {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 10;
  const transferType = params?.transferType;
  const status = params?.status;
  const description = params?.description;
  const dateFrom = params?.dateFrom;
  const dateTo = params?.dateTo;
  const amountMin = params?.amountMin;
  const amountMax = params?.amountMax;
  return useQuery({
    queryKey: [
      "/api/wallet/transfers",
      page,
      limit,
      transferType,
      status,
      description,
      dateFrom,
      dateTo,
      amountMin,
      amountMax,
    ],
    queryFn: async () => {
      const token = getToken();
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("limit", String(limit));
      if (transferType) q.set("transferType", transferType);
      if (status) q.set("status", status);
      if (description?.trim()) q.set("description", description.trim());
      if (dateFrom) q.set("dateFrom", dateFrom);
      if (dateTo) q.set("dateTo", dateTo);
      if (amountMin != null && Number.isFinite(amountMin)) q.set("amountMin", String(amountMin));
      if (amountMax != null && Number.isFinite(amountMax)) q.set("amountMax", String(amountMax));
      const url = `/api/wallet/transfers?${q.toString()}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No se pudieron cargar los movimientos");
      return res.json() as Promise<{ transfers: any[]; total: number }>;
    },
    enabled: params?.enabled !== false,
  });
}

/** Envía solicitud de recarga (crea transferencia en aprobación). */
export function useRechargeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      amount: number;
      transferDate: string;
      transferTime?: string;
      transferCode?: string;
    }) => {
      const token = getToken();
      const res = await fetch(api.genfeb.wallet.rechargeRequest.path, {
        method: api.genfeb.wallet.rechargeRequest.method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Error al enviar la solicitud de recarga");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.genfeb.wallet.me.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transfers"] });
      debouncedRefetch(queryClient, [api.genfeb.wallet.me.path]);
      debouncedRefetch(queryClient, ["/api/wallet/transfers"]);
    },
  });
}

/** Solicitar retiro: mueve fondos de wallet a “en proceso de retiro” (retención hasta aprobación). Falla si ya hay retiro pendiente o saldo insuficiente. */
export function useWithdraw() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (amount: number) => {
      const token = getToken();
      const path = (api.genfeb.wallet as { withdraw?: { path: string; method: string } }).withdraw?.path ?? "/api/wallet/withdraw";
      const res = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Error al solicitar retiro");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.genfeb.wallet.me.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transfers"] });
      debouncedRefetch(queryClient, [api.genfeb.wallet.me.path]);
      debouncedRefetch(queryClient, ["/api/wallet/transfers"]);
    },
  });
}

// ==========================================
// ADMIN WALLET (transferencias / recargas)
// ==========================================

const ADMIN_WALLET_TRANSFERS_KEY = "/api/admin/wallet/transfers";
const ADMIN_DASHBOARD_STATS_KEY = "/api/admin/dashboard-stats";

export type AdminDashboardPeriod = "day" | "week" | "month" | "year";

export type AdminDashboardStatsResponse = {
  preset: AdminDashboardPeriod;
  range: { from: string; to: string };
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

/** Estadísticas del panel admin (solo administrador completo). */
export function useAdminDashboardStats(period: AdminDashboardPeriod, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [ADMIN_DASHBOARD_STATS_KEY, period],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(`${ADMIN_DASHBOARD_STATS_KEY}?period=${encodeURIComponent(period)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Error al cargar estadísticas");
      }
      return res.json() as Promise<AdminDashboardStatsResponse>;
    },
    enabled: options?.enabled !== false,
    staleTime: 60_000,
  });
}

/** Lista todas las transferencias de la plataforma (solo admin). */
export function useAdminWalletTransfers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [ADMIN_WALLET_TRANSFERS_KEY],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(ADMIN_WALLET_TRANSFERS_KEY, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Error al cargar transferencias");
      }
      return res.json() as Promise<{ transfers: any[]; total: number }>;
    },
    enabled: options?.enabled !== false,
  });
}

/** Actualiza el estado de una transferencia (solo admin). Aprobar/rechazar recargas. */
export function useUpdateTransferStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ transferId, status }: { transferId: string; status: "pending_approval" | "completed" | "rejected" }) => {
      const token = getToken();
      const url = `${ADMIN_WALLET_TRANSFERS_KEY}/${transferId}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Error al actualizar el estado");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ADMIN_WALLET_TRANSFERS_KEY] });
      queryClient.invalidateQueries({ queryKey: [ADMIN_DASHBOARD_STATS_KEY] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transfers"] });
      debouncedRefetch(queryClient, [ADMIN_WALLET_TRANSFERS_KEY]);
      debouncedRefetch(queryClient, ["/api/wallet/transfers"]);
    },
  });
}

/** Recarga manual por admin: acredita saldo a un usuario y registra la transacción con motivo (solo admin). */
export function useAdminManualRecharge() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (params: { userId: string; amount: number; reason: string; fromUserId: string }) => {
      const token = getToken();
      const res = await fetch("/api/wallet/transfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userId: params.userId,
          fromUserId: params.fromUserId,
          amount: params.amount,
          transferType: "recharge",
          status: "completed",
          description: params.reason,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Error al procesar la recarga");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ADMIN_WALLET_TRANSFERS_KEY] });
      queryClient.invalidateQueries({ queryKey: [ADMIN_DASHBOARD_STATS_KEY] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transfers"] });
      debouncedRefetch(queryClient, [ADMIN_WALLET_TRANSFERS_KEY]);
      debouncedRefetch(queryClient, ["/api/wallet/transfers"]);
    },
    onError: (err: Error) => {
      toast({ title: "Error en recarga manual", description: err.message, variant: "destructive" });
    },
  });
}

const ADMIN_WITHDRAWALS_KEY = "/api/admin/withdrawals";
const ADMIN_WITHDRAWALS_HISTORY_KEY = "/api/admin/withdrawals/history";

export type WithdrawalHistoryStatus = "all" | "pending" | "approved" | "rejected";

export type WithdrawalHistoryItem = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  bankName?: string;
  accountNumber?: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  processedAt: string | null;
  processedByAdminId?: string;
  processedByAdminName?: string;
};

/** Lista solicitudes de retiro pendientes (usuarios con withdrawingFunds > 0). Solo admin. */
export function useAdminWithdrawals(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [ADMIN_WITHDRAWALS_KEY],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(ADMIN_WITHDRAWALS_KEY, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Error al cargar solicitudes de retiro");
      }
      return res.json() as Promise<Array<{
        id: string;
        name: string;
        lastName: string;
        email: string;
        bankName?: string;
        accountNumber?: string;
        withdrawingFunds: number;
      }>>;
    },
    enabled: options?.enabled !== false,
  });
}

/** Aprobar o rechazar una solicitud de retiro (solo admin). adminNote opcional (ej. motivo de rechazo, datos bancarios incorrectos). */
export function useProcessWithdrawal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, action, adminNote }: { userId: string; action: "approve" | "reject"; adminNote?: string }) => {
      const token = getToken();
      const res = await fetch(`${ADMIN_WITHDRAWALS_KEY}/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action, ...(adminNote?.trim() ? { adminNote: adminNote.trim() } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Error al procesar la solicitud");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ADMIN_WITHDRAWALS_KEY] });
      queryClient.invalidateQueries({ queryKey: [ADMIN_WITHDRAWALS_HISTORY_KEY] });
      queryClient.invalidateQueries({ queryKey: [api.genfeb.wallet.me.path] });
      debouncedRefetch(queryClient, [ADMIN_WITHDRAWALS_KEY]);
      debouncedRefetch(queryClient, [ADMIN_WITHDRAWALS_HISTORY_KEY]);
      debouncedRefetch(queryClient, [api.genfeb.wallet.me.path]);
    },
  });
}

/** Historial de retiros (pendientes, aprobados, rechazados) con paginación y filtro. Solo admin. */
export function useAdminWithdrawalHistory(params: {
  page: number;
  limit: number;
  status: WithdrawalHistoryStatus;
  enabled?: boolean;
}) {
  const { page, limit, status, enabled = true } = params;
  return useQuery({
    queryKey: [ADMIN_WITHDRAWALS_HISTORY_KEY, page, limit, status],
    queryFn: async () => {
      const token = getToken();
      const search = new URLSearchParams({ page: String(page), limit: String(limit), status });
      const res = await fetch(`${ADMIN_WITHDRAWALS_HISTORY_KEY}?${search.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Error al cargar historial de retiros");
      }
      return res.json() as Promise<{
        items: WithdrawalHistoryItem[];
        total: number;
        page: number;
        limit: number;
      }>;
    },
    enabled: enabled !== false,
  });
}

// ========== Verificación de profesional ==========

/** Misma clave de caché que `useProfessionalVerification`. */
export const PROFESSIONAL_VERIFICATION_ME = "/api/me/professional-verification";
/** Exportado para fetch tras mutación (pago) y misma clave de caché que `useVerifyingStatusMe`. */
export const VERIFICATION_STATUS_ME = "/api/me/verifying-status";

export type ProfessionalVerificationDto = {
  userId: string;
  imageUrl: string | null;
  imageVerified: boolean;
  professionalCredentialUrl?: string | null;
  transferReceiptCode: string | null;
  transferDate: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type VerifyingStatusMeDto = {
  user: string;
  /** null para compat con docs viejos / sin requestType aún */
  requestType?: "onboarding" | "renewal" | null;
  identification_verified: "rejected" | "pending" | "verified";
  transacction_date: string | null;
  /** null = aún no hay intento de pago registrado */
  transacction_verified: "rejected" | "pending" | "verified" | null;
};

export function useVerifyingStatusMe(enabled: boolean) {
  return useQuery({
    queryKey: [VERIFICATION_STATUS_ME],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(VERIFICATION_STATUS_ME, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No se pudo cargar el estado de verificación");
      return res.json() as Promise<VerifyingStatusMeDto>;
    },
    enabled,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    /** Mientras el asociado sigue en flujo de verificación, el admin actualiza el servidor sin avisar al cliente. */
    refetchInterval: enabled ? 15_000 : false,
  });
}

export function useProfessionalVerification(enabled: boolean) {
  return useQuery({
    queryKey: [PROFESSIONAL_VERIFICATION_ME],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(PROFESSIONAL_VERIFICATION_ME, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.status === 403) return null;
      if (!res.ok) throw new Error("No se pudo cargar el estado de verificación");

      return (res.json() as Promise<ProfessionalVerificationDto | null>);
    },
    enabled,
  });
}

export function usePatchProfessionalVerificationImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (imageUrl: string) => {
      const token = getToken();
      const res = await fetch(`${PROFESSIONAL_VERIFICATION_ME}/image`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageUrl }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message || "Error al guardar la imagen");
      }

      return data as ProfessionalVerificationDto;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROFESSIONAL_VERIFICATION_ME] });
      queryClient.invalidateQueries({ queryKey: [VERIFICATION_STATUS_ME] });
    },
  });
}

export function usePatchProfessionalVerificationPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      transferReceiptCode: string;
      transferDate: string;
      subscriptionMonths: number;
      promotionalCode?: string;
      promotionalDiscountPercent?: number;
      subscriptionOriginalTotalUsd?: number;
      subscriptionDiscountedTotalUsd?: number;
    }) => {
      const token = getToken();
      const res = await fetch(`${PROFESSIONAL_VERIFICATION_ME}/payment`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message || "Error al registrar el pago");
      }

      return data as ProfessionalVerificationDto;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROFESSIONAL_VERIFICATION_ME] });
      queryClient.invalidateQueries({ queryKey: [VERIFICATION_STATUS_ME] });
    },
  });
}

export function usePatchProfessionalVerificationCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { professionalCredentialUrl: string; name?: string; mimeType?: string; size?: number }) => {
      const token = getToken();
      const res = await fetch(`${PROFESSIONAL_VERIFICATION_ME}/credential`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || "Error al guardar el documento profesional");
      return data as ProfessionalVerificationDto;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROFESSIONAL_VERIFICATION_ME] });
      queryClient.invalidateQueries({ queryKey: ["vault-documents"] });
    },
  });
}

// ==========================================
// COMISIÓN DE PLATAFORMA (configurable por admin)
// ==========================================

const PLATFORM_COMMISSION_QUERY_KEY = [api.platform.commissionRate.get.path] as const;

export type PlatformCommissionRateDto = {
  commissionRate: number;
  platformPercent: number;
  providerPercent: number;
};

export type MobilityFaresDto = {
  fares: {
    moto: { baseUsd: number; perKmUsd: number };
    auto: { baseDayUsd: number; baseNightUsd: number; perKmUsd: number; petExtraUsd: number };
    camioneta: { baseUsd: number; perKmUsd: number; petExtraUsd: number };
  };
};

/** Tasa vigente para textos y cálculos en UI (endpoint público de solo lectura). */
export function usePlatformCommissionRate(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: PLATFORM_COMMISSION_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(api.platform.commissionRate.get.path);
      if (!res.ok) throw new Error("No se pudo cargar la comisión");
      return res.json() as Promise<PlatformCommissionRateDto>;
    },
    staleTime: 30_000,
    enabled: options?.enabled !== false,
  });
}

const PLATFORM_MOBILITY_FARES_QUERY_KEY = [api.platform.mobilityFares.get.path] as const;

export function usePlatformMobilityFares(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: PLATFORM_MOBILITY_FARES_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(api.platform.mobilityFares.get.path);
      if (!res.ok) throw new Error("No se pudieron cargar las tarifas");
      return res.json() as Promise<MobilityFaresDto>;
    },
    staleTime: 30_000,
    enabled: options?.enabled !== false,
  });
}

export function usePatchPlatformMobilityFares() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fares: MobilityFaresDto["fares"]) => {
      const token = getToken();
      const res = await fetch(api.platform.mobilityFares.adminPatch.path, {
        method: api.platform.mobilityFares.adminPatch.method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ fares }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message ?? "Error al guardar tarifas");
      return data as MobilityFaresDto;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(PLATFORM_MOBILITY_FARES_QUERY_KEY, data);
      void queryClient.invalidateQueries({ queryKey: PLATFORM_MOBILITY_FARES_QUERY_KEY });
    },
  });
}

export function usePatchPlatformCommissionRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (platformPercent: number) => {
      const token = getToken();
      const res = await fetch(api.platform.commissionRate.adminPatch.path, {
        method: api.platform.commissionRate.adminPatch.method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ platformPercent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? "Error al guardar la comisión");
      }
      return data as PlatformCommissionRateDto;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(PLATFORM_COMMISSION_QUERY_KEY, data);
      void queryClient.invalidateQueries({ queryKey: PLATFORM_COMMISSION_QUERY_KEY });
    },
  });
}
