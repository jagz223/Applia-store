/**
 * Cliente Genlook Virtual Try-On (https://genlook.app).
 * API key: GENLOOK_API_KEY (platform.genlook.app — créditos gratis al registrarse).
 */

const GENLOOK_BASE = "https://api.genlook.app/tryon/v1";

/** Guía de resolución para mensajes de error al usuario. */
export const TRYON_RESOLUTION_HINT =
  "Resolución recomendada: foto de cuerpo ≥ 1080×1440 px (lado corto ≥ 1000 px); prenda con lado corto ≥ 800–1000 px. Usa foto del móvil nítida, persona ocupando casi todo el encuadre (JPG/PNG/WebP, máx. 10 MB).";

export type TryOnImageKind = "person" | "garment" | "generation";

function getApiKey(): string | null {
  const key = process.env.GENLOOK_API_KEY?.trim();
  return key || null;
}

export function isGenlookConfigured(): boolean {
  return Boolean(getApiKey());
}

type GenlookErrorBody = {
  code?: string;
  message?: string;
  status?: number;
};

function imageLabel(kind: TryOnImageKind): string {
  if (kind === "person") return "foto de cuerpo";
  if (kind === "garment") return "foto de la prenda";
  return "generación";
}

function isLowResolutionMessage(raw: string): boolean {
  const t = raw.toLowerCase();
  return (
    t.includes("resolution") ||
    t.includes("too low") ||
    t.includes("resolución") ||
    t.includes("low quality") ||
    t.includes("too small")
  );
}

export function formatTryOnUserError(raw: string, kind: TryOnImageKind): string {
  const label = imageLabel(kind);
  if (isLowResolutionMessage(raw)) {
    return (
      `La ${label} tiene resolución demasiado baja (después del procesamiento). ` +
      `Sube una imagen más grande y nítida. ${TRYON_RESOLUTION_HINT}`
    );
  }
  if (kind === "generation") {
    return `No se pudo generar la simulación: ${raw} ${TRYON_RESOLUTION_HINT}`;
  }
  return `Error con la ${label}: ${raw} ${TRYON_RESOLUTION_HINT}`;
}

async function genlookFetch(path: string, init: RequestInit): Promise<Response> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("GENLOOK_API_KEY no configurada. Crea una cuenta en platform.genlook.app y añade la key al .env.");
  }
  const headers = new Headers(init.headers);
  headers.set("x-api-key", apiKey);
  return fetch(`${GENLOOK_BASE}${path}`, { ...init, headers });
}

async function readGenlookError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as GenlookErrorBody;
  if (body.code === "QUOTA_EXCEEDED" || body.code === "INSUFFICIENT_CREDITS") {
    return "Sin créditos Genlook. Recarga en platform.genlook.app.";
  }
  return body.message || `Error Genlook (${res.status}).`;
}

export async function uploadGenlookImage(
  bytes: Buffer,
  mimeType: string,
  fileName: string,
  options?: { crop?: boolean; imageKind?: TryOnImageKind },
): Promise<{ imageId: string; imageUrl: string }> {
  const kind = options?.imageKind ?? "person";
  const form = new FormData();
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  form.append("file", blob, fileName);
  if (options?.crop === false) form.append("crop", "false");

  const res = await genlookFetch("/images/upload", { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(formatTryOnUserError(await readGenlookError(res), kind));
  }
  const data = (await res.json()) as { imageId?: string; imageUrl?: string };
  if (!data.imageId || !data.imageUrl) {
    throw new Error(formatTryOnUserError("Genlook no devolvió imageId/imageUrl al subir la imagen.", kind));
  }
  return { imageId: data.imageId, imageUrl: data.imageUrl };
}

export async function createGenlookTryOn(params: {
  personImageId: string;
  garmentImageUrl: string;
  externalId?: string;
  title?: string;
}): Promise<{ generationId: string }> {
  const res = await genlookFetch("/try-on", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      products: [
        {
          externalId: params.externalId ?? `garment-${Date.now()}`,
          title: params.title ?? "Prenda",
          images: [{ source: { url: params.garmentImageUrl } }],
        },
      ],
      person: { image: { source: { id: params.personImageId } } },
    }),
  });
  if (!res.ok) {
    const raw = await readGenlookError(res);
    const kind: TryOnImageKind = isLowResolutionMessage(raw) ? "person" : "generation";
    throw new Error(formatTryOnUserError(raw, kind));
  }
  const data = (await res.json()) as { generationId?: string };
  if (!data.generationId) {
    throw new Error(formatTryOnUserError("Genlook no devolvió generationId.", "generation"));
  }
  return { generationId: data.generationId };
}

export async function waitForGenlookGeneration(
  generationId: string,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<{ resultImageUrl: string }> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const pollMs = options?.pollMs ?? 2_000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const res = await genlookFetch(`/generations/${encodeURIComponent(generationId)}`, {
      method: "GET",
    });
    if (!res.ok) {
      throw new Error(formatTryOnUserError(await readGenlookError(res), "generation"));
    }
    const data = (await res.json()) as {
      status?: string;
      resultImageUrl?: string;
      errorMessage?: string;
    };
    if (data.status === "COMPLETED" && data.resultImageUrl) {
      return { resultImageUrl: data.resultImageUrl };
    }
    if (data.status === "FAILED") {
      const raw = data.errorMessage || "La generación de try-on falló.";
      const kind: TryOnImageKind = isLowResolutionMessage(raw) ? "person" : "generation";
      throw new Error(formatTryOnUserError(raw, kind));
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    formatTryOnUserError("Tiempo de espera agotado generando la simulación.", "generation"),
  );
}

export async function runGenlookVirtualTryOn(params: {
  personBytes: Buffer;
  personMime: string;
  personFileName: string;
  garmentBytes: Buffer;
  garmentMime: string;
  garmentFileName: string;
}): Promise<{ resultImageUrl: string; generationId: string }> {
  const person = await uploadGenlookImage(params.personBytes, params.personMime, params.personFileName, {
    crop: true,
    imageKind: "person",
  });
  const garment = await uploadGenlookImage(
    params.garmentBytes,
    params.garmentMime,
    params.garmentFileName,
    { crop: false, imageKind: "garment" },
  );
  const { generationId } = await createGenlookTryOn({
    personImageId: person.imageId,
    garmentImageUrl: garment.imageUrl,
  });
  const { resultImageUrl } = await waitForGenlookGeneration(generationId);
  return { resultImageUrl, generationId };
}
