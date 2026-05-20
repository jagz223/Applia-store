import type { MyCentralAffiliationRequest } from "@/hooks/use-central";

/** Identificador de empresa despachadora en el proveedor (tras aprobación de central). */
export function normalizeProviderDispatchCompanyId(provider: unknown): string | null {
  if (provider == null || typeof provider !== "object") return null;
  const raw = (provider as { dispatchCompanyId?: string | null }).dispatchCompanyId;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

export function hasPendingCentralAffiliationRequest(requests: MyCentralAffiliationRequest[]): boolean {
  return requests.some((r) => r.status === "pending");
}

/**
 * Conductor Go completo (taxi + delivery + vehículo), módulos visibles y sin empresa despachadora asignada.
 * Las solicitudes pendientes o rechazadas no bloquean una nueva solicitud (el servidor evita duplicados por empresa).
 */
export function canOfferCentralAffiliationRequest(args: {
  mobilityGoVisible: boolean;
  driverEnrollmentComplete: boolean;
  provider: unknown;
}): boolean {
  if (!args.mobilityGoVisible || !args.driverEnrollmentComplete) return false;
  return normalizeProviderDispatchCompanyId(args.provider) == null;
}
