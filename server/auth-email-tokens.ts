import crypto from "crypto";
import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";

export type AuthEmailTokenPurpose = "verify_email" | "revoke_registration" | "password_reset";

type AuthEmailTokenRecord = {
  userId: string;
  purpose: AuthEmailTokenPurpose;
  tokenHash: string;
  expiresAtMs: number;
  usedAtMs: number | null;
  createdAt: string;
};

const memoryTokens = new Map<string, AuthEmailTokenRecord>();

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function tokenDocId(purpose: AuthEmailTokenPurpose, tokenHash: string): string {
  return `${purpose}_${tokenHash.slice(0, 40)}`;
}

function col() {
  const db = getFirestore();
  if (!db) return null;
  return db.collection(FIRESTORE_COLLECTIONS.AUTH_EMAIL_TOKENS);
}

export function createRawAuthEmailToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function storeAuthEmailToken(params: {
  userId: string;
  purpose: AuthEmailTokenPurpose;
  rawToken: string;
  ttlMs: number;
}): Promise<void> {
  const tokenHash = hashToken(params.rawToken);
  const now = Date.now();
  const row: AuthEmailTokenRecord = {
    userId: params.userId,
    purpose: params.purpose,
    tokenHash,
    expiresAtMs: now + params.ttlMs,
    usedAtMs: null,
    createdAt: new Date(now).toISOString(),
  };
  const collection = col();
  const id = tokenDocId(params.purpose, tokenHash);
  if (collection) {
    await collection.doc(id).set(row);
    return;
  }
  memoryTokens.set(id, row);
}

export async function consumeAuthEmailToken(params: {
  purpose: AuthEmailTokenPurpose;
  rawToken: string;
}): Promise<{ userId: string } | null> {
  const tokenHash = hashToken(params.rawToken.trim());
  const id = tokenDocId(params.purpose, tokenHash);
  const now = Date.now();
  const collection = col();

  if (collection) {
    const db = getFirestore()!;
    return db.runTransaction(async (tx) => {
      const ref = collection.doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const data = snap.data() as AuthEmailTokenRecord;
      if (data.usedAtMs != null) return null;
      if (data.expiresAtMs <= now) return null;
      if (data.purpose !== params.purpose) return null;
      tx.set(ref, { ...data, usedAtMs: now }, { merge: true });
      return { userId: data.userId };
    });
  }

  const row = memoryTokens.get(id);
  if (!row || row.usedAtMs != null || row.expiresAtMs <= now || row.purpose !== params.purpose) {
    return null;
  }
  memoryTokens.set(id, { ...row, usedAtMs: now });
  return { userId: row.userId };
}
