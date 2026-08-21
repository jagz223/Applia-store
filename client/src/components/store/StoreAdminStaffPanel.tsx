import { useMemo, useState } from "react";
import { ExternalLink, Loader2, Users } from "lucide-react";
import type { StoreBranch } from "@shared/store-schema";
import type { StoreMemberRole } from "@shared/store-staff-schema";
import { buildStoreWhatsappUrl, formatStoreWhatsappDisplay } from "@shared/store-whatsapp";
import {
  useStoreStaffDirectory,
  useUpdateStoreStaffMember,
  type StoreStaffListFilters,
} from "@/hooks/use-store-staff";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  storeAdminFieldClass,
  storeAdminSectionCardClass,
} from "@/components/store/store-admin-ui";

const ROLE_OPTIONS: { value: "all" | StoreMemberRole; label: string }[] = [
  { value: "all", label: "Todos los roles" },
  { value: "client", label: "Cliente" },
  { value: "employee", label: "Empleado" },
];

export function StoreAdminStaffPanel({
  storeId,
  branches,
  canManageStaff = true,
}: {
  storeId: number;
  branches: StoreBranch[];
  canManageStaff?: boolean;
}) {
  const { toast } = useToast();
  const [emailFilter, setEmailFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | StoreMemberRole>("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [draftRoles, setDraftRoles] = useState<Record<string, StoreMemberRole>>({});
  const [draftBranches, setDraftBranches] = useState<Record<string, string>>({});

  const filters = useMemo((): StoreStaffListFilters => {
    const next: StoreStaffListFilters = {};
    if (emailFilter.trim()) next.email = emailFilter.trim();
    if (phoneFilter.trim()) next.phone = phoneFilter.trim();
    if (nameFilter.trim()) next.name = nameFilter.trim();
    if (roleFilter !== "all") next.role = roleFilter;
    if (branchFilter !== "all") next.branchId = branchFilter;
    return next;
  }, [emailFilter, phoneFilter, nameFilter, roleFilter, branchFilter]);

  const { data: members = [], isLoading, error } = useStoreStaffDirectory(storeId, filters);
  const updateMutation = useUpdateStoreStaffMember(storeId);

  function roleForUser(userId: string, current: StoreMemberRole): StoreMemberRole {
    return draftRoles[userId] ?? current;
  }

  function branchForUser(userId: string, current: string | null): string {
    return draftBranches[userId] ?? current ?? branches[0]?.id ?? "primary";
  }

  async function saveMember(userId: string, currentRole: StoreMemberRole, currentBranchId: string | null) {
    const role = roleForUser(userId, currentRole);
    const branchId = role === "employee" ? branchForUser(userId, currentBranchId) : null;
    try {
      await updateMutation.mutateAsync({ userId, role, branchId });
      setDraftRoles((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setDraftBranches((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      toast({ title: "Usuario actualizado", description: "Los cambios se guardaron correctamente." });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  return (
    <Card className={storeAdminSectionCardClass}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Users className="h-5 w-5" />
          Usuarios
        </CardTitle>
        <CardDescription>
          {canManageStaff
            ? "Clientes que han comprado en la tienda y empleados con acceso al panel de órdenes."
            : "Consulta de clientes y empleados. Solo el administrador puede cambiar roles o sucursales."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="staff-email-filter">Correo</Label>
            <Input
              id="staff-email-filter"
              placeholder="Buscar por correo"
              className={storeAdminFieldClass}
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-phone-filter">Teléfono</Label>
            <Input
              id="staff-phone-filter"
              placeholder="Buscar por número"
              className={storeAdminFieldClass}
              value={phoneFilter}
              onChange={(e) => setPhoneFilter(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-name-filter">Nombre</Label>
            <Input
              id="staff-name-filter"
              placeholder="Buscar por nombre"
              className={storeAdminFieldClass}
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-role-filter">Rol</Label>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
              <SelectTrigger id="staff-role-filter" className={storeAdminFieldClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-branch-filter">Sucursal</Label>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger id="staff-branch-filter" className={storeAdminFieldClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sucursales</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No hay usuarios con esos filtros.</p>
        ) : (
          <div className="rounded-2xl border border-border/70 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Sucursal</TableHead>
                  {canManageStaff ? <TableHead className="text-right">Acción</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const role = roleForUser(member.userId, member.role);
                  const branchId = branchForUser(member.userId, member.branchId);
                  const dirty =
                    role !== member.role ||
                    (role === "employee" && branchId !== (member.branchId ?? ""));
                  return (
                    <TableRow key={member.userId}>
                      <TableCell>{member.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{member.email}</TableCell>
                      <TableCell className="text-sm">
                        {(() => {
                          if (!member.phone) return "—";
                          const whatsappUrl = buildStoreWhatsappUrl(member.phone);
                          if (!whatsappUrl) return member.phone;
                          const display = formatStoreWhatsappDisplay(member.phone) ?? member.phone;
                          return (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#25D366] hover:underline"
                            >
                              <span>{display}</span>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {canManageStaff ? (
                          <Select
                            value={role}
                            onValueChange={(v) =>
                              setDraftRoles((prev) => ({ ...prev, [member.userId]: v as StoreMemberRole }))
                            }
                          >
                            <SelectTrigger className={`${storeAdminFieldClass} w-[130px]`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="client">Cliente</SelectItem>
                              <SelectItem value="employee">Empleado</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={member.role === "employee" ? "default" : "outline"}>
                            {member.role === "employee" ? "Empleado" : "Cliente"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {canManageStaff ? (
                          role === "employee" ? (
                            <Select
                              value={branchId}
                              onValueChange={(v) =>
                                setDraftBranches((prev) => ({ ...prev, [member.userId]: v }))
                              }
                            >
                              <SelectTrigger className={`${storeAdminFieldClass} min-w-[160px]`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {branches.map((branch) => (
                                  <SelectItem key={branch.id} value={branch.id}>
                                    {branch.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline">—</Badge>
                          )
                        ) : (
                          <span className="text-sm">{member.branchName ?? "—"}</span>
                        )}
                      </TableCell>
                      {canManageStaff ? (
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            disabled={!dirty || updateMutation.isPending}
                            onClick={() => void saveMember(member.userId, member.role, member.branchId)}
                          >
                            {updateMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Guardar"
                            )}
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
