import type { GoDriverReceiveMode } from "@/lib/cargo-driver-storage";

export type DriverBubbleGlowAccent = "off" | "taxi" | "delivery" | "hybrid";

export function driverBubbleGlowAccent(
  mode: GoDriverReceiveMode,
  receiving: boolean,
): DriverBubbleGlowAccent {
  if (!receiving) return "off";
  if (mode === "taxi") return "taxi";
  if (mode === "delivery") return "delivery";
  if (mode === "both") return "hybrid";
  return "off";
}

export function driverBubbleGlowClassName(
  mode: GoDriverReceiveMode,
  receiving: boolean,
): string {
  const accent = driverBubbleGlowAccent(mode, receiving);
  return `driver-bubble-glow driver-bubble-glow--${accent}`;
}

/** Estilos inline para la ventana PiP (sin Tailwind). */
export function driverBubblePiPGlowKeyframesCss(): string {
  return `
    @keyframes driver-bubble-pip-glow-taxi {
      0%, 100% { box-shadow: 0 0 10px 3px rgba(14,165,233,0.45), 0 0 22px 6px rgba(14,165,233,0.28); }
      50% { box-shadow: 0 0 18px 8px rgba(14,165,233,0.95), 0 0 36px 14px rgba(14,165,233,0.5); }
    }
    @keyframes driver-bubble-pip-glow-delivery {
      0%, 100% { box-shadow: 0 0 10px 3px rgba(139,92,246,0.45), 0 0 22px 6px rgba(139,92,246,0.28); }
      50% { box-shadow: 0 0 18px 8px rgba(139,92,246,0.95), 0 0 36px 14px rgba(139,92,246,0.5); }
    }
    @keyframes driver-bubble-pip-glow-hybrid {
      0%, 100% {
        box-shadow: 0 0 12px 4px rgba(14,165,233,0.55), 0 0 24px 8px rgba(139,92,246,0.35);
      }
      50% {
        box-shadow: 0 0 20px 10px rgba(52,211,153,0.75), 0 0 38px 14px rgba(167,139,250,0.55);
      }
    }
    @keyframes driver-bubble-pip-glow-off {
      0%, 100% { box-shadow: 0 0 8px 2px rgba(100,116,139,0.35); }
      50% { box-shadow: 0 0 14px 5px rgba(100,116,139,0.55); }
    }
  `;
}

export function driverBubblePiPGlowAnimation(accent: DriverBubbleGlowAccent): string {
  switch (accent) {
    case "taxi":
      return "driver-bubble-pip-glow-taxi 1.35s ease-in-out infinite";
    case "delivery":
      return "driver-bubble-pip-glow-delivery 1.35s ease-in-out infinite";
    case "hybrid":
      return "driver-bubble-pip-glow-hybrid 1.35s ease-in-out infinite";
    default:
      return "driver-bubble-pip-glow-off 1.8s ease-in-out infinite";
  }
}
