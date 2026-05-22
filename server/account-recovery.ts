import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  normalizeRecoveryAnswer,
  type RecoveryQuestionStored,
} from "@shared/account-recovery";

const RESET_PURPOSE = "password_reset";

export async function hashRecoveryQuestions(
  items: { questionId: string; answer: string }[],
): Promise<RecoveryQuestionStored[]> {
  const out: RecoveryQuestionStored[] = [];
  for (const item of items) {
    const norm = normalizeRecoveryAnswer(item.answer);
    const answerHash = await bcrypt.hash(norm, 10);
    out.push({ questionId: item.questionId, answerHash });
  }
  return out;
}

/** El usuario debe elegir las mismas 3 preguntas que configuró y acertar cada respuesta. */
export async function verifyRecoveryQuestions(
  stored: RecoveryQuestionStored[] | null | undefined,
  submitted: { questionId: string; answer: string }[],
): Promise<boolean> {
  if (!Array.isArray(stored) || stored.length !== 3 || submitted.length !== 3) return false;

  const submittedIds = submitted.map((s) => s.questionId);
  if (new Set(submittedIds).size !== 3) return false;

  const storedIds = new Set(stored.map((s) => s.questionId));
  for (const id of submittedIds) {
    if (!storedIds.has(id)) return false;
  }

  for (const sub of submitted) {
    const row = stored.find((s) => s.questionId === sub.questionId);
    if (!row?.answerHash) return false;
    const ok = await bcrypt.compare(normalizeRecoveryAnswer(sub.answer), row.answerHash);
    if (!ok) return false;
  }
  return true;
}

export function userHasRecoveryConfigured(user: {
  recoveryQuestionsConfigured?: boolean;
  recoveryQuestions?: unknown;
}): boolean {
  if (user.recoveryQuestionsConfigured === true) return true;
  return Array.isArray(user.recoveryQuestions) && user.recoveryQuestions.length === 3;
}

export function generatePasswordResetToken(
  userId: string,
  email: string,
  secret: string,
): string {
  return jwt.sign({ purpose: RESET_PURPOSE, userId, email }, secret, { expiresIn: "15m" });
}

export function verifyPasswordResetToken(
  token: string,
  secret: string,
): { userId: string; email: string } | null {
  try {
    const payload = jwt.verify(token, secret) as {
      purpose?: string;
      userId?: string;
      email?: string;
    };
    if (payload.purpose !== RESET_PURPOSE) return null;
    const userId = String(payload.userId ?? "").trim();
    const email = String(payload.email ?? "").trim().toLowerCase();
    if (!userId || !email) return null;
    return { userId, email };
  } catch {
    return null;
  }
}
