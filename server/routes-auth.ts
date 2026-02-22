import type { Express } from "express";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { genFebStorage } from "./storage-genfeb";

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || "genfeb-jwt-secret-key-2024";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// ============== ESQUEMAS DE VALIDACIÓN ==============

// Schema para registro de usuario
const registerSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  lastName: z.string().min(2, "El apellido debe tener al menos 2 caracteres"),
  phone: z.string().optional(),
  role: z.enum(["client", "professional"]).default("client"),
});

// Schema para login
const loginSchema = z.object({
  email: z.string().email("Email inválido"),
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

// Generar token JWT
function generateToken(user: UserPayload): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}

// Verificar token JWT
function verifyToken(token: string): UserPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch {
    return null;
  }
}

// Middleware para verificar JWT
function authenticateJWT(req: any, res: any, next: any) {
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
      
      // Verificar si el usuario ya existe en storage principal
      // (En una app real, buscaríamos en la base de datos)
      
      // Hashear la contraseña
      const hashedPassword = await bcrypt.hash(data.password, 10);
      
      // Crear el usuario en storage de GenFeb
      const user = await genFebStorage.createUser({
        email: data.email,
        password: hashedPassword,
        name: data.name,
        lastName: data.lastName,
        phone: data.phone,
        role: data.role,
      });
      
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
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Error de validación", 
          errors: error.errors 
        });
      }
      
      // Verificar si es error de usuario existente
      if (error instanceof Error && error.message.includes("ya existe")) {
        return res.status(409).json({ message: error.message });
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
  
  // GET /api/auth/me - Obtener usuario actual
  app.get("/api/auth/me", authenticateJWT, async (req: any, res) => {
    try {
      const user = await genFebStorage.getUserById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      
      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        lastName: user.lastName,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        createdAt: user.createdAt,
      });
    } catch (error) {
      console.error("Error obteniendo usuario:", error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });
  
  // PUT /api/auth/profile - Actualizar perfil
  app.put("/api/auth/profile", authenticateJWT, async (req: any, res) => {
    try {
      const updateSchema = z.object({
        name: z.string().min(2).optional(),
        lastName: z.string().min(2).optional(),
        phone: z.string().optional(),
        avatar: z.string().url().optional(),
      });
      
      const data = updateSchema.parse(req.body);
      
      const updatedUser = await genFebStorage.updateUser(req.user.id, data);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      
      res.json({
        message: "Perfil actualizado",
        user: updatedUser,
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
  
  // POST /api/auth/logout - Cerrar sesión (invalidar token en cliente)
  app.post("/api/auth/logout", authenticateJWT, async (req, res) => {
    // En una implementación robusta, blacklistearíamos el token
    res.json({ message: "Sesión cerrada correctamente" });
  });
  
  console.log("✅ JWT Authentication routes registered");
}
