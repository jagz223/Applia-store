/** Resuelve la URL de imagen a mostrar para un banner/popup de vitrina. */

export function isLikelyImageUrl(value: string | null | undefined): boolean {
  const v = value?.trim();
  if (!v) return false;
  if (v.startsWith("blob:")) return true;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const path = u.pathname.toLowerCase();
    if (/\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|$)/i.test(path)) return true;
    // Algunos CDNs sirven imagen sin extensión clara en el path.
    if (/\/(image|img|photo|media|upload|psd)/i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

export function resolveShowcaseAdImageUrl(ad: {
  imageUrl?: string | null;
  linkUrl?: string | null;
}): string | null {
  const image = ad.imageUrl?.trim();
  if (image) return image;
  const link = ad.linkUrl?.trim();
  if (link && isLikelyImageUrl(link)) return link;
  return null;
}

/** Link de clic: solo si no es únicamente la URL usada como imagen. */
export function resolveShowcaseAdClickUrl(ad: {
  imageUrl?: string | null;
  linkUrl?: string | null;
}): string | null {
  const link = ad.linkUrl?.trim();
  if (!link) return null;
  const image = ad.imageUrl?.trim();
  if (!image && isLikelyImageUrl(link)) return null;
  return link;
}
