/**
 * Servicio de dominio: registro de usuarios por personal administrativo.
 * Centraliza la lógica de creación (incl. empresa despachadora) fuera de las rutas HTTP.
 */

import bcrypt from "bcryptjs";
import {
  adminCreateUserSchema,
  assertRoleAllowedForCreator,
  type AdminCreateUserInput,
} from "@shared/admin-user-registration";
import type { IUserStorage, IRoleStorage } from "../storage-contracts";
import { createDispatchCompany } from "../dispatch-companies";

const DUPLICATE_EMAIL_MESSAGE =
  "Este correo electrónico ya está registrado.";
const DUPLICATE_PHONE_MESSAGE = "Este teléfono ya está registrado.";

export class AdminUserRegistrationService {
  constructor(
    private readonly storage: IUserStorage,
    private readonly roleStorage: IRoleStorage
  ) {}

  async createUser(raw: unknown, creatorRole: string | undefined | null) {
    const data = adminCreateUserSchema.parse(raw);
    const roleCode = data.role.trim().toLowerCase();
    const roleDef = await this.roleStorage.getRoleByCode(roleCode);
    if (!roleDef) {
      const err = new Error("El rol seleccionado no existe en el catálogo");
      (err as Error & { statusCode?: number; field?: string }).statusCode = 400;
      (err as Error & { field?: string }).field = "role";
      throw err;
    }
    assertRoleAllowedForCreator(roleCode, creatorRole);
    return this.createFromValidated({ ...data, role: roleCode });
  }

  private async createFromValidated(data: AdminCreateUserInput) {
    const existing = await this.storage.getUserByEmail(data.email);
    if (existing && !(existing as { deletedAt?: unknown }).deletedAt) {
      const err = new Error(DUPLICATE_EMAIL_MESSAGE);
      (err as Error & { statusCode?: number; field?: string }).statusCode = 409;
      (err as Error & { field?: string }).field = "email";
      throw err;
    }

    const existingPhone = await this.storage.getUserByPhone(data.phone, true);
    if (existingPhone) {
      const err = new Error(DUPLICATE_PHONE_MESSAGE);
      (err as Error & { statusCode?: number; field?: string }).statusCode = 409;
      (err as Error & { field?: string }).field = "phone";
      throw err;
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = (await this.storage.createUser({
      email: data.email,
      password: hashedPassword,
      name: data.name,
      lastName: data.lastName,
      phone: data.phone,
      role: data.role,
      rating: 5,
      ratingCount: 0,
      avatar: data.avatar?.trim() ? data.avatar.trim() : undefined,
    })) as Record<string, unknown>;

    if (data.role === "central") {
      const company = await createDispatchCompany({
        name: String(data.companyName ?? "").trim(),
        ownerUserId: String(user.id),
      });
      await this.storage.updateUser(String(user.id), {
        dispatchCompanyId: company.id,
        pendingCentralSetup: false,
      } as Record<string, unknown>);
      user.dispatchCompanyId = company.id;
    }

    const { password: _p, ...safe } = user;
    return safe;
  }
}
