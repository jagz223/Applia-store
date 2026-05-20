import bcrypt from "bcryptjs";
import { isCentralRole } from "@shared/roles";
import type { CentralMemberSummary, CentralMemberType } from "@shared/central-member";
import { genFebStorage } from "./storage-genfeb";
import { getDispatchCompany } from "./dispatch-companies";

type UserRow = {
  id: string;
  name?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
  dispatchCompanyId?: string | null;
  deletedAt?: unknown;
  createdAt?: Date | string;
};

type ProviderRow = {
  userId?: string;
  dispatchCompanyId?: string | null;
};

function toIsoDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return String(v);
}

function vehicleLabel(brand?: string | null, model?: string | null): string | null {
  const b = String(brand ?? "").trim();
  const m = String(model ?? "").trim();
  if (!b && !m) return null;
  return [b, m].filter(Boolean).join(" ");
}

/** Usuario pertenece a la empresa: operador (rol central) o conductor (provider). */
export async function memberBelongsToCompany(
  userId: string,
  companyId: string,
): Promise<{ ok: true; memberType: CentralMemberType } | { ok: false }> {
  const user = (await genFebStorage.getUserById(userId)) as UserRow | null;
  if (!user || user.deletedAt) return { ok: false };

  if (isCentralRole(user.role) && String(user.dispatchCompanyId ?? "") === companyId) {
    return { ok: true, memberType: "central" };
  }

  const provider = (await genFebStorage.getProviderByUserId(userId)) as ProviderRow | null;
  if (provider && String(provider.dispatchCompanyId ?? "") === companyId) {
    return { ok: true, memberType: "driver" };
  }

  return { ok: false };
}

export async function listCompanyMembers(companyId: string): Promise<CentralMemberSummary[]> {
  const byUserId = new Map<string, CentralMemberSummary>();

  const { users } = await genFebStorage.getUsers({ page: 1, limit: 50_000 });
  for (const raw of users) {
    const u = raw as UserRow;
    if (u.deletedAt) continue;
    if (!isCentralRole(u.role)) continue;
    if (String(u.dispatchCompanyId ?? "") !== companyId) continue;
    byUserId.set(u.id, {
      userId: u.id,
      memberType: "central",
      name: u.name ?? "",
      lastName: u.lastName ?? "",
      email: u.email ?? "",
      phone: u.phone ?? "",
      role: u.role ?? "central",
      licensePlate: null,
      vehicleLabel: null,
      createdAt: toIsoDate(u.createdAt),
    });
  }

  const providers = await genFebStorage.getAllProviders();
  for (const p of providers) {
    if (String((p as ProviderRow).dispatchCompanyId ?? "") !== companyId) continue;
    const userId = String((p as { userId?: string }).userId ?? "");
    if (!userId) continue;

    const user = (await genFebStorage.getUserById(userId)) as UserRow | null;
    if (!user || user.deletedAt) continue;

    const vehicle = await genFebStorage.getPrimaryVehicleByUserId(userId);
    byUserId.set(userId, {
      userId,
      memberType: "driver",
      name: user.name ?? "",
      lastName: user.lastName ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      role: user.role ?? "professional",
      licensePlate: vehicle?.license_plate ?? null,
      vehicleLabel: vehicleLabel(vehicle?.brand, vehicle?.model),
      createdAt: toIsoDate(user.createdAt),
      credentialsManagedOutsideCentral: Boolean(
        (user as { credentialsManagedOutsideCentral?: boolean }).credentialsManagedOutsideCentral,
      ),
    });
  }

  return [...byUserId.values()].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}

/** Usuarios operadores de central (`role=central`) asignados a la empresa. */
export async function listCentralOperatorUserIds(companyId: string): Promise<string[]> {
  const ids: string[] = [];
  const { users } = await genFebStorage.getUsers({ page: 1, limit: 50_000 });
  for (const raw of users) {
    const u = raw as UserRow;
    if (u.deletedAt) continue;
    if (!isCentralRole(u.role)) continue;
    if (String(u.dispatchCompanyId ?? "") !== companyId) continue;
    ids.push(u.id);
  }
  const company = await getDispatchCompany(companyId);
  const ownerId = company?.ownerUserId;
  if (ownerId && !ids.includes(ownerId)) {
    const owner = (await genFebStorage.getUserById(ownerId)) as UserRow | null;
    if (owner && !owner.deletedAt) ids.push(ownerId);
  }
  return ids;
}

export async function patchCompanyMember(
  userId: string,
  companyId: string,
  patch: { email?: string; phone?: string; newPassword?: string },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const belongs = await memberBelongsToCompany(userId, companyId);
  if (!belongs.ok) return { ok: false, error: "Usuario no pertenece a esta empresa", status: 404 };

  const userRow = (await genFebStorage.getUserById(userId)) as { credentialsManagedOutsideCentral?: boolean } | null;
  if (
    userRow?.credentialsManagedOutsideCentral &&
    (patch.email != null || patch.phone != null || patch.newPassword != null)
  ) {
    return {
      ok: false,
      error: "Este usuario registró su cuenta por fuera de la central: no se pueden cambiar correo, teléfono ni contraseña desde aquí.",
      status: 403,
    };
  }

  if (patch.email) {
    const email = patch.email.trim().toLowerCase();
    const existing = (await genFebStorage.getUserByEmail(email)) as UserRow | null | undefined;
    if (existing?.id && existing.id !== userId && !existing.deletedAt) {
      return { ok: false, error: "El correo ya está registrado.", status: 409 };
    }
    await genFebStorage.updateUser(userId, { email } as Parameters<typeof genFebStorage.updateUser>[1]);
  }

  if (patch.phone) {
    const existingPhone = (await genFebStorage.getUserByPhone(patch.phone.trim())) as UserRow | null | undefined;
    if (existingPhone?.id && existingPhone.id !== userId) {
      return { ok: false, error: "El teléfono ya está registrado.", status: 409 };
    }
    await genFebStorage.updateUser(userId, { phone: patch.phone.trim() } as Parameters<typeof genFebStorage.updateUser>[1]);
  }

  if (patch.newPassword) {
    const hashed = await bcrypt.hash(patch.newPassword, 10);
    await genFebStorage.updateUserPassword(userId, hashed);
  }

  return { ok: true };
}
