import type { StoreImageAsset, StoreImageTransform } from "@shared/store-image-asset";
import {
  DEFAULT_STORE_IMAGE_TRANSFORM,
  legacyDisplayUrlToStoreImageAsset,
  storeImageAssetHasOriginal,
} from "@shared/store-image-asset";

export type StoreImageDraft = {
  previewUrl: string;
  originalPreviewUrl?: string;
  pendingOriginalFile?: File;
  pendingDisplayFile?: File;
  savedOriginalUrl?: string;
  savedDisplayUrl?: string;
  transform?: StoreImageTransform;
};

export function revokeBlobPreview(url: string | null | undefined) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export function revokeBlobPreviews(drafts: StoreImageDraft[]) {
  for (const d of drafts) {
    revokeBlobPreview(d.previewUrl);
    revokeBlobPreview(d.originalPreviewUrl);
  }
}

export function isLikelyImageUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("blob:")) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function draftsFromSavedUrls(urls: string[]): StoreImageDraft[] {
  return urls.map((previewUrl) => ({
    previewUrl,
    savedDisplayUrl: previewUrl,
    transform: { ...DEFAULT_STORE_IMAGE_TRANSFORM },
  }));
}

export function draftFromStoreImageAsset(asset: StoreImageAsset): StoreImageDraft {
  return {
    previewUrl: asset.displayUrl,
    originalPreviewUrl: asset.originalUrl.trim() || undefined,
    savedDisplayUrl: asset.displayUrl,
    savedOriginalUrl: asset.originalUrl.trim() || undefined,
    transform: asset.transform ?? { ...DEFAULT_STORE_IMAGE_TRANSFORM },
  };
}

export function draftsFromStoreImageAssets(assets: StoreImageAsset[]): StoreImageDraft[] {
  return assets.map(draftFromStoreImageAsset);
}

export function draftHasEditableOriginal(draft: StoreImageDraft): boolean {
  return Boolean(draft.originalPreviewUrl?.trim() || draft.pendingOriginalFile || draft.savedOriginalUrl?.trim());
}

export function draftOriginalSource(draft: StoreImageDraft): string | null {
  if (draft.originalPreviewUrl?.trim()) return draft.originalPreviewUrl.trim();
  if (draft.savedOriginalUrl?.trim()) return draft.savedOriginalUrl.trim();
  return null;
}

export function storeImageDraftToAsset(draft: StoreImageDraft): StoreImageAsset | null {
  const displayUrl = (draft.savedDisplayUrl ?? draft.previewUrl)?.trim();
  if (!displayUrl || displayUrl.startsWith("blob:")) return null;
  const originalUrl = (draft.savedOriginalUrl ?? "").trim();
  return {
    originalUrl,
    displayUrl,
    transform: draft.transform ?? { ...DEFAULT_STORE_IMAGE_TRANSFORM },
  };
}

export function singularDraftFromSavedFields(input: {
  displayUrl?: string | null;
  originalUrl?: string | null;
  transform?: StoreImageTransform | null;
}): StoreImageDraft | null {
  const displayUrl = input.displayUrl?.trim();
  if (!displayUrl) return null;
  const originalUrl = input.originalUrl?.trim() || undefined;
  return {
    previewUrl: displayUrl,
    originalPreviewUrl: originalUrl,
    savedDisplayUrl: displayUrl,
    savedOriginalUrl: originalUrl,
    transform: input.transform ?? { ...DEFAULT_STORE_IMAGE_TRANSFORM },
  };
}

export function emptyDraftFromOriginalFile(file: File): StoreImageDraft {
  const originalPreviewUrl = URL.createObjectURL(file);
  return {
    previewUrl: originalPreviewUrl,
    originalPreviewUrl,
    pendingOriginalFile: file,
    transform: { ...DEFAULT_STORE_IMAGE_TRANSFORM },
  };
}

export function emptyDraftFromRemoteUrl(url: string): StoreImageDraft {
  const trimmed = url.trim();
  return {
    previewUrl: trimmed,
    originalPreviewUrl: trimmed,
    transform: { ...DEFAULT_STORE_IMAGE_TRANSFORM },
  };
}

export function applyCropResultToDraft(
  draft: StoreImageDraft,
  result: { file: File; transform: StoreImageTransform },
): StoreImageDraft {
  revokeBlobPreview(draft.previewUrl.startsWith("blob:") && draft.previewUrl !== draft.originalPreviewUrl
    ? draft.previewUrl
    : null);
  const previewUrl = URL.createObjectURL(result.file);
  return {
    ...draft,
    previewUrl,
    pendingDisplayFile: result.file,
    transform: result.transform,
  };
}

export function assetsOrLegacyFromProduct(product: {
  imageAssets?: StoreImageAsset[] | null;
  imageUrls?: string[] | null;
}): StoreImageAsset[] {
  if (Array.isArray(product.imageAssets) && product.imageAssets.length > 0) {
    return product.imageAssets.filter((a) => a.displayUrl?.trim());
  }
  return (product.imageUrls ?? [])
    .map((url) => legacyDisplayUrlToStoreImageAsset(url))
    .filter((a) => a.displayUrl.length > 0);
}

export type StoreImageUploadFn = (
  file: File,
  variant: "original" | "display",
) => Promise<string>;

export async function resolveStoreImageDraftToAsset(
  draft: StoreImageDraft,
  upload: StoreImageUploadFn,
): Promise<StoreImageAsset | null> {
  let originalUrl = (draft.savedOriginalUrl ?? "").trim();
  let displayUrl = (draft.savedDisplayUrl ?? "").trim();

  if (draft.pendingOriginalFile) {
    originalUrl = await upload(draft.pendingOriginalFile, "original");
  } else if (!originalUrl) {
    const source = draft.originalPreviewUrl?.trim();
    if (source && !source.startsWith("blob:")) originalUrl = source;
  }

  if (draft.pendingDisplayFile) {
    displayUrl = await upload(draft.pendingDisplayFile, "display");
  } else if (!displayUrl) {
    const preview = draft.previewUrl?.trim();
    if (preview && !preview.startsWith("blob:")) displayUrl = preview;
  }

  if (!displayUrl) return null;
  return {
    originalUrl,
    displayUrl,
    transform: draft.transform ?? { ...DEFAULT_STORE_IMAGE_TRANSFORM },
  };
}

export async function resolveStoreImageDraftsToAssets(
  drafts: StoreImageDraft[],
  upload: StoreImageUploadFn,
): Promise<StoreImageAsset[]> {
  const assets: StoreImageAsset[] = [];
  for (const draft of drafts) {
    const asset = await resolveStoreImageDraftToAsset(draft, upload);
    if (asset) assets.push(asset);
  }
  return assets;
}

export { storeImageAssetHasOriginal };
