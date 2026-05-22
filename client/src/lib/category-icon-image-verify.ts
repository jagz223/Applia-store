import {
  CATEGORY_ICON_CORS_ERROR,
  CATEGORY_ICON_PNG_ERROR,
  analyzeCategoryIconImageData,
  assertCategoryIconFormatIsPng,
  isHostedCategoryIconUrl,
} from "@shared/category-icon-image";

function loadImageForAnalysis(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load_failed"));
    img.src = url;
  });
}

async function verifyTransparencyInBrowser(url: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const img = await loadImageForAnalysis(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) {
      return { ok: false, message: CATEGORY_ICON_CORS_ERROR };
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return { ok: false, message: CATEGORY_ICON_CORS_ERROR };
    }
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);
    return analyzeCategoryIconImageData(data, w, h);
  } catch {
    return {
      ok: false,
      message: CATEGORY_ICON_CORS_ERROR,
    };
  }
}

/** Valida formato PNG y transparencia real (solo en navegador). */
export async function verifyCategoryIconImageUrl(
  url: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const t = url.trim();
  if (!t) return { ok: true };

  const format = await assertCategoryIconFormatIsPng(t);
  if (!format.ok) return format;

  if (typeof document === "undefined") {
    return format;
  }

  if (isHostedCategoryIconUrl(t)) {
    return { ok: true };
  }

  return verifyTransparencyInBrowser(t);
}

/** Valida un archivo local antes de subir (tipo PNG + transparencia real). */
export async function verifyCategoryIconFile(
  file: File,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (file.type !== "image/png") {
    return { ok: false, message: CATEGORY_ICON_PNG_ERROR };
  }
  if (!file.name.toLowerCase().endsWith(".png")) {
    return { ok: false, message: CATEGORY_ICON_PNG_ERROR };
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    return await verifyTransparencyInBrowser(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Solo transparencia (p. ej. ocultar en UI imágenes ya guardadas sin fondo real). */
export async function verifyCategoryIconTransparencyOnly(
  url: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const t = url.trim();
  if (!t) return { ok: true };
  if (typeof document === "undefined") return { ok: true };
  return verifyTransparencyInBrowser(t);
}
