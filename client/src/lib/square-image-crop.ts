import type { StoreImageTransform } from "@shared/store-image-asset";
import { DEFAULT_STORE_IMAGE_TRANSFORM } from "@shared/store-image-asset";

export const SQUARE_CROP_OUTPUT_SIZE = 1024;
export const FRAME_CROP_MAX_EDGE = 1024;
export const SQUARE_CROP_MAX_FILE_BYTES = 200 * 1024 * 1024;
export const SQUARE_CROP_OUTPUT_MAX_BYTES = 25 * 1024 * 1024;

export type FrameCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    img.src = src;
  });
}

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
    return true;
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

export function cropRectExtendsOutsideImage(
  imgW: number,
  imgH: number,
  crop: FrameCropRect | { x: number; y: number; size: number },
): boolean {
  const eps = 0.5;
  const width = "size" in crop ? crop.size : crop.width;
  const height = "size" in crop ? crop.size : crop.height;
  return (
    crop.x < -eps ||
    crop.y < -eps ||
    crop.x + width > imgW + eps ||
    crop.y + height > imgH + eps
  );
}

export function computeFrameCropFromViewport(
  imgW: number,
  imgH: number,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): FrameCropRect {
  const baseScale = Math.max(viewportWidth / imgW, viewportHeight / imgH);
  const scale = baseScale * Math.max(zoom, 0.05);
  const dispW = imgW * scale;
  const dispH = imgH * scale;
  const imgLeft = (viewportWidth - dispW) / 2 + offsetX;
  const imgTop = (viewportHeight - dispH) / 2 + offsetY;
  return {
    x: -imgLeft / scale,
    y: -imgTop / scale,
    width: viewportWidth / scale,
    height: viewportHeight / scale,
  };
}

export function computeSquareCropFromViewport(
  imgW: number,
  imgH: number,
  viewportSize: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): { x: number; y: number; size: number } {
  const rect = computeFrameCropFromViewport(
    imgW,
    imgH,
    viewportSize,
    viewportSize,
    zoom,
    offsetX,
    offsetY,
  );
  return { x: rect.x, y: rect.y, size: rect.width };
}

type CropOutputFormat = {
  mime: "image/jpeg" | "image/png" | "image/webp";
  quality?: number;
  ext: string;
};

export function resolveSquareCropOutputFormat(
  fileName: string,
  mimeType?: string,
): CropOutputFormat {
  const mime = (mimeType ?? "").toLowerCase().split(";")[0]?.trim();
  if (mime === "image/png" || mime === "image/gif") return { mime: "image/png", ext: "png" };
  if (mime === "image/webp") return { mime: "image/webp", quality: 0.92, ext: "webp" };
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

function resolveOutputDimensions(
  cropWidth: number,
  cropHeight: number,
  maxEdge: number,
): { outW: number; outH: number } {
  const safeW = Math.max(1, cropWidth);
  const safeH = Math.max(1, cropHeight);
  const longest = Math.max(safeW, safeH);
  if (longest <= maxEdge) {
    return { outW: Math.round(safeW), outH: Math.round(safeH) };
  }
  const scale = maxEdge / longest;
  return {
    outW: Math.max(1, Math.round(safeW * scale)),
    outH: Math.max(1, Math.round(safeH * scale)),
  };
}

export async function cropFrameImageToFile(
  imageSrc: string,
  crop: FrameCropRect,
  fileName: string,
  options?: { maxEdge?: number; mimeType?: string },
): Promise<File> {
  const maxEdge = options?.maxEdge ?? FRAME_CROP_MAX_EDGE;
  const img = await loadImageElement(imageSrc);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const needsAlpha =
    canvasImageHasTransparency(img) || cropRectExtendsOutsideImage(srcW, srcH, crop);
  let format = resolveSquareCropOutputFormat(fileName, options?.mimeType);
  if (needsAlpha && format.mime === "image/jpeg") {
    format = { mime: "image/png", ext: "png" };
  }
  const { outW, outH } = resolveOutputDimensions(crop.width, crop.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { alpha: format.mime !== "image/jpeg" });
  if (!ctx) throw new Error("Canvas no disponible");
  if (format.mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
  } else {
    ctx.clearRect(0, 0, outW, outH);
  }
  const destScaleX = outW / Math.max(crop.width, 1);
  const destScaleY = outH / Math.max(crop.height, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    0,
    0,
    srcW,
    srcH,
    -crop.x * destScaleX,
    -crop.y * destScaleY,
    srcW * destScaleX,
    srcH * destScaleY,
  );
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
  return new File([blob], withOutputExtension(fileName, format.ext), { type: format.mime });
}

export async function cropSquareImageToFile(
  imageSrc: string,
  crop: { x: number; y: number; size: number },
  fileName: string,
  options?: { outputSize?: number; mimeType?: string },
): Promise<File> {
  return cropFrameImageToFile(
    imageSrc,
    { x: crop.x, y: crop.y, width: crop.size, height: crop.size },
    fileName,
    {
      maxEdge: options?.outputSize ?? SQUARE_CROP_OUTPUT_SIZE,
      mimeType: options?.mimeType,
    },
  );
}

export function normalizeCropTransform(
  transform?: Partial<StoreImageTransform> | null,
): StoreImageTransform {
  if (!transform) return { ...DEFAULT_STORE_IMAGE_TRANSFORM };
  const zoom = Number(transform.zoom);
  const offsetX = Number(transform.offsetX);
  const offsetY = Number(transform.offsetY);
  return {
    zoom: Number.isFinite(zoom) ? zoom : DEFAULT_STORE_IMAGE_TRANSFORM.zoom,
    offsetX: Number.isFinite(offsetX) ? offsetX : DEFAULT_STORE_IMAGE_TRANSFORM.offsetX,
    offsetY: Number.isFinite(offsetY) ? offsetY : DEFAULT_STORE_IMAGE_TRANSFORM.offsetY,
  };
}
