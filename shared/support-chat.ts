/** Conversación de ayuda cliente ↔ administrador / soporte TI. */
export const SUPPORT_CONVERSATION_KIND = "support_help" as const;

export type SupportConversationKind = typeof SUPPORT_CONVERSATION_KIND;

export function formatSupportConsultationLabel(
  consultationNumber: number | null | undefined,
): string | null {
  const n = Number(consultationNumber);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `Consulta #${n}`;
}

export function supportConsultationBannerText(
  consultationNumber: number | null | undefined,
  closed: boolean,
): string {
  const label = formatSupportConsultationLabel(consultationNumber) ?? "Consulta de ayuda";
  if (closed) {
    return `${label} cerrada. El historial queda guardado; para una nueva consulta, abre el chat de ayuda desde Reservar o el Centro de Ayuda.`;
  }
  return `${label} — chat de ayuda GenFeb. Un asesor del equipo te atenderá por aquí.`;
}