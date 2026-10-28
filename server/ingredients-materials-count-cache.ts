const INGREDIENTS_COUNT_TTL_MS = 60_000;

let cached: { at: number; total: number } | null = null;

export function getCachedIngredientsMaterialsCount(): number | null {
  if (!cached) return null;
  if (Date.now() - cached.at > INGREDIENTS_COUNT_TTL_MS) {
    cached = null;
    return null;
  }
  return cached.total;
}

export function setCachedIngredientsMaterialsCount(total: number): void {
  cached = { at: Date.now(), total };
}

export function invalidateIngredientsMaterialsCountCache(): void {
  cached = null;
}
