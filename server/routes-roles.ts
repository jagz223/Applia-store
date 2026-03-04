/**
 * Rutas de definición de roles (CRUD).
 * Rutas finas: validan con Zod y delegan en RoleService.
 */

import type { Express } from "express";
import { z } from "zod";
import { authenticateJWT } from "./routes-auth";
import { roleService } from "./services";
import type { NewRoleDefinition } from "./storage-genfeb";

const createRoleSchema = z.object({
  code: z.string().min(1, "El código es requerido").max(50),
  name: z.string().min(1, "El nombre es requerido").max(100),
  description: z.string().max(500).optional(),
  isSystem: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Se requiere rol de administrador" });
  }
  next();
}

export function registerRoleRoutes(app: Express): void {
  app.get("/api/roles", authenticateJWT, async (_req, res) => {
    try {
      const roles = await roleService.getRoles();
      res.json(roles);
    } catch (error) {
      console.error("Error listing roles:", error);
      res.status(500).json({ message: "Error al listar roles" });
    }
  });

  app.get("/api/roles/:code", authenticateJWT, async (req, res) => {
    try {
      const role = await roleService.getRoleByCode(req.params.code);
      if (!role) return res.status(404).json({ message: "Rol no encontrado" });
      res.json(role);
    } catch (error) {
      console.error("Error getting role:", error);
      res.status(500).json({ message: "Error al obtener rol" });
    }
  });

  app.post("/api/roles", authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const data = createRoleSchema.parse(req.body);
      const role = await roleService.createRole(data as NewRoleDefinition);
      res.status(201).json(role);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      if (error instanceof Error && error.message.includes("Ya existe")) {
        return res.status(409).json({ message: error.message });
      }
      console.error("Error creating role:", error);
      res.status(500).json({ message: "Error al crear rol" });
    }
  });

  app.patch("/api/roles/:code", authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const data = updateRoleSchema.parse(req.body);
      const role = await roleService.updateRole(req.params.code, data);
      if (!role) return res.status(404).json({ message: "Rol no encontrado" });
      res.json(role);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error("Error updating role:", error);
      res.status(500).json({ message: "Error al actualizar rol" });
    }
  });

  app.delete("/api/roles/:code", authenticateJWT, requireAdmin, async (req, res) => {
    try {
      await roleService.deleteRole(req.params.code);
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message.includes("No se puede eliminar")) {
        return res.status(403).json({ message: error.message });
      }
      console.error("Error deleting role:", error);
      res.status(500).json({ message: "Error al eliminar rol" });
    }
  });

  console.log("✅ Role definition routes registered (GET/POST/PATCH/DELETE /api/roles)");
}
