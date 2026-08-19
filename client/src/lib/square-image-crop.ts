export const SQUARE_CROP_OUTPUT_SIZE = 1024;
export const SQUARE_CROP_MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    img.src = src;
  });
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

export async function cropSquareImageToFile(
  imageSrc: string,
  crop: { x: number; y: number; size: number },
  fileName: string,
  outputSize = SQUARE_CROP_OUTPUT_SIZE,
): Promise<File> {
  const img = await loadImageElement(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, outputSize, outputSize);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo exportar la imagen."))),
      "image/jpeg",
      0.92,
    );
  });
  if (blob.size > SQUARE_CROP_MAX_FILE_BYTES) {
    throw new Error("La imagen recortada supera 5 MB. Reduce el zoom o usa otra foto.");
  }
  return new File([blob], fileName, { type: "image/jpeg" });
}
