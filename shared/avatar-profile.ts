/** Tiempo mínimo entre cambios de foto de perfil (subida o URL externa). */
export const AVATAR_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const HOSTED_AVATAR_PATTERNS = [
  /firebasestorage\.googleapis\.com/i,
  /storage\.googleapis\.com/i,
  /\.appspot\.com/i,
  /firebase/i,
];

/** URL alojada en nuestro Storage / Firebase (no mostrar como enlace editable al usuario). */
export function isHostedStorageAvatarUrl(url: string | null | undefined): boolean {
  const u = String(url ?? "").trim();
  if (!u) return false;
  return HOSTED_AVATAR_PATTERNS.some((re) => re.test(u));
}

export function isExternalAvatarUrl(url: string | null | undefined): boolean {
  const u = String(url ?? "").trim();
  if (!u) return false;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  } catch {
    return false;
  }
  return !isHostedStorageAvatarUrl(u);
}

export function avatarCooldownRemainingMs(lastChangedAt: string | Date | null | undefined): number {
  if (!lastChangedAt) return 0;
  const ms =
    lastChangedAt instanceof Date
      ? lastChangedAt.getTime()
      : new Date(String(lastChangedAt)).getTime();
  if (!Number.isFinite(ms)) return 0;
  const elapsed = Date.now() - ms;
  return Math.max(0, AVATAR_CHANGE_COOLDOWN_MS - elapsed);
}

export function formatAvatarCooldownRemaining(ms: number): string {
  if (ms <= 0) return "";
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  if (hours >= 24) {
    const days = Math.ceil(hours / 24);
    return `${days} día${days === 1 ? "" : "s"}`;
  }
  return `${hours} hora${hours === 1 ? "" : "s"}`;
}
