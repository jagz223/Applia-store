import type { Express } from "express";
import type { Server } from "http";
import { hasAdminPrivileges } from "@shared/roles";
import { genFebStorage } from "./storage-genfeb";
import { generateInvoice, createInvoiceFromBooking } from "./invoices";

// Define a simpler authenticateJWT inline
function authenticateJWT(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }
  
  const token = authHeader.substring(7);
  const jwt = require("jsonwebtoken");
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
  
  // POST /api/invoices/generate - Generar factura para una reserva
  app.post(
    "/api/invoices/generate",
    authenticateJWT,
    async (req: any, res) => {
      try {
        const { bookingId } = req.body;
        
        if (!bookingId) {
          return res.status(400).json({ message: "ID de reserva requerido" });
        }

        // Obtener la reserva - usando any para evitar errores de tipo
        const booking: any = await genFebStorage.getBooking(parseInt(bookingId));
        if (!booking) {
          return res.status(404).json({ message: "Reserva no encontrada" });
        }

        // Obtener información del cliente
        const client: any = await genFebStorage.getUserById(booking.userId);
        if (!client) {
          return res.status(404).json({ message: "Cliente no encontrado" });
        }

        // Obtener información del proveedor
        const provider: any = await genFebStorage.getProvider(booking.providerId);
        if (!provider) {
          return res.status(404).json({ message: "Proveedor no encontrado" });
        }

        // Obtener el usuario del proveedor
        const providerUser: any = await genFebStorage.getUserById(provider.userId);
        if (!providerUser) {
          return res.status(404).json({ message: "Usuario de proveedor no encontrado" });
        }

        // Obtener el servicio
        const service: any = await genFebStorage.getService(booking.serviceId);
        if (!service) {
          return res.status(404).json({ message: "Servicio no encontrado" });
        }

        // Crear datos de factura
        const invoiceData = createInvoiceFromBooking(
          booking,
          client,
          providerUser,
          service,
          "Tarjeta de Crédito"
        );

        // Generar PDF
        const pdfBuffer = await generateInvoice(invoiceData);

        // Enviar PDF como respuesta
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="factura-${invoiceData.invoiceNumber}.pdf"`
        );
        res.send(pdfBuffer);
      } catch (error) {
        console.error("Error generando factura:", error);
        res.status(500).json({ message: "Error al generar factura" });
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

        if (!client || !provider || !providerUser || !service) {
          return res.status(404).json({ message: "Datos incompletos para factura" });
        }

        const invoiceData = createInvoiceFromBooking(
          booking,
          client,
          providerUser,
          service,
          "Tarjeta de Crédito"
        );

        res.json(invoiceData);
      } catch (error) {
        console.error("Error obteniendo factura:", error);
        res.status(500).json({ message: "Error al obtener datos de factura" });
      }
    }
  );

  // GET /api/invoices - Listar facturas del usuario
  app.get(
    "/api/invoices",
    authenticateJWT,
    async (req: any, res) => {
      try {
        const userId = req.user.id;
        const userRole = req.user.role;

        let invoices: any[] = [];

        if (hasAdminPrivileges(userRole) || userRole === "professional") {
          // Admin / Soporte TI y profesional pueden ver reservas
          const providers = await genFebStorage.getAllProviders();
          
          for (const provider of providers) {
            if (userRole === "professional" && provider.userId !== userId) continue;
            
            const bookings = await genFebStorage.getBookingsByProvider(provider.id);
            
            for (const booking of bookings) {
              if (booking.status === "completed" || booking.status === "paid") {
                const service: any = await genFebStorage.getService(booking.serviceId);
                if (service) {
                  const client: any = await genFebStorage.getUserById(booking.userId);
                  invoices.push({
                    bookingId: booking.id,
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
          // Cliente puede ver sus propias facturas
          const bookings = await genFebStorage.getBookingsByUser(userId);
          
          for (const booking of bookings) {
            if (booking.status === "completed" || booking.status === "paid") {
              const service: any = await genFebStorage.getService(booking.serviceId);
              if (service) {
                invoices.push({
                  bookingId: booking.id,
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
