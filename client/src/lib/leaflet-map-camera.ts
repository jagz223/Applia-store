/** Clave estable para encuadre único (evita re-fit en cada ping GPS). */
export function mapBoundsFitKey(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): string {
  return `${a.lat.toFixed(5)},${a.lon.toFixed(5)}|${b.lat.toFixed(5)},${b.lon.toFixed(5)}`;
}

export function mapPointFitKey(p: { lat: number; lon: number }, zoom: number): string {
  return `${p.lat.toFixed(5)},${p.lon.toFixed(5)}|z${zoom}`;
}
