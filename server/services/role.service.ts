/**
 * Servicio de dominio: Roles (catálogo de definición de roles).
 * Encapsula lógica de negocio y asegura que los roles por defecto existan.
 */

import type { IRoleStorage } from "../storage-contracts";
import type { RoleDefinition, NewRoleDefinition } from "../storage-genfeb";

export class RoleService {
  constructor(private readonly storage: IRoleStorage) {}

  async ensureRolesSeeded(): Promise<void> {
    await this.storage.seedRoles();
  }

  async getRoles(): Promise<RoleDefinition[]> {
    await this.ensureRolesSeeded();
    return this.storage.getRoles() as Promise<RoleDefinition[]>;
  }

  async getRoleByCode(code: string): Promise<RoleDefinition | undefined> {
    return this.storage.getRoleByCode(code) as Promise<RoleDefinition | undefined>;
  }

  async createRole(role: NewRoleDefinition): Promise<RoleDefinition> {
    return this.storage.createRole(role) as Promise<RoleDefinition>;
  }

  async updateRole(code: string, data: Partial<RoleDefinition>): Promise<RoleDefinition | undefined> {
    return this.storage.updateRole(code, data) as Promise<RoleDefinition | undefined>;
  }

  async deleteRole(code: string): Promise<void> {
    await this.storage.deleteRole(code);
  }
}
