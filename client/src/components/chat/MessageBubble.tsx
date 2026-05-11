import { Check, CheckCheck, ImageIcon, MapPin } from "lucide-react";

interface MessageBubbleProps {
  text: string;
  type?: string;
  time: string;
  isOwn: boolean;
  /** Mensaje del sistema: centrado, sin avatar, estilo distinto. */
  isSystem?: boolean;
  status?: string;
  avatarUrl?: string | null;
}

function parseLocationContent(content: string): { lat: number; lng: number; label?: string } | null {
  try {
    const data = JSON.parse(content) as { lat?: number; lng?: number; label?: string };
    if (typeof data?.lat === "number" && typeof data?.lng === "number") {
      return {
        lat: data.lat,
        lng: data.lng,
        label: typeof data.label === "string" && data.label.trim() ? data.label.trim() : undefined,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export function MessageBubble({ text, type, time, isOwn, isSystem = false, status = "sent", avatarUrl }: MessageBubbleProps) {
  const isImage = type === "image" && !isSystem;
  const isHttpUrl =
    /^https?:\/\//i.test(text.trim()) && !text.includes(" ") && text.length <= 4096;

  const isLocation = type === "location" && !isSystem;
  const location = isLocation ? parseLocationContent(text) : null;

  if (isSystem) {
    return (
      <div className="flex justify-center px-2 py-1" role="status" aria-label="Mensaje del sistema">
        <div className="max-w-[92%] rounded-lg border border-border/80 bg-muted/60 px-3 py-2 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sistema</p>
          <p className="mt-1 text-center text-sm leading-snug text-foreground whitespace-pre-wrap">{text}</p>
          <p className="mt-1 text-center text-[10px] text-muted-foreground">{time}</p>
        </div>
      </div>
    );
  }
  const mapsUrl = location
    ? `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=16/${location.lat}/${location.lng}`
    : null;

  return (
    <div className={`flex items-end gap-2 ${isOwn ? "justify-end" : "justify-start"}`}>
      {!isOwn ? (
        avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-border" />
        ) : (
          <div className="h-7 w-7 rounded-full bg-muted" aria-hidden />
        )
      ) : null}
      <div
        className={`
          max-w-[70%] p-3 rounded-2xl
          ${isOwn ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"}
        `}
      >
        {isLocation && mapsUrl ? (
          <div className="space-y-1">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-medium underline hover:opacity-90"
            >
              <MapPin className="w-4 h-4 shrink-0" />
              Ver en mapa
            </a>
            {location?.label ? (
              <p className="text-xs opacity-90 line-clamp-2">{location.label}</p>
            ) : null}
          </div>
        ) : isImage && isHttpUrl ? (
          <div className="space-y-2">
            <p className="text-xs font-medium flex items-center gap-1 opacity-90">
              <ImageIcon className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Comprobante de pago
            </p>
            <a
              href={text.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg overflow-hidden border border-white/20 max-w-[min(100%,280px)]"
            >
              <img
                src={text.trim()}
                alt="Comprobante de pago"
                className="w-full max-h-56 object-contain bg-black/10"
                loading="lazy"
              />
            </a>
            <p className="text-[10px] opacity-75">Abre la imagen para verla en tamaño completo</p>
          </div>
        ) : (
          <p className="text-sm break-words">{text}</p>
        )}
        <div
          className={`flex items-center justify-end gap-1 mt-1 ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}
        >
          <span className="text-xs">{time}</span>
          {isOwn &&
            (status === "read" ? (
              <CheckCheck className="w-3 h-3" />
            ) : status === "delivered" ? (
              <CheckCheck className="w-3 h-3 opacity-70" />
            ) : (
              <Check className="w-3 h-3" />
            ))}
        </div>
      </div>
      {isOwn ? (
        avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-border" />
        ) : (
          <div className="h-7 w-7 rounded-full bg-muted" aria-hidden />
        )
      ) : null}
    </div>
  );
}
