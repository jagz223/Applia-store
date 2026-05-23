import {
  CATEGORY_ICON_PNG_ERROR,
  assertCategoryIconFormatIsPng,
} from "@shared/category-icon-image";

/** Valida que la URL de icono sea PNG. */
export async function verifyCategoryIconImageUrl(
  url: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  return assertCategoryIconFormatIsPng(url.trim());
}

/** Valida un archivo local antes de subir (solo formato PNG). */
export async function verifyCategoryIconFile(
  file: File,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) {
    return { ok: false, message: CATEGORY_ICON_PNG_ERROR };
  }
  return { ok: true };
}
