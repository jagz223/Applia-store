import type { Express } from "express";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { genFebStorage } from "./storage-genfeb";

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// Throw error if JWT_SECRET is not set in production
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }
  console.warn("⚠️ JWT_SECRET not set. Using development secret. DO NOT USE IN PRODUCTION!");
}

// Use a secure default only for development
const devSecret = "genfeb-dev-secret-change-in-production";
const effectiveSecret = JWT_SECRET || devSecret;

// ============== ESQUEMAS DE VALIDACIÓN ==============

// Schema para registro de usuario
// avatar puede venir como URL (opcional). Si el cliente sube archivo a Storage,
// en el registro enviará solo la downloadURL.
const DUPLICATE_EMAIL_MESSAGE =
  "Este correo electrónico ya está registrado. Inicia sesión si ya tienes cuenta.";

const registerSchema = z.object({
  email: z
    .string()
    .min(1, "El correo es obligatorio")
    .email("Email inválido")
    .transform((s) => s.trim().toLowerCase()),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  lastName: z.string().min(2, "El apellido debe tener al menos 2 caracteres"),
  phone: z.string().optional(),
  role: z.enum(["client", "professional", "admin"]).default("client"),
  avatar: z.string().url("La foto de perfil debe ser una URL válida").optional().or(z.literal("")),
});

// Schema para login
const loginSchema = z.object({
  email: z
    .string()
    .min(1, "El correo es obligatorio")
    .email("Email inválido")
    .transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1, "La contraseña es requerida"),
});

// ============== INTERFACES ==============

interface UserPayload {
  id: string;
  email: string;
  name: string;
  lastName: string;
  role: string;
  phone?: string;
}

// ============== FUNCIONES AUXILIARES ==============

/** Campo en Firestore/usuario: `acceptedProviderTermsOfUse` (inglés). Solo profesionales; el resto se considera aceptado. */
function acceptedProviderTermsOfUseForApi(user: { role?: string; acceptedProviderTermsOfUse?: boolean }): boolean {
  if (user.role !== "professional") return true;
  return user.acceptedProviderTermsOfUse === true;
}

/** Cuerpo de usuario para login, registro, /me y aceptación de términos (sin password). */
function buildAuthClientUser(
  user: Record<string, unknown>,
  provider: { id: number; [key: string]: unknown } | null
) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    lastName: user.lastName,
    role: user.role,
    phone: user.phone,
    avatar: user.avatar,
    bankName: user.bankName,
    accountNumber: user.accountNumber,
    wallet: user.wallet ?? 0,
    pendingBalance: user.pendingBalance ?? 0,
    createdAt: user.createdAt,
    acceptedProviderTermsOfUse: acceptedProviderTermsOfUseForApi(user as { role?: string; acceptedProviderTermsOfUse?: boolean }),
    provider: provider ?? null,
  };
}

// Generate JWT token
function generateToken(user: UserPayload): string {
  return jwt.sign(user, effectiveSecret, { expiresIn: JWT_EXPIRES_IN as any });
}

// Verify JWT token
function verifyToken(token: string): UserPayload | null {
  try {
    return jwt.verify(token, effectiveSecret) as UserPayload;
  } catch {
    return null;
  }
}

// Middleware para verificar JWT
export function authenticateJWT(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }
  
  const token = authHeader.substring(7);
  const user = verifyToken(token);
  
  if (!user) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
  
  req.user = user;
  next();
}

// ============== REGISTRO DE RUTAS ==============

