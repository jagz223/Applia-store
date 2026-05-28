/** Query param para abrir el chat embebido en el shell Go sin ir a /chat. */
export const GO_CHAT_QUERY_PARAM = "goChat";

export function buildDesktopChatPath(conversationId: number | string): string {
  return `/chat?conversation=${encodeURIComponent(String(conversationId))}`;
}

export type MobilityRideChatModule = "taxi" | "delivery";

/** Ruta Go del pasajero según módulo del viaje. */
export function goRiderMobilityPath(module: MobilityRideChatModule | string | null | undefined): string {
  return module === "delivery" ? "/go/delivery" : "/go/taxi";
}

/**
 * URL push / deep link para chat de viaje Go: abre el drawer en la vista correcta.
 */
export function buildGoMobilityChatPath(
  conversationId: number | string,
  opts: {
    recipientUserId: string;
    module?: MobilityRideChatModule | string | null;
    driverUserId?: string | null;
  },
): string {
  const convId = encodeURIComponent(String(conversationId));
  const recipient = String(opts.recipientUserId ?? "").trim();
  const driver = String(opts.driverUserId ?? "").trim();
  const isDriver = driver !== "" && recipient === driver;
  const base = isDriver ? "/go/driver" : goRiderMobilityPath(opts.module);
  return `${base}?${GO_CHAT_QUERY_PARAM}=${convId}`;
}

/** Rutas del shell Go de movilidad (taxi/delivery/conductor), no tienda. */
export function isGoMobilityShellPath(pathname: string): boolean {
  const p = (pathname.split("?")[0] ?? "").trim();
  if (!p.startsWith("/go/")) return false;
  if (p === "/go/shop" || p.startsWith("/go/shop/")) return false;
  return true;
}
