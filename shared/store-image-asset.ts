import { z } from "zod";

export const STORE_IMAGE_TRANSFORM_ZOOM_MIN = 0.2;
export const STORE_IMAGE_TRANSFORM_ZOOM_MAX = 4;

export const DEFAULT_STORE_IMAGE_TRANSFORM = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
} as const;

export const storeImageTransformSchema = z.object({
  zoom: z
    .number()
    .min(STORE_IMAGE_TRANSFORM_ZOOM_MIN)
    .max(STORE_IMAGE_TRANSFORM_ZOOM_MAX)
    .default(DEFAULT_STORE_IMAGE_TRANSFORM.zoom),
  offsetX: z.number().default(DEFAULT_STORE_IMAGE_TRANSFORM.offsetX),
  offsetY: z.number().default(DEFAULT_STORE_IMAGE_TRANSFORM.offsetY),
});

export type StoreImageTransform = z.infer<typeof storeImageTransformSchema>;

export const storeImageAssetSchema = z.object({
  originalUrl: z.string().trim().max(2000).optional().default(""),
  displayUrl: z.string().trim().min(1).max(2000),
  transform: storeImageTransformSchema.optional().default({ ...DEFAULT_STORE_IMAGE_TRANSFORM }),
});

export type StoreImageAsset = z.infer<typeof storeImageAssetSchema>;

export function normalizeStoreImageTransform(raw: unknown): StoreImageTransform {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_STORE_IMAGE_TRANSFORM };
  const zoomRaw = Number((raw as { zoom?: unknown }).zoom);
  const offsetXRaw = Number((raw as { offsetX?: unknown }).offsetX);
  const offsetYRaw = Number((raw as { offsetY?: unknown }).offsetY);
  const zoom = Number.isFinite(zoomRaw)
    ? Math.min(
        STORE_IMAGE_TRANSFORM_ZOOM_MAX,
        Math.max(STORE_IMAGE_TRANSFORM_ZOOM_MIN, zoomRaw),
      )
    : DEFAULT_STORE_IMAGE_TRANSFORM.zoom;
  return {
    zoom,
    offsetX: Number.isFinite(offsetXRaw) ? offsetXRaw : DEFAULT_STORE_IMAGE_TRANSFORM.offsetX,
    offsetY: Number.isFinite(offsetYRaw) ? offsetYRaw : DEFAULT_STORE_IMAGE_TRANSFORM.offsetY,
  };
}

export function legacyDisplayUrlToStoreImageAsset(displayUrl: string): StoreImageAsset {
  return {
    originalUrl: "",
    displayUrl: displayUrl.trim(),
    transform: { ...DEFAULT_STORE_IMAGE_TRANSFORM },
  };
}

export function normalizeStoreImageAsset(raw: unknown): StoreImageAsset | null {
  if (typeof raw === "string") {
    const displayUrl = raw.trim();
    if (!displayUrl) return null;
    return legacyDisplayUrlToStoreImageAsset(displayUrl);
  }
  if (!raw || typeof raw !== "object") return null;
  const displayUrl = String((raw as { displayUrl?: unknown }).displayUrl ?? "").trim();
  if (!displayUrl) return null;
  const originalUrl = String((raw as { originalUrl?: unknown }).originalUrl ?? "").trim();
  return {
    originalUrl,
    displayUrl,
    transform: normalizeStoreImageTransform((raw as { transform?: unknown }).transform),
  };
}

export function normalizeStoreImageAssets(
  raw: unknown,
  maxItems: number,
): StoreImageAsset[] {
  if (!Array.isArray(raw)) return [];
  const out: StoreImageAsset[] = [];
  for (const item of raw) {
    const asset = normalizeStoreImageAsset(item);
    if (!asset) continue;
    out.push(asset);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function storeImageAssetsToDisplayUrls(assets: readonly StoreImageAsset[]): string[] {
  return assets.map((asset) => asset.displayUrl).filter((url) => url.length > 0);
}

export function storeImageAssetHasOriginal(asset: StoreImageAsset | null | undefined): boolean {
  return Boolean(asset?.originalUrl?.trim());
}

export function resolveStoreImageAssetsFromProductInput(input: {
  imageAssets?: unknown;
  imageUrls?: unknown;
  maxImages: number;
}): StoreImageAsset[] {
  if (input.imageAssets != null) {
    return normalizeStoreImageAssets(input.imageAssets, input.maxImages);
  }
  if (Array.isArray(input.imageUrls)) {
    return normalizeStoreImageAssets(input.imageUrls, input.maxImages);
  }
  return [];
}

export function resolveSingularStoreImageFields(input: {
  displayUrl?: string | null;
  originalUrl?: string | null;
  transform?: unknown;
}): {
  imageUrl: string | null;
  imageOriginalUrl: string | null;
  imageTransform: StoreImageTransform | null;
} {
  const displayUrl = input.displayUrl?.trim() || null;
  if (!displayUrl) {
    return { imageUrl: null, imageOriginalUrl: null, imageTransform: null };
  }
  const originalUrl = input.originalUrl?.trim() || null;
  return {
    imageUrl: displayUrl,
    imageOriginalUrl: originalUrl,
    imageTransform: normalizeStoreImageTransform(input.transform),
  };
}
