import type { QueryClient } from "@tanstack/react-query";

const timeouts: Record<string, ReturnType<typeof setTimeout>> = {};
const REFETCH_DEBOUNCE_MS = 500;

/** QueryKey puede ser string[] o incluir números (ej. chat messages). */
function toCacheKey(queryKey: readonly unknown[]): string {
  return queryKey.map(String).join("\0");
}

/**
 * Programa un refetch de la query tras un pequeño retraso.
 * Si se llama varias veces seguidas para la misma queryKey, solo se ejecuta un refetch.
 * Reduce carga en el servidor cuando hay muchas actualizaciones (mutaciones + socket) en poco tiempo.
 */
export function debouncedRefetch(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  delayMs: number = REFETCH_DEBOUNCE_MS
): void {
  const key = toCacheKey(queryKey);
  if (timeouts[key]) clearTimeout(timeouts[key]);
  timeouts[key] = setTimeout(() => {
    delete timeouts[key];
    void queryClient.refetchQueries({ queryKey });
  }, delayMs);
}
