/**
 * Comprobación ligera de lenguaje inapropiado (español / inglés común).
 * No es exhaustiva; complementa la moderación humana.
 */
const DIACRITICS = /[\u0300-\u036f]/g;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Términos (normalizados sin acentos). Evitar entradas muy cortas para reducir falsos positivos. */
const BLOCKED_NORMALIZED = [
  "puta",
  "puto",
  "mierda",
  "joder",
  "cono",
  "cabron",
  "imbecil",
  "idiota",
  "estupido",
  "mamada",
  "pendejo",
  "culero",
  "verga",
  "chinga",
  "hijueputa",
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
];

export function containsProfanity(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const n = normalize(text);
  if (!n) return false;
  for (const b of BLOCKED_NORMALIZED) {
    if (b.length < 4) continue;
    if (n.includes(b)) return true;
  }
  const words = n.split(" ");
  for (const w of words) {
    if (w.length < 4) continue;
    for (const b of BLOCKED_NORMALIZED) {
      if (b.length >= 4 && (w === b || w.startsWith(b))) return true;
    }
  }
  return false;
}
