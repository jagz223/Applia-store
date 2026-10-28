import rateLimit, { type Options, type RateLimitRequestHandler } from "express-rate-limit";
import type { Request } from "express";

function envPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function isWebhookPath(req: Request): boolean {
  const path = req.path || "";
  return (
    path.includes("/webhooks/") ||
    path.includes("/webhook") ||
    path.startsWith("/api/store-payments/stripe") ||
    path.startsWith("/api/store-payments/paypal") ||
    path.startsWith("/api/store-payments/dlocalgo")
  );
}

const sharedDefaults: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
};

export function createApiRateLimiter(): RateLimitRequestHandler {
  const windowMs = envPositiveInt("RATE_LIMIT_API_WINDOW_MS", 60_000);
  const max = envPositiveInt("RATE_LIMIT_API_MAX", 120);
  return rateLimit({
    ...sharedDefaults,
    windowMs,
    max,
    skip: (req) => isWebhookPath(req),
    message: { message: "Demasiadas solicitudes. Intenta de nuevo en un momento." },
  });
}

export function createAuthRateLimiter(): RateLimitRequestHandler {
  const windowMs = envPositiveInt("RATE_LIMIT_AUTH_WINDOW_MS", 15 * 60_000);
  const max = envPositiveInt("RATE_LIMIT_AUTH_MAX", 20);
  return rateLimit({
    ...sharedDefaults,
    windowMs,
    max,
    message: { message: "Demasiados intentos de autenticación. Espera unos minutos." },
  });
}

export function createCheckoutRateLimiter(): RateLimitRequestHandler {
  const windowMs = envPositiveInt("RATE_LIMIT_CHECKOUT_WINDOW_MS", 60_000);
  const max = envPositiveInt("RATE_LIMIT_CHECKOUT_MAX", 10);
  return rateLimit({
    ...sharedDefaults,
    windowMs,
    max,
    message: { message: "Demasiados intentos de compra. Espera un momento." },
  });
}

export function resolveAllowedSocketOrigins(): string[] | boolean {
  const raw = [
    process.env.APP_ORIGIN,
    process.env.CLIENT_ORIGIN,
    process.env.APP_PUBLIC_URL,
    process.env.FRONTEND_URL,
    process.env.PUBLIC_SITE_URL,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim().replace(/\/$/, ""));

  const unique = [...new Set(raw)];
  if (unique.length === 0) {
    if (process.env.NODE_ENV === "production") return false;
    return ["http://localhost:5000", "http://127.0.0.1:5000"];
  }
  return unique;
}
