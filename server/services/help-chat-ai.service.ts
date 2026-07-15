import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  HELP_AI_MODEL,
  HELP_AI_SYSTEM_INSTRUCTIONS,
  type HelpArticle,
  type HelpChatHistoryEntry,
} from "@shared/help-chat";

export type HelpChatAiInput = {
  userMessage: string;
  articles: HelpArticle[];
  history?: HelpChatHistoryEntry[];
};

export type HelpChatAiResult = {
  reply: string;
  suggestHumanSupport: boolean;
};

function buildContextBlock(articles: HelpArticle[]): string {
  if (articles.length === 0) {
    return "CONTEXTO: (sin artículos relevantes encontrados)";
  }

  const blocks = articles.map((article) => {
    const lines = [
      `[${article.id}] ${article.title}`,
      `Resumen: ${article.summary}`,
      article.steps.length ? `Pasos:\n- ${article.steps.join("\n- ")}` : null,
      article.notes.length ? `Notas:\n- ${article.notes.join("\n- ")}` : null,
    ].filter(Boolean);

    return lines.join("\n");
  });

  return `CONTEXTO (artículos de ayuda GenFeb):\n\n${blocks.join("\n\n---\n\n")}`;
}

function historyToGeminiContents(history: HelpChatHistoryEntry[] | undefined) {
  return (history ?? []).slice(-8).map((entry) => ({
    role: entry.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: entry.content }],
  }));
}

/**
 * Integración con Gemini (Single Responsibility: generación de respuesta).
 */
export class HelpChatAiService {
  private readonly modelName = HELP_AI_MODEL;

  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY?.trim());
  }

  async generateReply(input: HelpChatAiInput): Promise<HelpChatAiResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY no configurada");
    }

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: HELP_AI_SYSTEM_INSTRUCTIONS,
    });

    const contextBlock = buildContextBlock(input.articles);
    const prompt = [
      contextBlock,
      "",
      `Pregunta del usuario: ${input.userMessage}`,
      "",
      "Responde en español con lenguaje sencillo para usuarios finales. No menciones URLs ni rutas técnicas. Si el contexto no alcanza, indica que no tienes esa información y sugiere hablar con un asesor.",
    ].join("\n");

    const history = historyToGeminiContents(input.history);
    const chat = model.startChat({ history });

    const result = await chat.sendMessage(prompt);
    const reply = result.response.text().trim();

    const suggestHumanSupport =
      input.articles.length === 0 ||
      /asesor|soporte humano|no tengo esa informaci/i.test(reply);

    return { reply, suggestHumanSupport };
  }
}

export const helpChatAiService = new HelpChatAiService();
