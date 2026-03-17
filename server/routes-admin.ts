/**
 * Rutas de administración (solo admin).
 * Rutas finas: validan entrada y delegan en servicios.
 * Usamos Router para /api/admin/users para que GET /:id y GET / no se pisen.
 */

import express, { type Express } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authenticateJWT } from "./routes-auth";
import { userService } from "./services";
import { genFebStorage } from "./storage-genfeb";
import { getIO, sendNotificationToAdmins } from "./socket";
import { notificationService } from "./services/notification.service";

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Se requiere rol de administrador" });
  }
  next();
}

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  role: z.string().min(1).max(50).optional(),
  newPassword: z.string().min(6).max(100).optional(),
});

/** Serializa a objeto plano para JSON (p. ej. Timestamp de Firestore → ISO string). */
function toPlainUser(obj: unknown): Record<string, unknown> {
  if (obj === null || typeof obj !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "password") continue;
    if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
      out[k] = (v as { toDate: () => Date }).toDate().toISOString();
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export function registerAdminRoutes(app: Express): void {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, message: "API OK" });
  });

  const adminUsersRouter = express.Router({ mergeParams: true });

  /** GET /api/admin/users/:id — Un usuario por ID (sin contraseña). */
  adminUsersRouter.get("/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const user = await userService.getUserByIdSafe(id);
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      return res.status(200).json(toPlainUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      return res.status(500).json({ message: "Error al obtener usuario" });
    }
  });

  /** PATCH /api/admin/users/:id — Actualizar usuario. */
  adminUsersRouter.patch("/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const existing = await userService.getUserById(id);
      if (!existing) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      const data = updateUserSchema.parse(req.body);
      const update: Record<string, unknown> = {};
      if (data.name !== undefined) update.name = data.name.trim();
      if (data.lastName !== undefined) update.lastName = data.lastName.trim();
      if (data.email !== undefined) update.email = data.email.trim();
      if (data.phone !== undefined) update.phone = data.phone?.trim() ?? null;
      if (data.role !== undefined) update.role = data.role.trim();
      if (Object.keys(update).length > 0) {
        await userService.updateUser(id, update);
      }
      if (data.newPassword) {
        const hashed = await bcrypt.hash(data.newPassword, 10);
        await genFebStorage.updateUserPassword(id, hashed);
      }
      const updated = await userService.getUserByIdSafe(id);
      return res.status(200).json(toPlainUser(updated ?? {}));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error("Error updating user:", error);
      return res.status(500).json({ message: "Error al actualizar usuario" });
    }
  });

  /** GET /api/admin/users — Listado con paginación y filtros. */
  adminUsersRouter.get("/", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
      const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
      const role = (req.query.role as string)?.trim() || undefined;
      const name = (req.query.name as string)?.trim() || undefined;
      const email = (req.query.email as string)?.trim() || undefined;
      const lastName = (req.query.lastName as string)?.trim() || undefined;
      const search = (req.query.search as string)?.trim() || undefined;
      const result = await userService.getUsers({
        role,
        name,
        email,
        lastName,
        search,
        page,
        limit,
      });
      return res.status(200).json(result);
    } catch (error) {
      console.error("Error listing users:", error);
      return res.status(500).json({ message: "Error al listar usuarios" });
    }
  });

  app.use("/api/admin/users", authenticateJWT, requireAdmin, adminUsersRouter);

  // GET /api/admin/withdrawals - Lista usuarios con withdrawingFunds > 0 (solo admin)
  app.get("/api/admin/withdrawals", authenticateJWT, requireAdmin, async (_req, res) => {
    try {
      const list = await genFebStorage.getUsersWithPendingWithdrawals();
      return res.status(200).json(list);
    } catch (error) {
      console.error("Error listing pending withdrawals:", error);
      return res.status(500).json({ message: "Error al listar solicitudes de retiro" });
    }
  });

  const withdrawalActionSchema = z.object({
    action: z.enum(["approve", "reject"]),
    adminNote: z.string().max(500).optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  });

  // PATCH /api/admin/withdrawals/:userId - Aprobar o rechazar retiro (solo admin). Atómico + notificación al usuario. adminNote opcional.
  app.patch("/api/admin/withdrawals/:userId", authenticateJWT, requireAdmin, async (req: any, res) => {
    try {
      const userId = (req.params.userId as string)?.trim();
      if (!userId) return res.status(400).json({ message: "userId es requerido" });
      const parsed = withdrawalActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "action debe ser 'approve' o 'reject'" });
      }
      const adminUserId = req.user?.id as string;
      const { action, adminNote } = parsed.data;

      if (action === "approve") {
        // Liquidación: withdrawingFunds → 0 y registro en historial; el monto NO se transfiere a cuenta admin (pago externo manual).
        const { transfer, user } = await genFebStorage.processWithdrawalApproval(userId, adminUserId);
        const professionalName = (user as { name?: string; firstName?: string; lastName?: string; email?: string }).name
          ?? ([((user as { firstName?: string }).firstName ?? ""), ((user as { lastName?: string }).lastName ?? "")].filter(Boolean).join(" ") || (user as { email?: string }).email || "Usuario");
        const amountFormatted = new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(transfer.amount);

        const approvedMessage = "Tu retiro fue aprobado. Tus fondos fueron enviados a la cuenta bancaria registrada.";
        const notificationData: Record<string, unknown> = {
          message: approvedMessage,
          amount: transfer.amount,
          transferId: transfer.id,
        };
        if (adminNote) notificationData.adminNote = adminNote;

        await genFebStorage.createNotification({
          userId,
          type: "withdrawal_approved",
          data: notificationData,
        });
        const io = getIO();
        const bodyWithNote = adminNote ? `${approvedMessage} Nota: ${adminNote}` : approvedMessage;
        if (io) {
          io.to(`user:${userId}`).emit("notification", {
            type: "withdrawal_approved",
            title: "Retiro aprobado",
            body: bodyWithNote,
            data: { message: approvedMessage, amount: transfer.amount, transferId: transfer.id, adminNote: adminNote ?? undefined },
          });
        }
        void notificationService.sendPushToUser(userId, {
          title: "Retiro aprobado",
          body: bodyWithNote,
        }).catch(() => {});

        // Notificar a los demás admins: el retiro ya fue procesado por otro admin (queda en historial para evitar duplicados)
        const adminWhoProcessed = await genFebStorage.getUserById(adminUserId);
        const adminName = (adminWhoProcessed as { name?: string; firstName?: string; lastName?: string; email?: string })?.name
          ?? ([((adminWhoProcessed as { firstName?: string })?.firstName ?? ""), ((adminWhoProcessed as { lastName?: string })?.lastName ?? "")].filter(Boolean).join(" ") || (adminWhoProcessed as { email?: string })?.email || "Un administrador");
        const { users: allAdmins } = await genFebStorage.getUsers({ role: "admin", page: 1, limit: 100, name: "", email: "", lastName: "" });
        for (const admin of allAdmins ?? []) {
          const aid = (admin as { id?: string }).id;
          if (aid && aid !== adminUserId) {
            await genFebStorage.createNotification({
              userId: aid,
              type: "admin",
              data: {
                type: "withdrawal_processed_by_other",
                action: "approved",
                message: `El retiro de ${professionalName} ($${amountFormatted} USD) fue aprobado por ${adminName}. Ya no aparece en Solicitudes de Retiro.`,
                professionalUserId: userId,
                professionalName,
                amount: transfer.amount,
                amountFormatted,
                processedByAdminId: adminUserId,
                processedByAdminName: adminName,
              },
            });
          }
        }
        if (io) {
          sendNotificationToAdmins(io, {
            type: "withdrawal_processed_by_other",
            action: "approved",
            data: { professionalUserId: userId, professionalName, amountFormatted, processedByAdminName: adminName },
          });
        }

        return res.status(200).json({ message: "Pago aprobado y registrado.", transfer, user: toPlainUser(user) });
      } else {
        // Rollback: withdrawingFunds regresa íntegramente al wallet del profesional; luego withdrawingFunds = 0.
        const { user, amount: rejectedAmount } = await genFebStorage.processWithdrawalRejection(userId);
        await genFebStorage.recordWithdrawalRejection(
          userId,
          rejectedAmount,
          adminUserId,
          (user as { bankName?: string }).bankName,
          (user as { accountNumber?: string }).accountNumber
        );
        const professionalName = (user as { name?: string; firstName?: string; lastName?: string; email?: string }).name
          ?? ([((user as { firstName?: string }).firstName ?? ""), ((user as { lastName?: string }).lastName ?? "")].filter(Boolean).join(" ") || (user as { email?: string }).email || "Usuario");

        const rejectedMessage = "Tu solicitud de retiro fue rechazada. Los fondos fueron devueltos a tu billetera.";
        const rejectionData: Record<string, unknown> = { message: rejectedMessage };
        if (adminNote) rejectionData.adminNote = adminNote;

        await genFebStorage.createNotification({
          userId,
          type: "withdrawal_rejected",
          data: rejectionData,
        });
        const io = getIO();
        const bodyReject = adminNote ? `${rejectedMessage} Nota: ${adminNote}` : rejectedMessage;
        if (io) {
          io.to(`user:${userId}`).emit("notification", {
            type: "withdrawal_rejected",
            title: "Retiro rechazado",
            body: bodyReject,
            data: { message: rejectedMessage, adminNote: adminNote ?? undefined },
          });
        }
        void notificationService.sendPushToUser(userId, {
          title: "Retiro rechazado",
          body: bodyReject,
        }).catch(() => {});

        // Notificar a los demás admins: el retiro fue rechazado por otro admin (queda en historial)
        const adminWhoProcessed = await genFebStorage.getUserById(adminUserId);
        const adminName = (adminWhoProcessed as { name?: string; firstName?: string; lastName?: string; email?: string })?.name
          ?? ([((adminWhoProcessed as { firstName?: string })?.firstName ?? ""), ((adminWhoProcessed as { lastName?: string })?.lastName ?? "")].filter(Boolean).join(" ") || (adminWhoProcessed as { email?: string })?.email || "Un administrador");
        const { users: allAdmins } = await genFebStorage.getUsers({ role: "admin", page: 1, limit: 100, name: "", email: "", lastName: "" });
        for (const admin of allAdmins ?? []) {
          const aid = (admin as { id?: string }).id;
          if (aid && aid !== adminUserId) {
            await genFebStorage.createNotification({
              userId: aid,
              type: "admin",
              data: {
                type: "withdrawal_processed_by_other",
                action: "rejected",
                message: `El retiro de ${professionalName} fue rechazado por ${adminName}. Los fondos fueron devueltos a su billetera.`,
                professionalUserId: userId,
                professionalName,
                processedByAdminId: adminUserId,
                processedByAdminName: adminName,
              },
            });
          }
        }
        if (io) {
          sendNotificationToAdmins(io, {
            type: "withdrawal_processed_by_other",
            action: "rejected",
            data: { professionalUserId: userId, professionalName, processedByAdminName: adminName },
          });
        }

        return res.status(200).json({ message: "Retiro rechazado; fondos devueltos a la billetera del usuario.", user: toPlainUser(user) });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === "Usuario no encontrado" || msg === "No hay retiro pendiente") {
        return res.status(404).json({ message: msg });
      }
      console.error("Error processing withdrawal:", error);
      return res.status(500).json({ message: "Error al procesar la solicitud de retiro" });
    }
  });

  // GET /api/admin/withdrawals/history - Historial de retiros (aprobados/rechazados) con paginación y filtro
  app.get("/api/admin/withdrawals/history", authenticateJWT, requireAdmin, async (req: any, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
      const status = (req.query.status as string)?.toLowerCase();
      const validStatus =
        status === "approved" || status === "rejected" || status === "pending" ? status : "all";
      const { items, total } = await genFebStorage.getWithdrawalHistory({ page, limit, status: validStatus });
      return res.status(200).json({ items, total, page, limit });
    } catch (error) {
      console.error("Error listing withdrawal history:", error);
      return res.status(500).json({ message: "Error al listar historial de retiros" });
    }
  });

  console.log("✅ Admin routes registered (GET/PATCH /api/admin/users/:id, GET /api/admin/users, GET/PATCH /api/admin/withdrawals, GET /api/admin/withdrawals/history)");
}
