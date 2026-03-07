/**
 * Utilidades de formato para el chat (Single Responsibility).
 * Aceptan Date, string ISO o timestamp de Firestore { _seconds, _nanoseconds }.
 */

import { toDate } from "@/lib/date-utils";

export function formatMessageTime(
  date: Date | string | { _seconds?: number; _nanoseconds?: number } | null | undefined
): string {
  const d = toDate(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dDate.getTime() === today.getTime()) {
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }
  if (dDate.getTime() === yesterday.getTime()) return "Ayer";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function formatListTime(
  date: Date | string | { _seconds?: number; _nanoseconds?: number } | null | undefined
): string {
  const d = toDate(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60 * 60 * 1000) {
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 24 * 60 * 60 * 1000) return "Ayer";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
