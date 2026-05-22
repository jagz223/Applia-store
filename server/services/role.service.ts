/**
 * Servicio de dominio: Roles (catálogo de definición de roles).
 * Encapsula lógica de negocio y asegura que los roles por defecto existan.
 */

import { isImmutableRoleCode } from "@shared/role-definition";
import { isHiddenCatalogRoleCode } from "@shared/role-permissions";
import type { IRoleStorage } from "../storage-contracts";
import type { RoleDefinition, NewRoleDefinition } from "../storage-genfeb";

const IMMUTABLE_ROLE_MESSAGE =
  "El rol administrador no puede crearse ni modificarse desde el catálogo.";

export class RoleService {
  constructor(private readonly storage: IRoleStorage) {}

  async ensureRolesSeeded(): Promise<void> {
    await this.storage.seedRoles();
  }

  async getRoles(): Promise<RoleDefinition[]> {
    await this.ensureRolesSeeded();
    const all = (await this.storage.getRoles()) as RoleDefinition[];
    return all.filter((r) => !isHiddenCatalogRoleCode(r.code));
  }

  async getRoleByCode(code: string): Promise<RoleDefinition | undefined> {
    return this.storage.getRoleByCode(code) as Promise<RoleDefinition | undefined>;
  }

  async createRole(role: NewRoleDefinition): Promise<RoleDefinition> {
    const code = role.code.trim().toLowerCase().replace(/\s+/g, "_");
    if (isImmutableRoleCode(code)) {
      throw new Error(IMMUTABLE_ROLE_MESSAGE);
    }
    return this.storage.createRole({ ...role, code }) as Promise<RoleDefinition>;
  }

  async updateRole(code: string, data: Partial<RoleDefinition>): Promise<RoleDefinition | undefined> {
    if (isImmutableRoleCode(code)) {
      throw new Error(IMMUTABLE_ROLE_MESSAGE);
    }
    return this.storage.updateRole(code, data) as Promise<RoleDefinition | undefined>;
  }

  async deleteRole(code: string): Promise<void> {
    if (isImmutableRoleCode(code)) {
      throw new Error(IMMUTABLE_ROLE_MESSAGE);
    }
    await this.storage.deleteRole(code);
  }
}
