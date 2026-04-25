const HIDDEN_CONVERSATIONS_KEY = "hidden-conversations:v1";

function safeParseIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => (typeof x === "number" ? x : Number(x)))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

export function loadHiddenConversationIds(): number[] {
  if (typeof window === "undefined") return [];
  return safeParseIds(window.localStorage.getItem(HIDDEN_CONVERSATIONS_KEY));
}

export function addHiddenConversationId(conversationId: number): void {
  if (typeof window === "undefined") return;
  const id = Number(conversationId);
  if (!Number.isFinite(id) || id <= 0) return;
  const current = new Set(loadHiddenConversationIds());
  current.add(id);
  window.localStorage.setItem(HIDDEN_CONVERSATIONS_KEY, JSON.stringify(Array.from(current)));
}

export function isConversationHidden(conversationId: number): boolean {
  const id = Number(conversationId);
  if (!Number.isFinite(id) || id <= 0) return false;
  return new Set(loadHiddenConversationIds()).has(id);
}

