import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  type AuthProvider,
} from "firebase/auth";
import { getFirebaseApp } from "@/lib/firebase-client";
import type { AuthUser } from "@/hooks/use-auth";

export type SocialAuthProviderId = "google" | "facebook";

async function exchangeFirebaseIdToken(idToken: string): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch("/api/auth/social", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || "No se pudo iniciar sesión social");
  }
  return data as { token: string; user: AuthUser };
}

function buildProvider(kind: SocialAuthProviderId): AuthProvider {
  if (kind === "facebook") return new FacebookAuthProvider();
  return new GoogleAuthProvider();
}

export async function signInWithSocialProvider(
  kind: SocialAuthProviderId,
): Promise<{ token: string; user: AuthUser }> {
  const app = getFirebaseApp();
  if (!app) throw new Error("Firebase no está configurado en el cliente.");
  const auth = getAuth(app);
  const result = await signInWithPopup(auth, buildProvider(kind));
  const idToken = await result.user.getIdToken();
  return exchangeFirebaseIdToken(idToken);
}
