import { isCatalogAssignableServiceCategorySlug } from "./catalog-service-categories";
import { isMobilityGoDriverVehicleCategorySlug, MAN_GO_CATEGORY_SLUG } from "./default-categories";

export type ProviderCategorySlots = {
  categoryId?: number | null;
  category?: string | null;
  secondCategoryId?: number | null;
  thirdCategoryId?: number | null;
};

type CategoryRow = { id?: unknown; slug?: string | null };

function numId(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function slugForCategoryId(
  categoryId: number | null | undefined,
  categories: readonly CategoryRow[],
): string {
  const id = numId(categoryId);
  if (id == null) return "";
  const row = categories.find((c) => Number(c.id) === id);
  return String(row?.slug ?? "").trim().toLowerCase();
}

/** Todas las categorías de proveedor (principal + secundarias), sin duplicados. */
export function getProviderCategoryIds(
  provider: ProviderCategorySlots | null | undefined,
): number[] {
  if (!provider) return [];
  const ids = [
    numId(provider.categoryId),
    numId(provider.secondCategoryId),
    numId(provider.thirdCategoryId),
  ].filter((id): id is number => id != null);
  return [...new Set(ids)];
}

export function providerHasCategoryId(
  provider: ProviderCategorySlots | null | undefined,
  categoryId: number,
): boolean {
  const target = numId(categoryId);
  if (target == null) return false;
  return getProviderCategoryIds(provider).includes(target);
}

function isCatalogPrimarySlug(slug: string): boolean {
  return isCatalogAssignableServiceCategorySlug(slug);
}

/**
 * Añade una categoría al proveedor sin pisar Man Go / Pro Go como categoría principal.
 * Devuelve parche parcial para Firestore o null si ya estaba registrada.
 */
export function buildAddProviderCategoryPatch(
  provider: ProviderCategorySlots,
  newCategoryId: number,
  categories: readonly CategoryRow[],
): Partial<ProviderCategorySlots> | null {
  const addId = numId(newCategoryId);
  if (addId == null) return null;
  if (providerHasCategoryId(provider, addId)) return null;

  const newSlug = slugForCategoryId(addId, categories);
  const primaryId = numId(provider.categoryId);
  const primarySlug = slugForCategoryId(primaryId, categories);

  if (primaryId == null) {
    return { categoryId: addId, category: newSlug || (provider.category ?? null) };
  }

  if (numId(provider.secondCategoryId) == null) {
    return { secondCategoryId: addId };
  }
  if (numId(provider.thirdCategoryId) == null) {
    return { thirdCategoryId: addId };
  }

  const newIsCatalog = isCatalogPrimarySlug(newSlug);
  const primaryIsCatalog = isCatalogPrimarySlug(primarySlug);

  if (newIsCatalog && !primaryIsCatalog) {
    return {
      categoryId: addId,
      category: newSlug,
      secondCategoryId: primaryId,
      thirdCategoryId: numId(provider.thirdCategoryId),
    };
  }

  if (!newIsCatalog && primaryIsCatalog) {
    return { thirdCategoryId: addId };
  }

  return { thirdCategoryId: addId };
}

/**
 * Tras activar conductor Go: conserva Man Go / Pro Go en `categoryId` y registra movilidad en slots secundarios.
 */
export function buildGoDriverEnrollmentCategoryPatch(
  provider: ProviderCategorySlots,
  categories: readonly CategoryRow[],
): Partial<ProviderCategorySlots> {
  const transport = categories.find((c) => String(c.slug ?? "").toLowerCase() === "transport");
  const delivery = categories.find((c) => String(c.slug ?? "").toLowerCase() === "delivery");
  const transportId = numId(transport?.id);
  const deliveryId = numId(delivery?.id);

  let patch: Partial<ProviderCategorySlots> = {};
  let current = { ...provider, ...patch };

  if (transportId != null) {
    const p = buildAddProviderCategoryPatch(current, transportId, categories);
    if (p) {
      patch = { ...patch, ...p };
      current = { ...current, ...patch };
    }
  }
  if (deliveryId != null) {
    const p = buildAddProviderCategoryPatch(current, deliveryId, categories);
    if (p) patch = { ...patch, ...p };
  }

  const primarySlug = slugForCategoryId(numId(provider.categoryId), categories);
  if (isCatalogPrimarySlug(primarySlug)) {
    patch.category = primarySlug === MAN_GO_CATEGORY_SLUG ? MAN_GO_CATEGORY_SLUG : primarySlug;
  }

  return patch;
}

/**
 * Aprobación de vehículo / cambio mobility: no reemplazar Man Go / Pro Go como categoría principal.
 */
export function buildMobilityCategoryApprovalPatch(
  provider: ProviderCategorySlots,
  mobilityCategoryId: number,
  mobilitySlug: string,
  categories: readonly CategoryRow[],
): Partial<ProviderCategorySlots> {
  const primarySlug = slugForCategoryId(numId(provider.categoryId), categories);
  if (isCatalogPrimarySlug(primarySlug)) {
    return buildAddProviderCategoryPatch(provider, mobilityCategoryId, categories) ?? {};
  }
  if (!isMobilityGoDriverVehicleCategorySlug(mobilitySlug)) {
    return buildAddProviderCategoryPatch(provider, mobilityCategoryId, categories) ?? {
      categoryId: mobilityCategoryId,
      category: mobilitySlug,
    };
  }
  return {
    categoryId: mobilityCategoryId,
    category: mobilitySlug,
  };
}

/** Sincroniza slots a partir de las categorías de las fichas activas del asociado. */
export function buildSyncProviderSlotsFromServiceCategoryIds(
  provider: ProviderCategorySlots,
  serviceCategoryIds: readonly number[],
  categories: readonly CategoryRow[],
): Partial<ProviderCategorySlots> {
  const unique = [...new Set(serviceCategoryIds.map((id) => numId(id)).filter((id): id is number => id != null))];
  if (unique.length === 0) return {};

  const catalogIds = unique.filter((id) => isCatalogPrimarySlug(slugForCategoryId(id, categories)));
  const mobilityIds = unique.filter((id) => isMobilityGoDriverVehicleCategorySlug(slugForCategoryId(id, categories)));
  const otherIds = unique.filter((id) => !catalogIds.includes(id) && !mobilityIds.includes(id));

  const ordered = [...catalogIds, ...otherIds, ...mobilityIds];
  let working: ProviderCategorySlots = { ...provider };
  let patch: Partial<ProviderCategorySlots> = {};

  for (const id of ordered) {
    const step = buildAddProviderCategoryPatch(working, id, categories);
    if (step) {
      patch = { ...patch, ...step };
      working = { ...working, ...step };
    }
  }
  return patch;
}
