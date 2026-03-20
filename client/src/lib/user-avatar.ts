/**
 * URL de foto del usuario asociado al proveedor (Firestore puede usar
 * profileImageUrl, avatar o photoURL según origen del registro).
 */
export function getProviderUserAvatarUrl(provider: unknown): string | null {
  const u = (provider as { user?: Record<string, unknown> } | undefined)?.user;
  if (!u || typeof u !== "object") return null;
  const candidates = [u.profileImageUrl, u.avatar, u.photoURL];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}
