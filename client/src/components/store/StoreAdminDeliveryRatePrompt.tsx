import { useCallback, useEffect, useRef, useState } from "react";
import { GoRideRatingDialog } from "@/components/rating/GoRideRatingDialog";
import { useSocket } from "@/hooks/use-socket";
import { useToast } from "@/hooks/use-toast";

type PendingStoreDriverRate = {
  rideId: string;
  orderId: number;
  driverName: string;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function driverDisplayName(driver: {
  name: string;
  lastName?: string;
} | null | undefined): string {
  if (!driver) return "Conductor";
  return [driver.name, driver.lastName].filter(Boolean).join(" ").trim() || "Conductor";
}

export function StoreAdminDeliveryRatePrompt({ storeId }: { storeId: number }) {
  const { socket } = useSocket();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(5);
  const [busy, setBusy] = useState(false);
  const [targetName, setTargetName] = useState("Conductor");
  const pendingRef = useRef<PendingStoreDriverRate | null>(null);
  const shownRideIdsRef = useRef<Set<string>>(new Set());

  const openRatePrompt = useCallback((pending: PendingStoreDriverRate) => {
    if (shownRideIdsRef.current.has(pending.rideId)) return;
    shownRideIdsRef.current.add(pending.rideId);
    pendingRef.current = pending;
    setTargetName(pending.driverName);
    setStars(5);
    setOpen(true);
    window.dispatchEvent(new CustomEvent("store-admin:close-order-detail"));
  }, []);

  const resolvePendingFromDeliveryApi = useCallback(
    async (orderId: number, packRideId: string) => {
      if (shownRideIdsRef.current.has(packRideId)) return;
      try {
        const res = await fetch(`/api/stores/${storeId}/orders/${orderId}/delivery`, {
          headers: authHeaders(),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          packRide?: {
            id: string;
            ratedByRider?: boolean;
            driver?: { name: string; lastName?: string } | null;
          } | null;
        };
        const packRide = data.packRide;
        if (!packRide || packRide.id !== packRideId) return;
        if (packRide.ratedByRider) {
          shownRideIdsRef.current.add(packRideId);
          return;
        }
        openRatePrompt({
          rideId: packRideId,
          orderId,
          driverName: driverDisplayName(packRide.driver),
        });
      } catch {
        openRatePrompt({
          rideId: packRideId,
          orderId,
          driverName: "Conductor",
        });
      }
    },
    [storeId, openRatePrompt],
  );

  useEffect(() => {
    if (!socket || storeId <= 0) return;

    const handler = (payload: {
      storeId?: number;
      orderId?: number;
      eventType?: string;
      packRideId?: string | null;
    }) => {
      if (Number(payload?.storeId) !== storeId) return;
      if (payload?.eventType !== "driver_completed") return;
      if (!payload.orderId || !payload.packRideId) return;
      void resolvePendingFromDeliveryApi(payload.orderId, payload.packRideId);
    };

    socket.on("store:order:delivery:updated", handler);
    return () => {
      socket.off("store:order:delivery:updated", handler);
    };
  }, [socket, storeId, resolvePendingFromDeliveryApi]);

  const submitRating = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pack/rides/${encodeURIComponent(pending.rideId)}/rate`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ stars, target: "driver" }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "No se pudo enviar la calificación");
      setOpen(false);
      pendingRef.current = null;
      toast({ title: "¡Gracias!", description: "Calificación enviada al conductor." });
    } catch (e) {
      toast({
        title: "No se pudo enviar",
        description: e instanceof Error ? e.message : "Intenta de nuevo",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [stars, toast]);

  return (
    <GoRideRatingDialog
      open={open}
      module="delivery"
      perspective="rider"
      targetName={targetName}
      stars={stars}
      onStarsChange={setStars}
      onSubmit={() => void submitRating()}
      isSubmitting={busy}
    />
  );
}
