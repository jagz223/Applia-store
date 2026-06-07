/** Borrador de imagen: vista previa local (blob) o URL remota; subida diferida hasta guardar. */
export type StoreImageDraft = {
  previewUrl: string;
  pendingFile?: File;
};

export function revokeBlobPreview(url: string | null | undefined) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export function revokeBlobPreviews(drafts: StoreImageDraft[]) {
  for (const d of drafts) revokeBlobPreview(d.previewUrl);
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
  return urls.map((previewUrl) => ({ previewUrl }));
}
