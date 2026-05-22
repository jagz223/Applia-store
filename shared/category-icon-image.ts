/** Mensaje cuando la URL/imagen de icono de categoría no es PNG. */
export const CATEGORY_ICON_PNG_ERROR = "El archivo no es exclusivamente PNG";

/** PNG sin canal alfa real (fondo blanco, gris o cuadrícula «transparencia falsa»). */
export const CATEGORY_ICON_TRANSPARENCY_ERROR =
  "La imagen no tiene fondo transparente. Usa un PNG sin fondo blanco, gris ni cuadrícula.";

export const CATEGORY_ICON_CORS_ERROR =
  "No se pudo comprobar la imagen (acceso bloqueado). Prueba otra URL o un hosting que permita CORS.";

/** Icono subido a nuestro Storage (ya validado al subir). */
export function isHostedCategoryIconUrl(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  return /firebasestorage\.googleapis\.com/i.test(t) && /category-icons/i.test(t);
}

/** La ruta de la URL termina en `.png` (requisito mínimo para iconos con transparencia). */
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

function contentTypeIsPng(contentType: string): boolean {
  const ct = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  return ct === "image/png" || ct.includes("image/png");
}

function bytesLookLikePng(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf);
  return b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function isOpaqueBackgroundColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return min >= 180 && max - min <= 40;
}

/**
 * Analiza píxeles de un PNG cargado en canvas: exige transparencia real y rechaza
 * fondos blancos/grises o cuadrículas de «transparencia simulada».
 */
export function analyzeCategoryIconImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { ok: true } | { ok: false; message: string } {
  if (width < 1 || height < 1) {
    return { ok: false, message: CATEGORY_ICON_TRANSPARENCY_ERROR };
  }

  const total = width * height;
  let transparent = 0;
  let semiTransparent = 0;
  let opaqueBg = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (a < 20) {
      transparent++;
      continue;
    }
    if (a < 240) {
      semiTransparent++;
      continue;
    }
    if (isOpaqueBackgroundColor(r, g, b)) opaqueBg++;
  }

  const transparentRatio = transparent / total;
  const semiRatio = semiTransparent / total;
  const opaqueBgRatio = opaqueBg / total;

  if (opaqueBgRatio > 0.45 && transparentRatio < 0.06) {
    return { ok: false, message: CATEGORY_ICON_TRANSPARENCY_ERROR };
  }

  if (transparentRatio < 0.02 && semiRatio < 0.04) {
    return { ok: false, message: CATEGORY_ICON_TRANSPARENCY_ERROR };
  }

  const border = Math.max(2, Math.floor(Math.min(width, height) * 0.12));
  let borderTransparent = 0;
  let borderOpaqueBg = 0;
  let borderTotal = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onBorder = x < border || x >= width - border || y < border || y >= height - border;
      if (!onBorder) continue;
      borderTotal++;
      const idx = (y * width + x) * 4;
      const r = data[idx]!;
      const g = data[idx + 1]!;
      const b = data[idx + 2]!;
      const a = data[idx + 3]!;
      if (a < 200) borderTransparent++;
      else if (isOpaqueBackgroundColor(r, g, b)) borderOpaqueBg++;
    }
  }

  if (
    borderTotal > 0 &&
    borderTransparent / borderTotal < 0.1 &&
    borderOpaqueBg / borderTotal > 0.55
  ) {
    return { ok: false, message: CATEGORY_ICON_TRANSPARENCY_ERROR };
  }

  return { ok: true };
}

/** Comprueba por extensión, Content-Type o firma PNG (primeros bytes). */
export async function assertCategoryIconFormatIsPng(
  url: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const t = url.trim();
  if (!t) return { ok: true };

  try {
    new URL(t);
  } catch {
    return { ok: false, message: CATEGORY_ICON_PNG_ERROR };
  }

  if (categoryIconUrlLooksLikePng(t)) {
    try {
      const head = await fetch(t, { method: "HEAD" });
      const ct = head.headers.get("content-type") ?? "";
      if (head.ok && ct && !contentTypeIsPng(ct) && ct.toLowerCase().startsWith("image/")) {
        return { ok: false, message: CATEGORY_ICON_PNG_ERROR };
      }
      if (head.ok && contentTypeIsPng(ct)) return { ok: true };
    } catch {
      /* CORS o red: confiar en extensión .png */
    }
    return { ok: true };
  }

  try {
    const res = await fetch(t, { method: "GET", headers: { Range: "bytes=0-15" } });
    const ct = res.headers.get("content-type") ?? "";
    if (contentTypeIsPng(ct)) return { ok: true };
    const buf = await res.arrayBuffer();
    if (bytesLookLikePng(buf)) return { ok: true };
    if (ct.toLowerCase().startsWith("image/")) {
      return { ok: false, message: CATEGORY_ICON_PNG_ERROR };
    }
  } catch {
    /* sin acceso remoto */
  }

  return { ok: false, message: CATEGORY_ICON_PNG_ERROR };
}

/** @deprecated Usar assertCategoryIconFormatIsPng + verifyCategoryIconImageUrl en cliente. */
export const assertCategoryIconImageUrlIsPng = assertCategoryIconFormatIsPng;

/** URL apta para mostrar como icono de categoría (solo PNG; transparencia se valida al renderizar). */
export function categoryIconImageUrlForDisplay(url: string | null | undefined): string | null {
  const t = String(url ?? "").trim();
  if (!t || !categoryIconUrlLooksLikePng(t)) return null;
  return t;
}
