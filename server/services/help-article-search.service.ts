import type { HelpArticle } from "@shared/help-chat";
import type { HelpArticleCatalogService } from "./help-article-catalog.service";

export type HelpArticleSearchResult = {
  article: HelpArticle;
  score: number;
};

const MIN_SCORE = 2;
const MAX_RESULTS = 3;

function normalizeText(input: string): string {
  return input
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(/[^a-z0-9áéíóúñ]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreArticle(article: HelpArticle, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;

  const title = normalizeText(article.title);
  const summary = normalizeText(article.summary);
  const keywordBlob = normalizeText(article.keywords.join(" "));
  const routeBlob = normalizeText(article.routes.join(" "));
  const stepsBlob = normalizeText(article.steps.join(" "));

  let score = 0;

  for (const token of queryTokens) {
    if (title.includes(token)) score += 4;
    if (keywordBlob.includes(token)) score += 3;
    if (routeBlob.includes(token)) score += 2;
    if (summary.includes(token)) score += 2;
    if (stepsBlob.includes(token)) score += 1;
  }

  return score;
}

/**
 * Búsqueda por palabras clave sobre el JSON de ayuda (sin embeddings).
 */
export class HelpArticleSearchService {
  constructor(private readonly catalog: HelpArticleCatalogService) {}

  search(query: string, limit = MAX_RESULTS): HelpArticleSearchResult[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const ranked = this.catalog
      .getArticles()
      .map((article) => ({
        article,
        score: scoreArticle(article, queryTokens),
      }))
      .filter((row) => row.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return ranked;
  }
}
