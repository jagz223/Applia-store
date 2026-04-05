import { Express } from "express";
import { Server } from "http";
import { hasAdminPrivileges } from "@shared/roles";
import { genFebStorage } from "./storage-genfeb";
import jwt from "jsonwebtoken";
import { 
  generateInvoice, 
  createInvoiceFromBooking, 
  createInvoiceFromTransfer, 
  createInvoiceFromFinancialReport 
} from "./invoices";

// Define a simpler authenticateJWT inline
function authenticateJWT(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }
  
  const token = authHeader.substring(7);
  const JWT_SECRET = process.env.JWT_SECRET || "genfeb-jwt-secret-key-2024";
  
  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
}

export async function registerInvoiceRoutes(
  httpServer: Server,
  app: Express
): Promise<void> {
  
  // POST /api/invoices/generate - Generar factura para una reserva, recarga o verificación
  app.post(
    "/api/invoices/generate",
    authenticateJWT,
    async (req: any, res) => {
      try {
        const { bookingId, transferId, reportId } = req.body;
        let invoiceData: any = null;

        if (bookingId) {
          const booking: any = await genFebStorage.getBooking(parseInt(bookingId));
          if (!booking) return res.status(404).json({ message: "Reserva no encontrada" });

          const client: any = await genFebStorage.getUserById(booking.userId);
          const provider: any = await genFebStorage.getProvider(booking.providerId);
          const providerUser: any = provider ? await genFebStorage.getUserById(provider.userId) : null;
          const service: any = await genFebStorage.getService(booking.serviceId);

          if (!client || !providerUser || !service) {
            return res.status(404).json({ message: "Datos incompletos para factura de reserva" });
          }

          invoiceData = createInvoiceFromBooking(booking, client, providerUser, service, booking.paymentMethod || "Tarjeta de Crédito");

        } else if (transferId) {
          const transfer: any = await genFebStorage.getWalletTransfer(parseInt(transferId));
          if (!transfer) return res.status(404).json({ message: "Transferencia no encontrada" });

          const user: any = await genFebStorage.getUserById(transfer.userId);
          if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

          invoiceData = createInvoiceFromTransfer(transfer, user);

        } else if (reportId) {
          const report: any = await (genFebStorage as any).getFinancialReport(parseInt(reportId));
          if (!report) return res.status(404).json({ message: "Reporte financiero no encontrado" });

          const user: any = await genFebStorage.getUserById(report.userId);
          if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

          invoiceData = createInvoiceFromFinancialReport(report, user);

        } else {
          return res.status(400).json({ message: "Se requiere bookingId, transferId o reportId" });
        }

        const pdfBuffer = await generateInvoice(invoiceData);
        const fileName = `GENFEB-${invoiceData.invoiceNumber}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.end(pdfBuffer);

      } catch (error) {
        console.error("Error generando factura:", error);
        if (!res.headersSent) {
          res.status(500).json({ message: "Error al generar factura" });
        }
      }
    }
  );

  // GET /api/invoices/:bookingId - Obtener datos de factura sin generar PDF
  app.get(
    "/api/invoices/:bookingId",
    authenticateJWT,
    async (req: any, res) => {
      try {
        const { bookingId } = req.params;
        
        const booking: any = await genFebStorage.getBooking(parseInt(bookingId));
        if (!booking) {
          return res.status(404).json({ message: "Reserva no encontrada" });
        }

        const client: any = await genFebStorage.getUserById(booking.userId);
        const provider: any = await genFebStorage.getProvider(booking.providerId);
        const providerUser: any = provider ? await genFebStorage.getUserById(provider.userId) : null;
        const service: any = await genFebStorage.getService(booking.serviceId);

        if (!client || !providerUser || !service) {
          return res.status(404).json({ message: "Datos incompletos para factura" });
        }

        const invoiceData = createInvoiceFromBooking(
          booking,
          client,
          providerUser,
          service,
          booking.paymentMethod || "Tarjeta de Crédito"
        );

        res.json(invoiceData);
      } catch (error) {
        console.error("Error obteniendo factura:", error);
        res.status(500).json({ message: "Error al obtener datos de factura" });
      }
    }
  );

  // GET /api/invoices - Listar facturas del usuario (completo)
  app.get(
    "/api/invoices",
    authenticateJWT,
    async (req: any, res) => {
      try {
        const userId = req.user.id;
        const userRole = req.user.role;

        let invoices: any[] = [];

        // Obtener reportes financieros (incluyendo verificaciones)
        try {
          const financialReports = await genFebStorage.getFinancialReports(userId);
          const verificationFees = financialReports.filter(r => r.type === "verification_fee");
          
          for (const fee of verificationFees) {
            invoices.push({
              id: fee.id,
              reportId: fee.id,
              type: "verification",
              invoiceNumber: `VER-${fee.id}`,
              date: fee.createdAt,
              service: "Cargo de Verificación de Identidad",
              amount: fee.amount || 15,
              status: fee.status,
            });
          }
        } catch (err) {
          console.error("Error obteniendo reportes financieros:", err);
        }

        // Obtener recargas (Top-ups)
        try {
          const { transfers } = await genFebStorage.getTransfersByUser(userId, { transferType: "recharge" });
          for (const transfer of transfers) {
            if (transfer.status === "completed") {
              invoices.push({
                id: transfer.id,
                transferId: transfer.id,
                type: "recharge",
                invoiceNumber: `REC-${transfer.id}`,
                date: transfer.createdAt,
                service: "Recarga de Wallet",
                amount: transfer.amount,
                status: transfer.status,
              });
            }
          }
        } catch (err) {
          console.error("Error obteniendo recargas:", err);
        }

        // Reservas
        if (hasAdminPrivileges(userRole) || userRole === "professional") {
          const providers = await genFebStorage.getAllProviders();
          for (const provider of providers) {
            if (userRole === "professional" && provider.userId !== userId) continue;
            const bookings = await genFebStorage.getBookingsByProvider(provider.id);
            for (const booking of bookings) {
              if (booking.status === "completed" || booking.status === "paid") {
                const service: any = await genFebStorage.getService(booking.serviceId);
                const client: any = await genFebStorage.getUserById(booking.userId);
                if (service) {
                  invoices.push({
                    bookingId: booking.id,
                    type: "booking",
                    invoiceNumber: `FAC-${booking.id}`,
                    date: booking.createdAt,
                    client: client ? `${client.name || ""} ${client.lastName || ""}`.trim() : "Cliente",
                    service: service.title || service.name || "Servicio",
                    amount: service.price || 0,
                    status: booking.status,
                  });
                }
              }
            }
          }
        } else {
          const bookings = await genFebStorage.getBookingsByUser(userId);
          for (const booking of bookings) {
            if (booking.status === "completed" || booking.status === "paid") {
              const service: any = await genFebStorage.getService(booking.serviceId);
              if (service) {
                invoices.push({
                  bookingId: booking.id,
                  type: "booking",
                  invoiceNumber: `FAC-${booking.id}`,
                  date: booking.createdAt,
                  service: service.title || service.name || "Servicio",
                  amount: service.price || 0,
                  status: booking.status,
                });
              }
            }
          }
        }

        res.json(invoices);
      } catch (error) {
        console.error("Error listando facturas:", error);
        res.status(500).json({ message: "Error al listar facturas" });
      }
    }
  );

  console.log("✅ Invoice routes registered");
}
