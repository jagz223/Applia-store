import { z } from "zod";

export const STORE_CURRENCY_USD_ID = "usd";
export const STORE_CURRENCY_EUR_ID = "eur";

export const STORE_BUILTIN_CURRENCY_IDS = [STORE_CURRENCY_USD_ID, STORE_CURRENCY_EUR_ID] as const;

export type StoreBuiltinCurrencyId = (typeof STORE_BUILTIN_CURRENCY_IDS)[number];

export const STORE_BUILTIN_CURRENCY_LABELS: Record<StoreBuiltinCurrencyId, string> = {
  [STORE_CURRENCY_USD_ID]: "Dollar",
  [STORE_CURRENCY_EUR_ID]: "Euro",
};

export function newStoreCurrencyExtraId(): string {
  return `extra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Cotización extra manual (ej. Binance → Bs). */
export const storeCurrencyExtraSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  value: z.string().trim().min(1, "El valor es obligatorio").max(40),
});

export type StoreCurrencyExtra = {
  id: string;
  name: string;
  value: string;
};

export const storeCurrencyExtrasSchema = z.array(storeCurrencyExtraSchema).max(30).default([]);

export function normalizeStoreCurrencyExtras(raw: unknown): StoreCurrencyExtra[] {
  if (!Array.isArray(raw)) return [];
  const out: StoreCurrencyExtra[] = [];
  const usedIds = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const name = String((item as { name?: unknown }).name ?? "").trim();
    const value = String((item as { value?: unknown }).value ?? "").trim();
    if (!name || !value) continue;
    let id = String((item as { id?: unknown }).id ?? "").trim().slice(0, 64);
    if (!id || usedIds.has(id) || id === STORE_CURRENCY_USD_ID || id === STORE_CURRENCY_EUR_ID) {
      id = newStoreCurrencyExtraId();
    }
    usedIds.add(id);
    out.push({ id, name: name.slice(0, 80), value: value.slice(0, 40) });
    if (out.length >= 30) break;
  }
  return out;
}

export function listKnownStoreCurrencyIds(extras: StoreCurrencyExtra[]): string[] {
  return [...STORE_BUILTIN_CURRENCY_IDS, ...extras.map((e) => e.id)];
}

export function normalizeStoreCurrencyAcceptedPaymentIds(
  raw: unknown,
  knownIds: string[],
): string[] {
  const known = new Set(knownIds);
  const source = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const item of source) {
    const id = String(item ?? "").trim();
    if (!id || !known.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  if (out.length === 0) {
    return known.has(STORE_CURRENCY_USD_ID) ? [STORE_CURRENCY_USD_ID] : knownIds.slice(0, 1);
  }
  return out;
}

export function normalizeStoreCurrencyVisualId(
  raw: unknown,
  acceptedPaymentIds: string[],
): string {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (id && acceptedPaymentIds.includes(id)) return id;
  if (acceptedPaymentIds.includes(STORE_CURRENCY_USD_ID)) return STORE_CURRENCY_USD_ID;
  return acceptedPaymentIds[0] ?? STORE_CURRENCY_USD_ID;
}

export type StoreCurrencyOption = {
  id: string;
  label: string;
  /** Tasa en Bs (string o número formateable). Vacío si aún no hay dato BCV. */
  rateBs: string | null;
  kind: "builtin" | "extra";
  acceptedAsPayment: boolean;
  visualInStore: boolean;
};

export function buildStoreCurrencyOptions(input: {
  extras: StoreCurrencyExtra[];
  visualCurrencyId: string;
  acceptedPaymentIds: string[];
  dollarRateBs?: number | null;
  euroRateBs?: number | null;
}): StoreCurrencyOption[] {
  const accepted = new Set(input.acceptedPaymentIds);
  const visual = input.visualCurrencyId;
  const builtins: StoreCurrencyOption[] = [
    {
      id: STORE_CURRENCY_USD_ID,
      label: STORE_BUILTIN_CURRENCY_LABELS[STORE_CURRENCY_USD_ID],
      rateBs: input.dollarRateBs != null ? String(input.dollarRateBs) : null,
      kind: "builtin",
      acceptedAsPayment: accepted.has(STORE_CURRENCY_USD_ID),
      visualInStore: visual === STORE_CURRENCY_USD_ID,
    },
    {
      id: STORE_CURRENCY_EUR_ID,
      label: STORE_BUILTIN_CURRENCY_LABELS[STORE_CURRENCY_EUR_ID],
      rateBs: input.euroRateBs != null ? String(input.euroRateBs) : null,
      kind: "builtin",
      acceptedAsPayment: accepted.has(STORE_CURRENCY_EUR_ID),
      visualInStore: visual === STORE_CURRENCY_EUR_ID,
    },
  ];
  const extras = input.extras.map((extra) => ({
    id: extra.id,
    label: extra.name,
    rateBs: extra.value,
    kind: "extra" as const,
    acceptedAsPayment: accepted.has(extra.id),
    visualInStore: visual === extra.id,
  }));
  return [...builtins, ...extras];
}

export function currencyLabelForId(id: string, extras: StoreCurrencyExtra[]): string {
  if (id === STORE_CURRENCY_USD_ID) return STORE_BUILTIN_CURRENCY_LABELS[STORE_CURRENCY_USD_ID];
  if (id === STORE_CURRENCY_EUR_ID) return STORE_BUILTIN_CURRENCY_LABELS[STORE_CURRENCY_EUR_ID];
  return extras.find((e) => e.id === id)?.name ?? id;
}

export function normalizeProductPricesByCurrency(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(key ?? "").trim();
    if (!id) continue;
    const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
    if (!Number.isFinite(n) || n <= 0) continue;
    out[id] = Math.round(n * 100) / 100;
  }
  return out;
}

export function resolveProductDisplayPrice(
  product: { price: number; pricesByCurrency?: Record<string, number> },
  visualCurrencyId: string,
): number {
  const map = product.pricesByCurrency ?? {};
  const fromVisual = map[visualCurrencyId];
  if (typeof fromVisual === "number" && Number.isFinite(fromVisual) && fromVisual > 0) {
    return fromVisual;
  }
  const fromUsd = map[STORE_CURRENCY_USD_ID];
  if (typeof fromUsd === "number" && Number.isFinite(fromUsd) && fromUsd > 0) {
    return fromUsd;
  }
  return Number(product.price) || 0;
}

/** Base URL oficial de DolarApi región Venezuela. */
export const DOLARAPI_VE_BASE = "https://ve.dolarapi.com";

export type BcvCurrencyRate = {
  currency: "USD" | "EUR";
  label: string;
  /** Precio de referencia en bolívares (Bs). */
  rateBs: number;
  updatedAt: string | null;
  source: "oficial";
};

function pickRate(raw: Record<string, unknown>): number | null {
  const candidates = [raw.promedio, raw.venta, raw.compra, raw.valor];
  for (const c of candidates) {
    const n = typeof c === "number" ? c : typeof c === "string" ? Number.parseFloat(c) : Number.NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function parseDolarApiRate(
  raw: unknown,
  currency: "USD" | "EUR",
  label: string,
): BcvCurrencyRate | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const rateBs = pickRate(data);
  if (rateBs == null) return null;
  const updatedAt =
    data.fechaActualizacion != null ? String(data.fechaActualizacion) : null;
  return {
    currency,
    label,
    rateBs,
    updatedAt,
    source: "oficial",
  };
}
