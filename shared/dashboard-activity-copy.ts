export type DashboardActivityViewer = "provider" | "client_only" | "both";

export function resolveDashboardActivityViewer(hasProviderProfile: boolean): DashboardActivityViewer {
  return hasProviderProfile ? "both" : "client_only";
}

export function dashboardActivityPageSubtitle(viewer: DashboardActivityViewer): string {
  if (viewer === "client_only") {
    return "Resumen de tus servicios completados como cliente y viajes Car Go finalizados.";
  }
  if (viewer === "both") {
    return "Mensualidades, servicios que realizaste como profesional y resumen de los que solicitaste como cliente.";
  }
  return "Resumen de tus mensualidades y de los servicios que has realizado como profesional.";
}

export function dashboardActivityCardDescription(viewer: DashboardActivityViewer): string {
  if (viewer === "client_only") {
    return "Tus reservas y viajes completados. En Mis reservas y en Car Go verás el detalle completo.";
  }
  if (viewer === "both") {
    return "Como profesional: mensualidades y servicios realizados. Como cliente: reservas y Car Go completados (sin cancelados).";
  }
  return "Mensualidades de visibilidad y servicios que realizaste (Man Go y Pro Go sin monto aquí; Car Go con tarifa acordada).";
}

export function dashboardActivityTransactionsDescription(viewer: DashboardActivityViewer): string {
  if (viewer === "client_only") {
    return "Pagos de viajes Car Go y cargos en Saldo Applia. Toca un registro para ver el resumen.";
  }
  return "Mensualidades de visibilidad y pagos de viajes Car Go. Toca un registro para ver el detalle.";
}

export function dashboardServiceHistoryDescription(viewer: DashboardActivityViewer): string {
  if (viewer === "client_only") {
    return "Reservas y viajes que completaste como cliente. Toca uno para ver horarios, contraparte y ruta.";
  }
  if (viewer === "both") {
    return "Servicios que realizaste como profesional o solicitaste como cliente. Toca para ver el resumen.";
  }
  return "Servicios que realizaste como profesional. Toca uno para ver cliente, horario y cierre.";
}

export function dashboardOverviewDescription(viewer: DashboardActivityViewer): string {
  if (viewer === "client_only") {
    return "Últimos movimientos. Usa Historial de servicios o Transacciones para ver todo.";
  }
  return "Últimos movimientos. Historial de servicios y Transacciones tienen el detalle completo al tocar cada fila.";
}

export function dashboardProfessionalDetailHint(): string {
  return "En tu panel profesional puedes ver el historial de servicios con más detalle (estados y chat).";
}

export function dashboardClientDetailHint(): string {
  return "En Mis reservas y en la app Car Go encontrarás el historial completo de cada servicio.";
}
