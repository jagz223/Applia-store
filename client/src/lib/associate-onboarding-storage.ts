/** Marca que el usuario abrió el flujo de alta como asociado (sin tener aún perfil en API). */
export const ASSOCIATE_ONBOARDING_STARTED_KEY = "genfeb_associate_onboarding_started";

const BUMP_EVENT = "genfeb-associate-onboarding-started";

export function markAssociateOnboardingStarted(): void {
  try {
    localStorage.setItem(ASSOCIATE_ONBOARDING_STARTED_KEY, "1");
    if (typeof window !== "undefined") window.dispatchEvent(new Event(BUMP_EVENT));
  } catch {
    /* ignore */
  }
}

export function subscribeAssociateOnboardingBump(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(BUMP_EVENT, fn);
  return () => window.removeEventListener(BUMP_EVENT, fn);
}

export function clearAssociateOnboardingStarted(): void {
  try {
    localStorage.removeItem(ASSOCIATE_ONBOARDING_STARTED_KEY);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(BUMP_EVENT));
  } catch {
    /* ignore */
  }
}

export function readAssociateOnboardingStarted(): boolean {
  try {
    return localStorage.getItem(ASSOCIATE_ONBOARDING_STARTED_KEY) === "1";
  } catch {
    return false;
  }
}
