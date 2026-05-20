/** Ruta al panel central para una notificación de solicitud de afiliación. */
export function centralAffiliationNotificationPath(data: Record<string, unknown> | undefined | null): string {
  const d = data ?? {};
  const nested = (d.data as Record<string, unknown> | undefined) ?? {};
  const fromServer = d.url ?? nested.url;
  if (typeof fromServer === "string" && fromServer.startsWith("/")) return fromServer;

  const requestId = d.requestId ?? nested.requestId;
  const companyId = d.dispatchCompanyId ?? nested.dispatchCompanyId;
  const q = new URLSearchParams();
  if (companyId != null && String(companyId).trim()) q.set("companyId", String(companyId).trim());
  if (requestId != null && String(requestId).trim()) {
    q.set("affiliationRequest", String(requestId).trim());
  }
  const qs = q.toString();
  return qs ? `/central?${qs}` : "/central";
}

/** Ruta al resumen del asociado (aprobación / rechazo / acceso a datos). */
export function centralAffiliationApplicantNotificationPath(data: Record<string, unknown> | undefined | null): string {
  const d = data ?? {};
  const nested = (d.data as Record<string, unknown> | undefined) ?? {};
  const fromServer = d.url ?? nested.url;
  if (typeof fromServer === "string" && fromServer.startsWith("/")) return fromServer;

  const requestId = d.requestId ?? nested.requestId;
  const q = new URLSearchParams({ tab: "overview" });
  if (requestId != null && String(requestId).trim()) {
    q.set("centralAffiliation", String(requestId).trim());
  }
  return `/professional-dashboard?${q.toString()}`;
}
