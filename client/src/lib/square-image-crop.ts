export const SQUARE_CROP_OUTPUT_SIZE = 1024;
/** Límite de archivo de entrada (antes del recorte). Alineado con reglas Firebase Storage (~200 MB). */
export const SQUARE_CROP_MAX_FILE_BYTES = 200 * 1024 * 1024;
/** Tras recortar a 1024×1024 el archivo suele ser pequeño; tope generoso por PNG con alfa. */
export const SQUARE_CROP_OUTPUT_MAX_BYTES = 25 * 1024 * 1024;

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    img.src = src;
  });
}

/** Muestrea el canvas: si hay píxeles con alfa &lt; 255, la imagen tiene transparencia. */
export function canvasImageHasTransparency(
  img: HTMLImageElement,
  sampleSize = 96,
): boolean {
  const w = Math.max(1, Math.min(img.naturalWidth || img.width, sampleSize));
  const h = Math.max(1, Math.min(img.naturalHeight || img.height, sampleSize));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: true });
  if (!ctx) return false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! < 250) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function clampSquareCrop(
  imgW: number,
  imgH: number,
  x: number,
  y: number,
  size: number,
): { x: number; y: number; size: number } {
  const maxSize = Math.min(imgW, imgH);
  const cropSize = Math.min(Math.max(size, 1), maxSize);
  const cropX = Math.max(0, Math.min(x, imgW - cropSize));
  const cropY = Math.max(0, Math.min(y, imgH - cropSize));
  return { x: cropX, y: cropY, size: cropSize };
}

/** Recorte cuadrado visible en el viewport (pan + zoom sobre la imagen). */
export function computeSquareCropFromViewport(
  imgW: number,
  imgH: number,
  viewportSize: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): { x: number; y: number; size: number } {
  const baseScale = Math.max(viewportSize / imgW, viewportSize / imgH);
  const scale = baseScale * zoom;
  const dispW = imgW * scale;
  const dispH = imgH * scale;
  const imgLeft = (viewportSize - dispW) / 2 + offsetX;
  const imgTop = (viewportSize - dispH) / 2 + offsetY;
  const cropX = -imgLeft / scale;
  const cropY = -imgTop / scale;
  const cropSize = viewportSize / scale;
  return clampSquareCrop(imgW, imgH, cropX, cropY, cropSize);
}

type CropOutputFormat = {
  mime: "image/jpeg" | "image/png" | "image/webp";
  quality?: number;
  ext: string;
};

/** JPEG no admite transparencia: PNG/WebP se exportan con alfa para no pintar negro. */
export function resolveSquareCropOutputFormat(fileName: string): CropOutputFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return { mime: "image/png", ext: "png" };
  if (lower.endsWith(".webp")) return { mime: "image/webp", quality: 0.92, ext: "webp" };
  if (lower.endsWith(".gif")) return { mime: "image/png", ext: "png" };
  return { mime: "image/jpeg", quality: 0.92, ext: "jpg" };
}

function withOutputExtension(fileName: string, ext: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim() || "producto";
  return `${base}.${ext}`;
}

export async function cropSquareImageToFile(
  imageSrc: string,
  crop: { x: number; y: number; size: number },
  fileName: string,
  outputSize = SQUARE_CROP_OUTPUT_SIZE,
): Promise<File> {
  const img = await loadImageElement(imageSrc);
  let format = resolveSquareCropOutputFormat(fileName);
  // Si el archivo se renombró a .jpg pero el contenido tiene alfa, conservar PNG.
  if (format.mime === "image/jpeg" && canvasImageHasTransparency(img)) {
    format = { mime: "image/png", ext: "png" };
  }
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d", { alpha: format.mime !== "image/jpeg" });
  if (!ctx) throw new Error("Canvas no disponible");
  if (format.mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outputSize, outputSize);
  } else {
    ctx.clearRect(0, 0, outputSize, outputSize);
  }
  ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, outputSize, outputSize);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo exportar la imagen."))),
      format.mime,
      format.quality,
    );
  });
  if (blob.size > SQUARE_CROP_OUTPUT_MAX_BYTES) {
    throw new Error("La imagen recortada es demasiado pesada. Prueba otra foto o reduce la calidad.");
  }
  const outName = withOutputExtension(fileName, format.ext);
  return new File([blob], outName, { type: format.mime });
}
