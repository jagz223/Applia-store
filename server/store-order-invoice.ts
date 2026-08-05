import PDFDocument from "pdfkit";
import { Buffer } from "buffer";
import {
  STORE_ORDER_STATUS_LABELS,
  fulfillmentLabel,
  type StoreOrder,
} from "@shared/store-order-schema";
import type { Store } from "@shared/store-schema";

type CustomerInfo = {
  name: string;
  email: string | null;
  phone?: string | null;
};

function formatMoney(value: number): string {
  return `$${Number(value).toFixed(2)}`;
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/**
 * PDF de factura / comprobante de una orden de tienda.
 */
export async function generateStoreOrderInvoicePdf(input: {
  order: StoreOrder;
  store: Store;
  customer: CustomerInfo;
}): Promise<Buffer> {
  const { order, store, customer } = input;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 48, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const charcoal = "#2E2A27";
      const coral = "#E85D4C";
      const muted = "#6B6560";

      doc
        .fontSize(22)
        .font("Helvetica-Bold")
        .fillColor(charcoal)
        .text("APPLIA STORE", 48, 48)
        .fontSize(10)
        .font("Helvetica")
        .fillColor(muted)
        .text(store.name, 48, 76)
        .text(store.slug ? `tienda/${store.slug}` : "", 48, 90);

      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .fillColor(coral)
        .text("FACTURA", 350, 48, { width: 200, align: "right" })
        .fontSize(10)
        .font("Helvetica")
        .fillColor(charcoal)
        .text(`Orden #${order.id}`, 350, 74, { width: 200, align: "right" })
        .fillColor(muted)
        .text(`Fecha: ${formatDate(order.createdAt)}`, 350, 90, { width: 200, align: "right" })
        .text(`Estado: ${STORE_ORDER_STATUS_LABELS[order.status]}`, 350, 104, {
          width: 200,
          align: "right",
        });

      doc.moveTo(48, 130).lineTo(547, 130).strokeColor("#E5E0DA").stroke();

      let y = 148;
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(charcoal)
        .text("CLIENTE", 48, y)
        .font("Helvetica")
        .fontSize(10)
        .fillColor(muted);
      y += 18;
      doc.fillColor(charcoal).text(customer.name || "Cliente", 48, y);
      y += 14;
      if (customer.email) {
        doc.fillColor(muted).text(customer.email, 48, y);
        y += 14;
      }
      if (customer.phone) {
        doc.fillColor(muted).text(String(customer.phone), 48, y);
        y += 14;
      }

      y = 148;
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(charcoal)
        .text("PAGO Y ENTREGA", 300, y)
        .font("Helvetica")
        .fontSize(10)
        .fillColor(muted);
      y += 18;
      doc
        .fillColor(charcoal)
        .text(order.paymentMethodName || "Método de pago", 300, y, { width: 247 });
      y += 14;
      if (order.paymentMethodAccountNumber) {
        doc.fillColor(muted).text(`Cuenta: ${order.paymentMethodAccountNumber}`, 300, y, { width: 247 });
        y += 14;
      }
      doc.fillColor(muted).text(`Ref: ${order.reference || "—"}`, 300, y, { width: 247 });
      y += 14;
      doc
        .fillColor(muted)
        .text(`Entrega: ${fulfillmentLabel(order.fulfillmentMode)}`, 300, y, { width: 247 });

      y = Math.max(y, 220) + 16;
      doc.moveTo(48, y).lineTo(547, y).strokeColor("#E5E0DA").stroke();
      y += 16;

      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(charcoal)
        .text("Producto", 48, y, { width: 230 })
        .text("Cant.", 290, y, { width: 50, align: "center" })
        .text("P. unit.", 350, y, { width: 80, align: "right" })
        .text("Total", 450, y, { width: 90, align: "right" });
      y += 14;
      doc.moveTo(48, y).lineTo(547, y).strokeColor("#E5E0DA").stroke();
      y += 10;

      doc.font("Helvetica").fontSize(9).fillColor(charcoal);
      for (const item of order.items) {
        const name = String(item.name || "Ítem").slice(0, 80);
        const rowH = Math.max(16, doc.heightOfString(name, { width: 230 }));
        if (y + rowH > 720) {
          doc.addPage();
          y = 48;
        }
        doc.text(name, 48, y, { width: 230 });
        doc.text(String(item.quantity), 290, y, { width: 50, align: "center" });
        doc.text(formatMoney(item.price), 350, y, { width: 80, align: "right" });
        doc.text(formatMoney(item.lineTotal), 450, y, { width: 90, align: "right" });
        y += rowH + 8;
      }

      y += 8;
      doc.moveTo(300, y).lineTo(547, y).strokeColor("#E5E0DA").stroke();
      y += 12;

      const moneyRow = (label: string, amount: number, bold = false) => {
        doc
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(bold ? 11 : 10)
          .fillColor(charcoal)
          .text(label, 320, y, { width: 110, align: "right" })
          .text(formatMoney(amount), 450, y, { width: 90, align: "right" });
        y += bold ? 18 : 16;
      };

      moneyRow("Subtotal", order.subtotal);
      if ((order.deliveryFee ?? 0) > 0) {
        moneyRow("Envío", order.deliveryFee);
      }
      moneyRow("Total tienda", order.amountDue, true);
      moneyRow("Pagado", order.amountPaid);

      y += 20;
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(muted)
        .text(
          "Documento generado por Applia Store. El visor del navegador permite descargar o imprimir.",
          48,
          Math.min(y, 760),
          { width: 500 },
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
