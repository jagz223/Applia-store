import type { GoDriverReceiveMode } from "@/lib/cargo-driver-storage";
import {
  isDriverBubbleOverlaySupported,
  shouldAutoMinimizeDriverBubbleOnHide,
} from "@/lib/go-driver-bubble-capability";
import {
  driverBubbleGlowAccent,
  driverBubblePiPGlowAnimation,
  driverBubblePiPGlowKeyframesCss,
} from "@/lib/driver-bubble-receive-accent";

/** Preferencia opcional: mantener burbuja aunque no se reciban servicios. */
const PINNED_IN_SETTINGS_KEY = "genfeb.driverGo.floatingBubble.enabled.v1";
const POSITION_KEY = "genfeb.driverGo.floatingBubble.position.v1";

declare global {
  interface Window {
    documentPictureInPicture?: {
      window: Window | null;
      requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
    };
  }
}

export type DriverBubblePosition = { x: number; y: number };

export function isDriverBubbleModeSupported(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${1023}px)`).matches;
}

export function isDriverDocumentPiPSupported(): boolean {
  return isDriverBubbleOverlaySupported();
}

export { isDriverBubbleOverlaySupported, shouldAutoMinimizeDriverBubbleOnHide };

/** Vista principal del conductor (no ajustes ni otras pantallas). */
export function isDriverBubbleMainPath(pathname: string): boolean {
  const p = (pathname.split("?")[0] ?? pathname).trim();
  if (p === "/go/driver" || p === "/driver/go-genfeb") return true;
  if (
    p.startsWith("/go/taxi/driver") ||
    p.startsWith("/go/cargo/driver") ||
    p.startsWith("/go/delivery/driver") ||
    p.startsWith("/go/pack/driver")
  ) {
    return !p.endsWith("/settings");
  }
  if (p.startsWith("/go/driver/") && !p.startsWith("/go/driver/settings")) return true;
  return false;
}

export function isAppHiddenForBubble(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden" || document.hidden;
}

export function readDriverBubblePinnedInSettings(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(PINNED_IN_SETTINGS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDriverBubblePinnedInSettings(pinned: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PINNED_IN_SETTINGS_KEY, pinned ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Burbuja activa: recibiendo servicios o fijada en ajustes del conductor. */
export function isDriverBubbleActive(receivingServices: boolean, pinnedInSettings: boolean): boolean {
  return receivingServices || pinnedInSettings;
}

export function readDriverBubblePosition(): DriverBubblePosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<DriverBubblePosition>;
    if (!Number.isFinite(j.x) || !Number.isFinite(j.y)) return null;
    return { x: j.x!, y: j.y! };
  } catch {
    return null;
  }
}

export function writeDriverBubblePosition(pos: DriverBubblePosition): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

export function defaultDriverBubblePosition(): DriverBubblePosition {
  const margin = 16;
  const size = 72;
  return {
    x: Math.max(margin, window.innerWidth - size - margin),
    y: Math.max(margin + 48, window.innerHeight * 0.55),
  };
}

const DRIVER_BUBBLE_PIP_SIZE = 72;

type OpenDriverBubblePiPOptions = {
  receiveMode: GoDriverReceiveMode;
  receiving: boolean;
  onActivate: () => void;
};

function renderDriverBubblePiPContent(
  doc: Document,
  receiveMode: GoDriverReceiveMode,
  receiving: boolean,
  onActivate: () => void,
): void {
  const accent = driverBubbleGlowAccent(receiveMode, receiving);
  const glowAnim = driverBubblePiPGlowAnimation(accent);

  doc.head.innerHTML = `<meta charset="utf-8" /><style>
      ${driverBubblePiPGlowKeyframesCss()}
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
      button {
        width: 100%; height: 100%; border: 0; padding: 0; cursor: pointer;
        border-radius: 9999px; overflow: hidden; background: #0f172a;
        animation: ${glowAnim};
      }
      img { width: 100%; height: 100%; object-fit: cover; display: block; }
    </style>`;

  doc.body.replaceChildren();
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Abrir panel conductor GenFeb");
  btn.dataset.accent = accent;
  const img = doc.createElement("img");
  img.src = "/genfeb-logo-new.png";
  img.alt = "";
  img.width = DRIVER_BUBBLE_PIP_SIZE;
  img.height = DRIVER_BUBBLE_PIP_SIZE;
  btn.appendChild(img);
  btn.addEventListener("click", onActivate);
  doc.body.appendChild(btn);
}

/** Ventana PiP sobre otras apps (Chrome Android). Puede requerir gesto del usuario en algunos navegadores. */
export async function openDriverBubblePiP({
  receiveMode,
  receiving,
  onActivate,
}: OpenDriverBubblePiPOptions): Promise<Window | null> {
  const api = window.documentPictureInPicture;
  if (!api?.requestWindow) return null;

  try {
    const pipWindow = await api.requestWindow({
      width: DRIVER_BUBBLE_PIP_SIZE,
      height: DRIVER_BUBBLE_PIP_SIZE,
    });
    const handleActivate = () => {
      onActivate();
      try {
        pipWindow.close();
      } catch {
        /* ignore */
      }
    };
    renderDriverBubblePiPContent(pipWindow.document, receiveMode, receiving, handleActivate);
    pipWindow.addEventListener("pagehide", () => {
      onActivate();
    });
    return pipWindow;
  } catch {
    return null;
  }
}

export function updateDriverBubblePiPContent(
  pipWindow: Window | null,
  receiveMode: GoDriverReceiveMode,
  receiving: boolean,
): void {
  if (!pipWindow?.document?.body) return;
  try {
    const btn = pipWindow.document.querySelector("button");
    if (!btn) return;
    const accent = driverBubbleGlowAccent(receiveMode, receiving);
    btn.setAttribute("data-accent", accent);
    (btn as HTMLElement).style.animation = driverBubblePiPGlowAnimation(accent);
  } catch {
    /* pip cerrada */
  }
}

export function closeDriverBubblePiP(): void {
  try {
    window.documentPictureInPicture?.window?.close();
  } catch {
    /* ignore */
  }
}
