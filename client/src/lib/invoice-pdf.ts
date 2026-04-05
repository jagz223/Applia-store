/** Tipo de transferencia para factura (datos mínimos que llegan del API). */
export interface TransferForInvoice {
  id: number;
  amount: number;
  transferType: string;
  description?: string | null;
  createdAt?: string | null;
  status?: string;
  bookingId?: number; // Para reservas
  reportId?: number;  // Para verificaciones
}

/** Usuario para encabezado de factura (nombre, email). */
export interface UserForInvoice {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
}

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

/**
 * Descarga un PDF de factura generado por el servidor.
 * Llama al endpoint /api/invoices/generate con el ID correspondiente.
 */
export async function downloadInvoicePdf(
  transfer: TransferForInvoice, 
  _user: UserForInvoice
): Promise<void> {
  try {
    const token = localStorage.getItem("token"); // Ajustar si el token se guarda en otro lugar
    if (!token) {
      console.error("No se encontró token de autenticación");
      return;
    }

    // Determinar qué ID enviar al servidor
    const body: any = {};
    if (transfer.bookingId) {
      body.bookingId = transfer.bookingId;
    } else if (transfer.transferType === "recharge" || transfer.transferType === "withdrawal") {
      body.transferId = transfer.id;
    } else if (transfer.reportId) {
      body.reportId = transfer.reportId;
    } else if (transfer.transferType === "verification_fee" || transfer.description?.toLowerCase().includes("verificaci")) {
      body.reportId = transfer.reportId || transfer.id;
    } else {
      // Fallback: si no sabemos qué es, probamos como transferId si es un movimiento de billetera
      body.transferId = transfer.id;
    }

    const response = await fetch("/api/invoices/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Error al generar la factura en el servidor");
    }

    // Obtener el blob del PDF
    const blob = await response.blob();
    
    // Obtener el nombre del archivo del header Content-Disposition si es posible
    const contentDisposition = response.headers.get("Content-Disposition");
    let fileName = `Factura_GENFEB_${transfer.id}.pdf`;
    if (contentDisposition && contentDisposition.includes("filename=")) {
      fileName = contentDisposition.split("filename=")[1].replace(/"/g, "");
    }

    // Crear un link temporal para la descarga
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    
    // Limpieza
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

  } catch (error) {
    console.error("Error descargando factura:", error);
    alert(error instanceof Error ? error.message : "No se pudo descargar la factura. Intente nuevamente.");
  }
}
