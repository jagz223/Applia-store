/** Mensaje cuando la URL/imagen de icono de categoría no parece PNG. */
export const CATEGORY_ICON_PNG_ERROR = "Debe ser una imagen PNG (.png).";

/** Icono subido a nuestro Storage. */
export function isHostedCategoryIconUrl(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  return /firebasestorage\.googleapis\.com/i.test(t) && /category-icons/i.test(t);
}

/** La ruta de la URL termina en `.png` (requisito para iconos de categoría). */
export function categoryIconUrlLooksLikePng(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  if (isHostedCategoryIconUrl(t)) return true;
  try {
    const parsed = new URL(t);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const path = decodeURIComponent(parsed.pathname).toLowerCase();
    return path.endsWith(".png") || /\.png/i.test(path);
  } catch {
    return /\.png(\?|#|$)/i.test(t);
  }
}

/** Comprueba que la URL apunte a un PNG (por extensión). */
export function assertCategoryIconFormatIsPng(
  url: string,
): { ok: true } | { ok: false; message: string } {
  const t = url.trim();
  if (!t) return { ok: true };

  try {
    new URL(t);
  } catch {
    return { ok: false, message: CATEGORY_ICON_PNG_ERROR };
  }

  if (categoryIconUrlLooksLikePng(t)) return { ok: true };
  return { ok: false, message: CATEGORY_ICON_PNG_ERROR };
}

/** @deprecated Usar assertCategoryIconFormatIsPng. */
export async function assertCategoryIconImageUrlIsPng(
  url: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  return assertCategoryIconFormatIsPng(url);
}

/** URL apta para mostrar como icono de categoría (solo PNG). */
export function categoryIconImageUrlForDisplay(url: string | null | undefined): string | null {
  const t = String(url ?? "").trim();
  if (!t || !categoryIconUrlLooksLikePng(t)) return null;
  return t;
}
