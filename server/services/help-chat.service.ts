import type { HelpChatAskRequest, HelpChatAskResponse } from "@shared/help-chat";
import { helpArticleCatalogService, HelpArticleCatalogService } from "./help-article-catalog.service";
import { HelpArticleSearchService } from "./help-article-search.service";
import { helpChatAiService, HelpChatAiService } from "./help-chat-ai.service";

const FALLBACK_NO_AI =
  "Por ahora no puedo procesar tu consulta con IA. Usa el botón «Hablar con un asesor» para contactar al equipo de GenFeb.";

const FALLBACK_NO_MATCH =
  "No encontré información específica sobre eso en la guía de GenFeb. Te recomiendo hablar con un asesor humano usando el botón «Hablar con un asesor».";

/**
 * Orquesta búsqueda en JSON + respuesta IA (Facade / Application Service).
 */
export class HelpChatService {
  private readonly searchService: HelpArticleSearchService;

  constructor(
    catalog: HelpArticleCatalogService = helpArticleCatalogService,
    private readonly aiService: HelpChatAiService = helpChatAiService,
  ) {
    this.searchService = new HelpArticleSearchService(catalog);
  }

  async ask(payload: HelpChatAskRequest): Promise<HelpChatAskResponse> {
    const matches = this.searchService.search(payload.message);
    const matchedArticleIds = matches.map((m) => m.article.id);
    const articles = matches.map((m) => m.article);

    if (!this.aiService.isConfigured()) {
      if (articles.length === 0) {
        return {
          reply: FALLBACK_NO_MATCH,
          suggestHumanSupport: true,
          matchedArticleIds: [],
        };
      }

      const top = articles[0];
      const steps =
        top.steps.length > 0
          ? `\n\nPasos:\n${top.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
          : "";

      return {
        reply: `${top.summary}${steps}`,
        suggestHumanSupport: false,
        matchedArticleIds,
      };
    }

    if (articles.length === 0) {
      return {
        reply: FALLBACK_NO_MATCH,
        suggestHumanSupport: true,
        matchedArticleIds: [],
      };
    }

    try {
      const ai = await this.aiService.generateReply({
        userMessage: payload.message,
        articles,
        history: payload.history,
      });

      return {
        reply: ai.reply || FALLBACK_NO_MATCH,
        suggestHumanSupport: ai.suggestHumanSupport,
        matchedArticleIds,
      };
    } catch (error) {
      console.error("[help-chat] Gemini error:", error);
      return {
        reply: FALLBACK_NO_AI,
        suggestHumanSupport: true,
        matchedArticleIds,
      };
    }
  }
}

export const helpChatService = new HelpChatService();
