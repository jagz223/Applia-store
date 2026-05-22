import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Pencil, Shield, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isImmutableRoleCode } from "@shared/role-definition";
import {
  countEnabledPermissions,
  resolveRolePermissions,
  summarizeEnabledPermissions,
} from "@shared/role-permissions";
import { filterVisibleCatalogRoles } from "@/lib/role-catalog-utils";
import { AdminRoleFormDialog } from "./AdminRoleFormDialog";

export type RoleDefinitionRow = {
  code: string;
  name: string;
  description?: string;
  responsibilities?: string;
  permissions?: Record<string, boolean>;
  isSystem?: boolean;
  sortOrder?: number;
};

async function fetchRoles(): Promise<RoleDefinitionRow[]> {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/roles", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("No se pudieron cargar los roles");
  const data = await res.json();
  return filterVisibleCatalogRoles(Array.isArray(data) ? data : []);
}

export function AdminRolesPanel() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view">("create");
  const [selectedRole, setSelectedRole] = useState<RoleDefinitionRow | null>(null);

  const { data: roles = [], isLoading, isError } = useQuery({
    queryKey: ["roles"],
    queryFn: fetchRoles,
  });

  const sorted = [...roles].sort((a, b) => {
    const order = (a.sortOrder ?? 99) - (b.sortOrder ?? 99);
    if (order !== 0) return order;
    return (a.name ?? a.code).localeCompare(b.name ?? b.code, "es");
  });

  function openCreate() {
    setSelectedRole(null);
    setDialogMode("create");
    setDialogOpen(true);
  }

  function openEdit(role: RoleDefinitionRow) {
    setSelectedRole(role);
    setDialogMode(isImmutableRoleCode(role.code) ? "view" : "edit");
    setDialogOpen(true);
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Gestión de roles
            </CardTitle>
            <CardDescription>
              Permisos por bloques: administrativas (panel staff), asociado/central y cliente.
            </CardDescription>
          </div>
          <Button type="button" className="shrink-0" onClick={openCreate}>
            <UserPlus className="h-4 w-4 mr-2" />
            Crear nuevo rol
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <p className="text-center py-8 text-destructive text-sm">Error al cargar roles.</p>
          ) : sorted.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No hay roles en el catálogo.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rol</TableHead>
                    <TableHead>Permisos activos</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((role) => {
                    const immutable = isImmutableRoleCode(role.code);
                    const perms = resolveRolePermissions(role.code, role.permissions);
                    const count = countEnabledPermissions(perms);
                    const summary = summarizeEnabledPermissions(perms);
                    return (
                      <TableRow key={role.code}>
                        <TableCell>
                          <p className="font-medium">{role.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{role.code}</p>
                          {role.description ? (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{role.description}</p>
                          ) : null}
                          {immutable ? (
                            <Badge variant="outline" className="mt-1.5 text-xs">
                              Inmutable
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm max-w-md">
                          <p className="font-medium text-foreground">{count} permiso{count !== 1 ? "s" : ""}</p>
                          {summary.length > 0 ? (
                            <ul className="mt-1 text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                              {summary.slice(0, 3).map((line) => (
                                <li key={line} className="line-clamp-1">{line}</li>
                              ))}
                              {summary.length > 3 ? <li>…</li> : null}
                            </ul>
                          ) : (
                            <p className="text-xs text-amber-600">Sin permisos marcados</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {immutable ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(role)}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Ver permisos</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Button type="button" size="sm" variant="outline" onClick={() => openEdit(role)}>
                              <Pencil className="h-4 w-4 mr-1" />
                              Editar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AdminRoleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        role={selectedRole}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["roles"] })}
      />
    </>
  );
}
