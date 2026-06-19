/**
 * Polling HTTP de ofertas clásicas (estilo tablero de regateo).
 * Render: el socket puede fallar; el conductor reporta presencia + recibe oferta por POST.
 */

import { z } from "zod";

export const classicOfferPollBodySchema = z.object({
  receiving: z.boolean(),
  lat: z.number(),
  lon: z.number(),
  vehicleType: z.string().min(1),
  isPetFriendly: z.boolean().optional(),
});

export type ClassicOfferPollBody = z.infer<typeof classicOfferPollBodySchema>;

export type ClassicOfferPollResponse = {
  offer: Record<string, unknown> | null;
};
