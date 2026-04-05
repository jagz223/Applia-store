import PDFDocument from "pdfkit";
import { Buffer } from "buffer";

interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  dueDate: Date;
  client: {
    name: string;
    email: string;
    address?: string;
    phone?: string;
  };
  provider: {
    name: string;
    email: string;
    ruc?: string;
    address?: string;
  };
  service: {
    name: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    total: number;
  };
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  referenceId: string;
}

/**
 * Genera un PDF de factura
 */
export async function generateInvoice(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header - Logo and Company Info
      doc
        .fontSize(24)
        .font("Helvetica-Bold")
        .fillColor("#f59e0b") // Mango orange
        .text("GENFEB S.A.S.", 50, 50)
        .fillColor("#000000")
        .fontSize(10)
        .font("Helvetica")
        .text("RUC: 1792345678001", 50, 80)
        .text("Dirección: Av. Principal 123, Quito, Ecuador", 50, 95)
        .text("Teléfono: +593 2 123 4567", 50, 110)
        .text("Email: facturacion@genfeb.com", 50, 125);

      // Invoice Title
      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .text("FACTURA", 400, 50, { align: "right" })
        .fontSize(10)
        .font("Helvetica")
        .text(`No. ${data.invoiceNumber}`, 400, 80, { align: "right" })
        .text(`Fecha: ${formatDate(data.date)}`, 400, 95, { align: "right" })
        .text(`Vencimiento: ${formatDate(data.dueDate)}`, 400, 110, { align: "right" });

      // Divider
      doc.moveTo(50, 150).lineTo(560, 150).strokeColor("#cccccc").stroke();

      // Client and Provider Info
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .text("CLIENTE", 50, 165)
        .fontSize(10)
        .font("Helvetica")
        .text(data.client.name, 50, 185)
        .text(data.client.email, 50, 200)
        .text(data.client.phone || "", 50, 215)
        .text(data.client.address || "", 50, 230);

      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .text("PROVEEDOR", 300, 165)
        .fontSize(10)
        .font("Helvetica")
        .text(data.provider.name, 300, 185)
        .text(data.provider.email, 300, 200)
        .text(data.provider.ruc || "", 300, 215)
        .text(data.provider.address || "", 300, 230);

      // Service Table Header
      const tableTop = 260;
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("Descripción", 50, tableTop)
        .text("Cantidad", 280, tableTop, { width: 60, align: "center" })
        .text("Precio Unit.", 360, tableTop, { width: 80, align: "right" })
        .text("Total", 460, tableTop, { width: 80, align: "right" });

      doc.moveTo(50, tableTop + 15).lineTo(560, tableTop + 15).stroke();

      // Service Details
      doc
        .font("Helvetica")
        .text(data.service.name, 50, tableTop + 25)
        .text(data.service.description || "", 50, tableTop + 40, { width: 220 })
        .text(data.service.quantity.toString(), 280, tableTop + 25, { width: 60, align: "center" })
        .text(`$${data.service.unitPrice.toFixed(2)}`, 360, tableTop + 25, { width: 80, align: "right" })
        .text(`$${data.service.total.toFixed(2)}`, 460, tableTop + 25, { width: 80, align: "right" });

      // Totals
      const totalsY = Math.max(tableTop + 80, doc.y + 20);
      doc.moveTo(300, totalsY).lineTo(560, totalsY).stroke();

      const taxPercent = data.subtotal > 0 ? (data.tax / data.subtotal * 100).toFixed(0) : "12";

      doc
        .font("Helvetica")
        .text("Subtotal:", 360, totalsY + 10, { width: 100, align: "right" })
        .text(`$${data.subtotal.toFixed(2)}`, 460, totalsY + 10, { width: 80, align: "right" })
        .text(`Impuesto (${taxPercent}%):`, 360, totalsY + 25, { width: 100, align: "right" })
        .text(`$${data.tax.toFixed(2)}`, 460, totalsY + 25, { width: 80, align: "right" });

      doc.moveTo(300, totalsY + 35).lineTo(560, totalsY + 35).stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .text("TOTAL:", 360, totalsY + 45, { width: 100, align: "right" })
        .text(`$${data.total.toFixed(2)}`, 460, totalsY + 45, { width: 80, align: "right" });

      // Payment Info
      doc
        .fontSize(10)
        .font("Helvetica")
        .text(`Método de Pago: ${data.paymentMethod}`, 50, totalsY + 80)
        .text(`Referencia ID: ${data.referenceId}`, 50, totalsY + 95);

      // Footer
      doc
        .fontSize(8)
        .fillColor("#666666")
        .text(
          "Esta factura fue generada automáticamente por GenFeb S.A.S.",
          50,
          doc.page.height - 70,
          { align: "center" }
        )
        .text(
          "Gracias por confiar en nosotros - https://genfeb.com",
          50,
          doc.page.height - 55,
          { align: "center" }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Genera un número de factura secuencial
 */
export function generateInvoiceNumber(prefix: string = "FAC"): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${prefix}-${year}${month}-${random}`;
}

/**
 * Formatea una fecha para mostrar en la factura
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString("es-EC", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Crea datos de factura desde una reserva
 */
export function createInvoiceFromBooking(
  booking: any,
  client: any,
  provider: any,
  service: any,
  paymentMethod: string
): InvoiceData {
  const subtotal = Number(service.price) || 0;
  const taxRate = 0.12; // IVA 12% Ecuador
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  return {
    invoiceNumber: generateInvoiceNumber("SVC"),
    date: new Date(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    client: {
      name: `${client.name || client.firstName} ${client.lastName || ""}`.trim(),
      email: client.email,
      phone: client.phone,
    },
    provider: {
      name: `${provider.name || provider.firstName} ${provider.lastName || ""}`.trim(),
      email: provider.email,
      address: provider.address,
    },
    service: {
      name: service.name || service.title,
      description: service.description,
      quantity: 1,
      unitPrice: Number(service.price) || 0,
      total: subtotal,
    },
    subtotal,
    tax,
    total,
    paymentMethod,
    referenceId: `BK-${booking.id}`,
  };
}

/**
 * Crea datos de factura desde una transferencia de billetera (Recarga)
 */
export function createInvoiceFromTransfer(
  transfer: any,
  user: any
): InvoiceData {
  const subtotal = Number(transfer.amount) || 0;
  const taxRate = 0; // Las recargas suelen no tener IVA directo, o ya está incluido
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  return {
    invoiceNumber: generateInvoiceNumber("REC"),
    date: transfer.createdAt ? new Date(transfer.createdAt) : new Date(),
    dueDate: new Date(),
    client: {
      name: `${user.name || user.firstName} ${user.lastName || ""}`.trim(),
      email: user.email,
      phone: user.phone,
    },
    provider: {
      name: "GENFEB S.A.S.",
      email: "pagos@genfeb.com",
      ruc: "1792345678001",
      address: "Av. Principal 123, Quito, Ecuador",
    },
    service: {
      name: "Recarga de Wallet GenFeb",
      description: transfer.description || "Abono a billetera electrónica",
      quantity: 1,
      unitPrice: Number(transfer.amount) || 0,
      total: subtotal,
    },
    subtotal,
    tax,
    total,
    paymentMethod: transfer.transferType === "recharge" ? "Transferencia Bancaria" : "Saldo Wallet",
    referenceId: `TR-${transfer.id}`,
  };
}

/**
 * Crea datos de factura desde un reporte financiero (Verificación)
 */
export function createInvoiceFromFinancialReport(
  report: any,
  user: any
): InvoiceData {
  const subtotal = Number(report.amount) || 0;
  const taxRate = 0.12; 
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  return {
    invoiceNumber: generateInvoiceNumber("VER"),
    date: report.createdAt ? new Date(report.createdAt) : new Date(),
    dueDate: new Date(),
    client: {
      name: `${user.name || user.firstName} ${user.lastName || ""}`.trim(),
      email: user.email,
      phone: user.phone,
    },
    provider: {
      name: "GENFEB S.A.S.",
      email: "verificaciones@genfeb.com",
      ruc: "1792345678001",
      address: "Av. Principal 123, Quito, Ecuador",
    },
    service: {
      name: "Verificación de Identidad Profesional",
      description: "Servicio de validación y verificación de documentos de asociado",
      quantity: 1,
      unitPrice: Number(report.amount) || 0,
      total: subtotal,
    },
    subtotal,
    tax,
    total,
    paymentMethod: "Transferencia Bancaria",
    referenceId: `VR-${report.id}`,
  };
}
