/**
 * Servicio de dominio: Usuarios.
 * Encapsula la lógica de negocio y delega persistencia en IStorage (SOLID - Single Responsibility).
 */

import type { IUserStorage } from "../storage-contracts";

export interface GetUsersParams {
  role?: string;
  name?: string;
  email?: string;
  lastName?: string;
  search?: string;
  page: number;
  limit: number;
}

export class UserService {
  constructor(private readonly storage: IUserStorage) {}

  async getUsers(params: GetUsersParams) {
    return this.storage.getUsers(params);
  }

  async getUserById(id: string) {
    return this.storage.getUserById(id);
  }

  async getUserByEmail(email: string) {
    return this.storage.getUserByEmail(email);
  }

  /** Obtiene un usuario por ID sin exponer la contraseña. */
  async getUserByIdSafe(id: string) {
    const user = await this.storage.getUserById(id);
    if (!user || typeof user !== "object") return undefined;
    const { password: _p, ...rest } = user as Record<string, unknown>;
    return rest;
  }

  async updateUser(id: string, data: Record<string, unknown>) {
    return this.storage.updateUser(id, data);
  }
}
