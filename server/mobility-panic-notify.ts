import { getIO, sendNotificationToAdmins } from "./socket";
import { genFebStorage } from "./storage-genfeb";
import { getFullAdminUsers } from "./staff-users";
import { notificationService } from "./services/notification.service";

const goPanicLastSent = new Map<string, number>();
const GO_PANIC_COOLDOWN_MS = 45_000;

function goPanicKey(rideId: string, userId: string): string {
  return `${rideId}:${userId}`;
}

/** Lanza PANIC_COOLDOWN si el mismo usuario ya envió alerta en este viaje hace poco. */
export function ensureGoPanicAllowed(rideId: string, userId: string): void {
  const k = goPanicKey(rideId, userId);
  const now = Date.now();
  const prev = goPanicLastSent.get(k) ?? 0;
  if (now - prev < GO_PANIC_COOLDOWN_MS) {
    const err = new Error("PANIC_COOLDOWN");
    (err as { statusCode?: number }).statusCode = 429;
    throw err;
  }
}

/** Llamar solo tras notificar con éxito. */
export function markGoPanicSent(rideId: string, userId: string): void {
  goPanicLastSent.set(goPanicKey(rideId, userId), Date.now());
}

export type GoPanicParty = {
  userId: string;
  name: string;
  phone: string | null;
  email?: string | null;
};

/**
 * Aviso crítico a administradores (socket sala `admin` + FCM a cada admin).
 * Lo atiende `POST /api/go/panic` en `routes.ts` (cuerpo JSON `{ rideId, module }`).
 */
export async function notifyGoPanicAdmins(params: {
  moduleLabel: "Taxi" | "Delivery";
  rideId: string;
  pressedBy: "rider" | "driver";
  rider: GoPanicParty;
  driver: GoPanicParty | null;
}): Promise<void> {
  const { moduleLabel, rideId, pressedBy, rider, driver } = params;
  const whoPressed: GoPanicParty | null = pressedBy === "rider" ? rider : driver;
  if (!whoPressed?.userId) return;

  const other: GoPanicParty | null =
    pressedBy === "rider"
      ? driver
      : { userId: rider.userId, name: rider.name, phone: rider.phone, email: rider.email };

  const detailLines = [
    `Servicio: ${moduleLabel} · ID viaje: ${rideId}`,
    `Pulsó el ${pressedBy === "rider" ? "pasajero/cliente" : "conductor"}: ${whoPressed.name} (ID ${whoPressed.userId}) · Tel: ${whoPressed.phone ?? "—"}`,
  ];
  if (pressedBy === "rider" && rider.email) {
    detailLines.push(`Email cliente: ${rider.email}`);
  }
  if (other) {
    detailLines.push(
      `${pressedBy === "rider" ? "Conductor asignado" : "Cliente del servicio"}: ${other.name} (ID ${other.userId}) · Tel: ${other.phone ?? "—"}`
    );
  }

  const details = detailLines.join("\n");
  const bodyPush = detailLines.join(" · ").slice(0, 380);
  const title = `Pánico Genfeb Go · ${moduleLabel}`;

  const io = getIO();
  if (io) {
    sendNotificationToAdmins(io, {
      type: "go_panic",
      id: `go-panic-${rideId}-${Date.now()}`,
      timestamp: new Date(),
      data: {
        rideId,
        module: moduleLabel,
        pressedBy,
        riderUserId: rider.userId,
        riderName: rider.name,
        riderPhone: rider.phone ?? "",
        riderEmail: rider.email ?? "",
        driverUserId: driver?.userId ?? "",
        driverName: driver?.name ?? "",
        driverPhone: driver?.phone ?? "",
        details,
      },
    });
  }

  try {
    const admins = await getFullAdminUsers(genFebStorage);
    await Promise.all(
      (admins ?? []).map((admin: { id?: string }) => {
        const aid = admin?.id != null ? String(admin.id) : "";
        if (!aid) return Promise.resolve();
        return notificationService.sendPushToUser(aid, {
          title,
          body: bodyPush,
          urgent: true,
          data: {
            type: "go_panic",
            url: "/admin",
            rideId,
            module: moduleLabel,
            pressedBy,
            riderUserId: rider.userId,
            riderName: rider.name,
            riderPhone: rider.phone ?? "",
            riderEmail: rider.email ?? "",
            driverUserId: driver?.userId ?? "",
            driverName: driver?.name ?? "",
            driverPhone: driver?.phone ?? "",
          },
        });
      })
    );
  } catch (e) {
    console.error("[go-panic] Error enviando push a admins:", e);
  }
}
