import { jsPDF } from "jspdf";

/** Tipo de transferencia para factura (datos mínimos que llegan del API). */
export interface TransferForInvoice {
  id: number;
  amount: number;
  transferType: string;
  description?: string | null;
  createdAt?: string | null;
  status?: string;
}

/** Usuario para encabezado de factura (nombre, email). */
export interface UserForInvoice {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
}

const COMPANY = {
  name: "GENFEB S.A.S",
  document: "RUC 1234567890001",
  address: "Av. Principal 123, Quito, Ecuador",
  phone: "+593 2 123 4567",
} as const;

/** Etiquetas de tipo de transferencia para listados y facturas. */
export const TRANSFER_TYPE_LABELS: Record<string, string> = {
  recharge: "Recarga de saldo",
  service_payment: "Ingreso por servicio",
  payment: "Pago de servicio",
  withdrawal: "Retiro de fondos",
};

export function getTransferTypeLabel(transferType: string): string {
  return TRANSFER_TYPE_LABELS[transferType] ?? "Transacción";
}

function getTransferConcept(transfer: TransferForInvoice): string {
  const label = TRANSFER_TYPE_LABELS[transfer.transferType] ?? "Transacción";
  return transfer.description?.trim() ? `${label}: ${transfer.description}` : label;
}

function formatDate(createdAt: string | null | undefined): string {
  if (!createdAt) return new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
  const d = new Date(createdAt);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(amount);
}

function clientName(user: UserForInvoice): string {
  const first = user.firstName ?? "";
  const last = user.lastName ?? "";
  const full = [first, last].filter(Boolean).join(" ").trim();
  return full || (user.name ?? "") || "Cliente";
}

/**
 * Genera un PDF de factura a partir de una transferencia y datos del usuario.
 * El PDF se descarga en el dispositivo; no se almacena en el servidor.
 */
export function downloadInvoicePdf(transfer: TransferForInvoice, user: UserForInvoice): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  // Encabezado empresa
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY.name, margin, y);
  y += 8;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(COMPANY.document, margin, y);
  y += 5;
  doc.text(COMPANY.address, margin, y);
  y += 5;
  doc.text(COMPANY.phone, margin, y);
  y += 12;

  // Línea separadora
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  // Título
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("FACTURA", margin, y);
  y += 10;

  const year = new Date().getFullYear();
  const invoiceNumber = `GENFEB-${year}-${String(transfer.id).padStart(6, "0")}`;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Nº ${invoiceNumber}`, margin, y);
  doc.text(`Fecha: ${formatDate(transfer.createdAt ?? null)}`, pageW - margin - 50, y);
  y += 12;

  // Cliente
  doc.setFont("helvetica", "bold");
  doc.text("Cliente:", margin, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.text(clientName(user), margin, y);
  y += 5;
  if (user.email) {
    doc.text(user.email, margin, y);
    y += 8;
  } else {
    y += 5;
  }

  // Tabla conceptual
  const concept = getTransferConcept(transfer);
  const amountStr = formatCurrency(transfer.amount);

  y += 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageW - margin, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Descripción", margin, y);
  doc.text("Monto", pageW - margin - 28, y);
  y += 6;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageW - margin, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(concept, pageW - margin * 2 - 35);
  doc.text(lines, margin, y);
  doc.text(amountStr, pageW - margin - 28, y);
  y += Math.max(lines.length * 5, 8) + 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageW - margin, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Total", pageW - margin - 50, y);
  doc.text(amountStr, pageW - margin - 28, y);
  y += 15;

  // Pie
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Documento generado electrónicamente. No almacenado en servidor.", margin, y);
  doc.text("GENFEB S.A.S - Plataforma de servicios.", margin, y + 4);

  const fileName = `Factura_${invoiceNumber.replace(/\s/g, "_")}.pdf`;
  doc.save(fileName);
}
