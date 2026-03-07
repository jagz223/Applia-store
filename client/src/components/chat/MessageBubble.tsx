import { Check, CheckCheck, MapPin } from "lucide-react";

interface MessageBubbleProps {
  text: string;
  type?: string;
  time: string;
  isOwn: boolean;
  status?: string;
}

function parseLocationContent(content: string): { lat: number; lng: number } | null {
  try {
    const data = JSON.parse(content) as { lat?: number; lng?: number };
    if (typeof data?.lat === "number" && typeof data?.lng === "number") return { lat: data.lat, lng: data.lng };
  } catch {
    // ignore
  }
  return null;
}

export function MessageBubble({ text, type, time, isOwn, status = "sent" }: MessageBubbleProps) {
  const isLocation = type === "location";
  const location = isLocation ? parseLocationContent(text) : null;
  const mapsUrl = location ? `https://www.google.com/maps?q=${location.lat},${location.lng}` : null;

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`
          max-w-[70%] p-3 rounded-2xl
          ${isOwn ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"}
        `}
      >
        {isLocation && mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-medium underline hover:opacity-90"
          >
            <MapPin className="w-4 h-4 shrink-0" />
            Ver ubicación
          </a>
        ) : (
          <p className="text-sm">{text}</p>
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
    </div>
  );
}