export async function registerAuthRoutes(
  httpServer: Server,
  app: Express
): Promise<void> {
  
  // POST /api/auth/register - Registro de nuevo usuario
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);

      const existing = await genFebStorage.getUserByEmail(data.email);
      if (existing && !(existing as { deletedAt?: unknown }).deletedAt) {
        return res.status(409).json({ message: DUPLICATE_EMAIL_MESSAGE });
      }

      // Hashear la contraseña
      const hashedPassword = await bcrypt.hash(data.password, 10);
      
      // Crear el usuario en storage de GenFeb
      // Nota: el contrato del storage tipa esto como unknown; aquí lo tratamos como objeto de usuario.
      const user = (await genFebStorage.createUser({
        email: data.email,
        password: hashedPassword,
        name: data.name,
        lastName: data.lastName,
        phone: data.phone,
        role: data.role,
        rating: 5,
        ratingCount: 0,
        avatar: data.avatar ? data.avatar : undefined,
      })) as any;
      
      // Generar token
      const token = generateToken({
        id: user.id,
        email: user.email,
        name: user.name,
        lastName: user.lastName,
        role: user.role,
        phone: user.phone,
      });

      res.status(201).json({
        message: "Usuario registrado exitosamente",
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          lastName: user.lastName,
          role: user.role,
          phone: user.phone,
          avatar: (user as { avatar?: string }).avatar,
          acceptedProviderTermsOfUse: acceptedProviderTermsOfUseForApi(user as { role?: string; acceptedProviderTermsOfUse?: boolean }),
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Error de validación", 
          errors: error.errors 
        });
      }
      
      // Usuario duplicado (carrera entre comprobación y createUser, u otro storage)
      if (error instanceof Error && (error.message.includes("ya existe") || error.message.includes("ya está registrado"))) {
        return res.status(409).json({ message: DUPLICATE_EMAIL_MESSAGE });
      }
      
      console.error("Error en registro:", error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });
  
  // POST /api/auth/login - Inicio de sesión
  app.post("/api/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      
      // Buscar usuario
      const user = await genFebStorage.getUserByEmail(data.email);
      
      if (!user) {
        return res.status(401).json({ message: "Credenciales inválidas" });
      }
      
      // Verificar contraseña
      const isValidPassword = await bcrypt.compare(data.password, user.password);
      
      if (!isValidPassword) {
        return res.status(401).json({ message: "Credenciales inválidas" });
      }
      
      // Generar token
      const token = generateToken({
        id: user.id,
        email: user.email,
        name: user.name,
        lastName: user.lastName,
        role: user.role,
        phone: user.phone,
      });

      const provider = await genFebStorage.getProviderByUserId(user.id);
      res.json({
        message: "Login exitoso",
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          lastName: user.lastName,
          role: user.role,
          phone: user.phone,
          avatar: (user as { avatar?: string }).avatar,
          acceptedProviderTermsOfUse: acceptedProviderTermsOfUseForApi(user as { role?: string; acceptedProviderTermsOfUse?: boolean }),
          provider: provider ?? null,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Error de validación", 
          errors: error.errors 
        });
      }
      
      console.error("Error en login:", error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });
  
  // GET /api/auth/me - Usuario logueado; incluye perfil de proveedor si existe (una sola llamada para saber si es proveedor).
  app.get("/api/auth/me", authenticateJWT, async (req: any, res) => {
    try {
      const user = await genFebStorage.getUserById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      const provider = await genFebStorage.getProviderByUserId(req.user.id);
      res.json(
        buildAuthClientUser(user as Record<string, unknown>, provider as { id: number; [key: string]: unknown } | null)
      );
    } catch (error) {
      console.error("Error obteniendo usuario:", error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });
  
  /** Limpia el número de cuenta: solo dígitos, guiones y espacios; elimina caracteres inválidos. */
  function sanitizeAccountNumber(value: string): string {
    return value.replace(/[^\d\s\-]/g, "").replace(/\s+/g, " ").trim();
  }

  // PUT /api/auth/profile - Actualizar perfil
  app.put("/api/auth/profile", authenticateJWT, async (req: any, res) => {
    try {
      const updateSchema = z.object({
        name: z.string().min(2).optional(),
        lastName: z.string().min(2).optional(),
        phone: z.string().optional(),
        avatar: z.string().url().optional(),
        bankName: z.string().max(120).optional().transform((v) => (v === "" ? undefined : v?.trim())),
        accountNumber: z.string().max(40).optional().transform((v) => (v === "" ? undefined : v == null ? undefined : sanitizeAccountNumber(v))),
      });
      
      const data = updateSchema.parse(req.body);
      
      const updatedUser = await genFebStorage.updateUser(req.user.id, data);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      const { password: _p, ...safeUser } = updatedUser as Record<string, unknown>;
      res.json({
        message: "Perfil actualizado",
        user: safeUser,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Error de validación", 
          errors: error.errors 
        });
      }
      
      console.error("Error actualizando perfil:", error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });
  
  // PUT /api/auth/password - Cambiar contraseña
  app.put("/api/auth/password", authenticateJWT, async (req: any, res) => {
    try {
      const passwordSchema = z.object({
        currentPassword: z.string().min(1, "Contraseña actual requerida"),
        newPassword: z.string().min(6, "Nueva contraseña debe tener al menos 6 caracteres"),
      });
      
      const data = passwordSchema.parse(req.body);
      
      // Obtener usuario actual
      const user = await genFebStorage.getUserById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      
      // Verificar contraseña actual
      const isValidPassword = await bcrypt.compare(data.currentPassword, user.password);
      
      if (!isValidPassword) {
        return res.status(401).json({ message: "Contraseña actual incorrecta" });
      }
      
      // Hashear nueva contraseña
      const hashedPassword = await bcrypt.hash(data.newPassword, 10);
      
      // Actualizar contraseña
      await genFebStorage.updateUserPassword(req.user.id, hashedPassword);
      
      res.json({ message: "Contraseña actualizada correctamente" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Error de validación", 
          errors: error.errors 
        });
      }
      
      console.error("Error cambiando contraseña:", error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });
  
  // POST /api/auth/accept-provider-terms-of-use — Profesional acepta el estatuto (campo `acceptedProviderTermsOfUse`).
  app.post("/api/auth/accept-provider-terms-of-use", authenticateJWT, async (req: any, res) => {
    try {
      const full = await genFebStorage.getUserById(req.user.id);
      if (!full) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      if (full.role !== "professional") {
        return res.status(403).json({ message: "Solo los profesionales deben aceptar estas condiciones" });
      }
      const updated = await genFebStorage.updateUser(req.user.id, { acceptedProviderTermsOfUse: true } as any);
      if (!updated) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      const provider = await genFebStorage.getProviderByUserId(req.user.id);
      const { password: _p, ...safe } = updated as Record<string, unknown>;
      void _p;
      res.json({
        message: "Condiciones de uso aceptadas",
        user: buildAuthClientUser(safe, provider as { id: number; [key: string]: unknown } | null),
      });
    } catch (error) {
      console.error("Error aceptando condiciones de prestador:", error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // POST /api/auth/logout - Cerrar sesión (invalidar token en cliente)
  app.post("/api/auth/logout", authenticateJWT, async (req, res) => {
    // En una implementación robusta, blacklistearíamos el token
    res.json({ message: "Sesión cerrada correctamente" });
  });

  // DELETE /api/auth/account - Eliminar cuenta de usuario
  app.delete("/api/auth/account", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Eliminar el usuario de storage
      await genFebStorage.deleteUser(userId);
      
      res.json({ message: "Cuenta eliminada correctamente" });
    } catch (error) {
      console.error("Error eliminando cuenta:", error);
      res.status(500).json({ message: "Error interno del servidor al eliminar la cuenta" });
    }
  });
  
  // POST /api/auth/seed-admin - Crear usuario administrador (solo para desarrollo)
  app.post("/api/auth/seed-admin", async (req, res) => {
    try {
      // Verificar secret key para protección
      const secretKey = req.headers["x-admin-key"];
      if (secretKey !== "genfeb-admin-secret-2024" && process.env.NODE_ENV === "production") {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      // Verificar si ya existe
      const existing = await genFebStorage.getUserByEmail("admin@genfeb.com");
      if (existing) {
        return res.json({ message: "Admin user already exists", user: { email: existing.email, role: existing.role } });
      }
      
      // Crear admin
      const hashedPassword = await bcrypt.hash("admin123456", 10);
      const admin = await genFebStorage.createUser({
        email: "admin@genfeb.com",
        password: hashedPassword,
        name: "Administrador",
        lastName: "GenFeb",
        phone: "+593999999999",
        role: "admin",
      });
      
      const token = generateToken({
        id: admin.id,
        email: admin.email,
        name: admin.name,
        lastName: admin.lastName,
        role: admin.role,
        phone: admin.phone,
      });
      
      res.status(201).json({
        message: "Admin user created successfully",
        token,
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          lastName: admin.lastName,
          role: admin.role,
        },
      });
    } catch (error) {
      console.error("Error creating admin:", error);
      res.status(500).json({ message: "Error creating admin user" });
    }
  });
  
  console.log("✅ JWT Authentication routes registered");
}
