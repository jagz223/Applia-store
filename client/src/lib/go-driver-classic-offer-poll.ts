import type { CargoRideOfferPayload } from "@/components/taxi/CargoIncomingRideDialog";
import { GO_CLASSIC_OFFER_POLL_MS } from "@shared/mobility-negotiation";

export { GO_CLASSIC_OFFER_POLL_MS };

export type ClassicOfferPollInput = {
  receiving: boolean;
  lat: number;
  lon: number;
  vehicleType: string;
  isPetFriendly?: boolean;
};

/** POST al servidor: heartbeat de presencia + asignación al más cercano + oferta pendiente. */
export async function pollClassicDriverOffer(
  module: "cargo" | "pack",
  input: ClassicOfferPollInput,
): Promise<CargoRideOfferPayload | null> {
  const token = localStorage.getItem("token");
  if (!token || !input.receiving || !input.vehicleType.trim()) return null;
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lon)) return null;

  const base = module === "pack" ? "/api/pack" : "/api/mobility";
  const res = await fetch(`${base}/driver/classic-offer-poll`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      receiving: true,
      lat: input.lat,
      lon: input.lon,
      vehicleType: input.vehicleType.trim(),
      isPetFriendly: !!input.isPetFriendly,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { offer?: CargoRideOfferPayload | null } | null;
  const offer = data?.offer ?? null;
  if (!offer?.rideId || offer.isNegotiated) return null;
  return offer;
}
