/**
 * Visibilidad de marcas/categorías (Fix Go / Man Go / Pro Go / Pack Go / Shop Go / Car Go).
 * Pack Go y Shop Go siguen forzadas ocultas por defecto en código; Car Go solo obedece Firestore + acciones admin.
 * Persistencia: Firestore (platform_settings/global). Fallback: valores por defecto en memoria.
 */
import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";
import { HIDDEN_CATEGORY_SLUGS_IN_UI } from "@shared/default-categories";

const DOC_ID = "global";
const FIELD = "hiddenCategorySlugs";
const ROLE_FIELD = "hiddenCategorySlugsByRole";

let cache: { value: string[]; at: number } | null = null;
const TTL_MS = 15_000;

let memoryOnlyHidden: string[] | null = null;
let memoryRoleHidden: Record<string, string[]> | null = null;

let roleCache: { value: Record<string, string[]>; at: number } | null = null;

function normalizeSlugs(slugs: unknown): string[] {
  if (!Array.isArray(slugs)) return [];
  const out = slugs
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  // unique
  return Array.from(new Set(out));
}

function normalizeRole(role: string): string {
  return String(role ?? "").trim();
}

function normalizeRoleMap(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const rk = normalizeRole(k);
    if (!rk) continue;
    out[rk] = normalizeSlugs(v);
  }
  return out;
}

function mergeHiddenSlugs(globalHidden: string[], roleHidden: string[]): string[] {
  return Array.from(new Set([...(globalHidden ?? []), ...(roleHidden ?? [])]));
}

/** Lista oculta efectiva: nunca puede ser más corta que las marcas desactivadas por defecto. */
function withDefaultHiddenSlugs(v: string[]): string[] {
  return Array.from(new Set([...HIDDEN_CATEGORY_SLUGS_IN_UI, ...v]));
}

export async function getHiddenCategorySlugs(): Promise<string[]> {
  const db = getFirestore();
  if (!db) {
    return memoryOnlyHidden ?? [...HIDDEN_CATEGORY_SLUGS_IN_UI];
  }
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS).doc(DOC_ID).get();
    if (!snap.exists) {
      const v = [...HIDDEN_CATEGORY_SLUGS_IN_UI];
      cache = { value: v, at: Date.now() };
      return v;
    }
    const raw = (snap.data() as Record<string, unknown> | undefined)?.[FIELD];
    const v = normalizeSlugs(raw);
    const effective = withDefaultHiddenSlugs(v);
    cache = { value: effective, at: Date.now() };
    return effective;
  } catch {
    return [...HIDDEN_CATEGORY_SLUGS_IN_UI];
  }
}

export function invalidateHiddenCategorySlugsCache(): void {
  cache = null;
}

export async function getHiddenCategorySlugsByRole(): Promise<Record<string, string[]>> {
  const db = getFirestore();
  if (!db) {
    return memoryRoleHidden ?? {};
  }
  if (roleCache && Date.now() - roleCache.at < TTL_MS) return roleCache.value;
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS).doc(DOC_ID).get();
    if (!snap.exists) {
      roleCache = { value: {}, at: Date.now() };
      return {};
    }
    const raw = (snap.data() as Record<string, unknown> | undefined)?.[ROLE_FIELD];
    const v = normalizeRoleMap(raw);
    roleCache = { value: v, at: Date.now() };
    return v;
  } catch {
    roleCache = { value: {}, at: Date.now() };
    return {};
  }
}

export async function getHiddenCategorySlugsForRole(role: string | undefined): Promise<string[]> {
  const globalHidden = await getHiddenCategorySlugs();
  const r = normalizeRole(role ?? "");
  if (!r || r === "admin") return globalHidden;
  const byRole = await getHiddenCategorySlugsByRole();
  const roleHidden = byRole[r] ?? [];
  return mergeHiddenSlugs(globalHidden, roleHidden);
}

export function invalidateHiddenCategorySlugsByRoleCache(): void {
  roleCache = null;
}

export async function setHiddenCategorySlugs(slugs: string[]): Promise<string[]> {
  const normalized = normalizeSlugs(slugs);
  const effective = withDefaultHiddenSlugs(normalized);
  const db = getFirestore();
  if (db) {
    await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS).doc(DOC_ID).set(
      {
        [FIELD]: normalized,
        updatedAt: new Date(),
      },
      { merge: true },
    );
  } else {
    memoryOnlyHidden = effective;
  }
  invalidateHiddenCategorySlugsCache();
  invalidateHiddenCategorySlugsByRoleCache();
  cache = { value: effective, at: Date.now() };
  return normalized;
}

export async function setHiddenCategorySlugsForRole(role: string, slugs: string[]): Promise<Record<string, string[]>> {
  const rk = normalizeRole(role);
  if (!rk) throw new Error("Rol inválido");
  if (rk === "admin") throw new Error("No se puede configurar ocultamiento para admin");

  const normalized = normalizeSlugs(slugs);
  const db = getFirestore();
  if (db) {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS).doc(DOC_ID).get();
    const current = snap.exists ? normalizeRoleMap((snap.data() as any)?.[ROLE_FIELD]) : {};
    const next: Record<string, string[]> = { ...current, [rk]: normalized };
    await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS).doc(DOC_ID).set(
      {
        [ROLE_FIELD]: next,
        updatedAt: new Date(),
      },
      { merge: true },
    );
  } else {
    const next = { ...(memoryRoleHidden ?? {}) };
    next[rk] = normalized;
    memoryRoleHidden = next;
  }
  invalidateHiddenCategorySlugsByRoleCache();
  return await getHiddenCategorySlugsByRole();
}

