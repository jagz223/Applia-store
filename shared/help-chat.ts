import { z } from "zod";

/** Audiencias que pueden ver un artículo de ayuda. */
export const helpAudienceSchema = z.enum([
  "guest",
  "client",
  "professional",
  "driver",
  "central",
]);

export type HelpAudience = z.infer<typeof helpAudienceSchema>;

export const helpArticleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  audience: z.array(helpAudienceSchema).min(1),
  keywords: z.array(z.string()).min(1),
  routes: z.array(z.string()).default([]),
  steps: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

export type HelpArticle = z.infer<typeof helpArticleSchema>;

export const helpKnowledgeBaseSchema = z.object({
  version: z.number().int().positive(),
  locale: z.string().min(2),
  articles: z.array(helpArticleSchema).min(1),
});

export type HelpKnowledgeBase = z.infer<typeof helpKnowledgeBaseSchema>;

export const helpChatHistoryEntrySchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

export type HelpChatHistoryEntry = z.infer<typeof helpChatHistoryEntrySchema>;

export const helpChatAskRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(helpChatHistoryEntrySchema).max(12).optional(),
});

export type HelpChatAskRequest = z.infer<typeof helpChatAskRequestSchema>;

export const helpChatAskResponseSchema = z.object({
  reply: z.string(),
  suggestHumanSupport: z.boolean(),
  matchedArticleIds: z.array(z.string()),
});

export type HelpChatAskResponse = z.infer<typeof helpChatAskResponseSchema>;

export const HELP_AI_MODEL = "gemini-2.5-flash-lite" as const;

export const HELP_AI_SYSTEM_INSTRUCTIONS = `Eres el asistente de ayuda de GenFeb, una plataforma de servicios profesionales, taxi, delivery y tiendas en línea.

Reglas estrictas:
1. Responde SOLO con la información del contexto (artículos de ayuda). No inventes pasos ni precios.
2. Habla como guía para usuarios finales, NO para desarrolladores: lenguaje sencillo, amable y claro.
3. NUNCA menciones URLs, rutas técnicas, "slug", paths, APIs ni códigos de pantalla (ej. no digas "/tiendas" ni "/become-pro").
4. Explica cómo llegar usando menús y botones reales: "En la barra superior haz clic en Tiendas", "Abre tu foto de perfil (ícono redondo) → Mis pedidos de tienda".
5. Si das pasos, usa lista numerada corta. Máximo 6 oraciones salvo que pidan el detalle completo.
6. Si no está en el contexto, dilo con honestidad y sugiere "Hablar con un asesor".
7. No des consejos legales, médicos ni financieros.
8. Problemas graves (pago rechazado, cuenta bloqueada): sugiere soporte humano.`;
