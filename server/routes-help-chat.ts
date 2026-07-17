import type { Express, Request, Response } from "express";
import { helpChatAskRequestSchema } from "@shared/help-chat";
import { helpChatService } from "./services/help-chat.service";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

type RateBucket = { count: number; resetAt: number };
const rateByIp = new Map<string, RateBucket>();

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.ip || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateByIp.get(ip);

  if (!bucket || now >= bucket.resetAt) {
    rateByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) return true;
  return false;
}

export function registerHelpChatRoutes(app: Express): void {
  app.post("/api/help/ask", async (req: Request, res: Response) => {
    try {
      const ip = clientIp(req);
      if (isRateLimited(ip)) {
        return res.status(429).json({ message: "Demasiadas consultas. Espera un momento e intenta de nuevo." });
      }

      const parsed = helpChatAskRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Solicitud inválida",
          errors: parsed.error.flatten(),
        });
      }

      const result = await helpChatService.ask(parsed.data);
      return res.json(result);
    } catch (error) {
      console.error("[help-chat] POST /api/help/ask:", error);
      return res.status(500).json({ message: "No se pudo procesar la consulta de ayuda" });
    }
  });
}
