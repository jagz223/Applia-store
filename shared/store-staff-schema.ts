import { z } from "zod";

export const storeMemberRoleSchema = z.enum(["client", "employee"]);
export type StoreMemberRole = z.infer<typeof storeMemberRoleSchema>;

export type StoreStaffRecord = {
  storeId: number;
  userId: string;
  role: "employee";
  branchId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type StoreStaffDirectoryEntry = {
  userId: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: StoreMemberRole;
  branchId: string | null;
  branchName: string | null;
};

export type StoreStaffListFilters = {
  email?: string;
  phone?: string;
  name?: string;
  role?: StoreMemberRole;
  branchId?: string;
};

export const updateStoreStaffMemberSchema = z
  .object({
    role: storeMemberRoleSchema,
    branchId: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "employee" && !data.branchId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecciona una sucursal para el empleado.",
        path: ["branchId"],
      });
    }
  });

export type UpdateStoreStaffMemberInput = z.infer<typeof updateStoreStaffMemberSchema>;

export const storeStaffListQuerySchema = z.object({
  email: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  name: z.string().trim().max(120).optional(),
  role: storeMemberRoleSchema.optional(),
  branchId: z.string().trim().max(64).optional(),
});

export function displayUserName(user: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string | null {
  const fromParts = [user.firstName ?? "", user.lastName ?? ""].filter(Boolean).join(" ").trim();
  const name = (user.name ?? fromParts).trim();
  return name || null;
}

export function matchesStoreStaffListFilters(
  entry: StoreStaffDirectoryEntry,
  filters?: StoreStaffListFilters,
): boolean {
  if (!filters) return true;
  if (filters.email?.trim()) {
    const q = filters.email.trim().toLowerCase();
    if (!entry.email.toLowerCase().includes(q)) return false;
  }
  if (filters.phone?.trim()) {
    const q = filters.phone.replace(/\D/g, "");
    const phone = (entry.phone ?? "").replace(/\D/g, "");
    if (!phone.includes(q)) return false;
  }
  if (filters.name?.trim()) {
    const q = filters.name.trim().toLowerCase();
    const name = (entry.name ?? "").toLowerCase();
    if (!name.includes(q)) return false;
  }
  if (filters.role && entry.role !== filters.role) return false;
  if (filters.branchId?.trim()) {
    if (entry.branchId !== filters.branchId.trim()) return false;
  }
  return true;
}
