import rawKnowledgeBase from "../../shared/help-articles.json";
import {
  helpKnowledgeBaseSchema,
  type HelpArticle,
  type HelpKnowledgeBase,
} from "@shared/help-chat";

/**
 * Catálogo inmutable de artículos de ayuda (Single Responsibility: carga y validación).
 */
export class HelpArticleCatalogService {
  private readonly knowledgeBase: HelpKnowledgeBase;

  constructor(source: unknown = rawKnowledgeBase) {
    this.knowledgeBase = helpKnowledgeBaseSchema.parse(source);
  }

  getArticles(): readonly HelpArticle[] {
    return this.knowledgeBase.articles;
  }

  getArticleById(id: string): HelpArticle | undefined {
    const key = id.trim();
    return this.knowledgeBase.articles.find((a) => a.id === key);
  }
}

export const helpArticleCatalogService = new HelpArticleCatalogService();
