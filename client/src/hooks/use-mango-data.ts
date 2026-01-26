import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertProvider, type InsertService, type InsertBooking } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

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
export function useProviders(profession?: string) {
  return useQuery({
    queryKey: [api.providers.list.path, profession],
    queryFn: async () => {
      const url = buildUrl(api.providers.list.path) + (profession ? `?profession=${encodeURIComponent(profession)}` : "");
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
      const res = await fetch(api.providers.me.path, { credentials: "include" });
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
      const res = await fetch(api.providers.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
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
export function useServices(params?: { categoryId?: string; search?: string }) {
  return useQuery({
    queryKey: [api.services.list.path, params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.categoryId) queryParams.append("categoryId", params.categoryId);
      if (params?.search) queryParams.append("search", params.search);
      
      const url = `${api.services.list.path}?${queryParams.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch services");
      return api.services.list.responses[200].parse(await res.json());
    },
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
      const res = await fetch(api.services.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
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

// ==========================================
// BOOKINGS
// ==========================================
export function useBookings() {
  return useQuery({
    queryKey: [api.bookings.list.path],
    queryFn: async () => {
      const res = await fetch(api.bookings.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bookings");
      return api.bookings.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertBooking) => {
      const res = await fetch(api.bookings.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create booking");
      return api.bookings.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bookings.list.path] });
      toast({ title: "Booking Confirmed!", description: "The provider has been notified." });
    },
    onError: (err: Error) => {
      toast({ title: "Booking Failed", description: err.message, variant: "destructive" });
    }
  });
}

export function useUpdateBookingStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const url = buildUrl(api.bookings.updateStatus.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update status");
      return api.bookings.updateStatus.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bookings.list.path] });
      toast({ title: "Status Updated", description: "Booking status has been changed." });
    },
  });
}
