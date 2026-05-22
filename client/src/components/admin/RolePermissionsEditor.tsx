import { useMemo } from "react";
import {
  ADMIN_PERMISSION_AREAS,
  ADMIN_SUITE_MASTER_KEY,
  ASSOCIATE_CENTRAL_PERMISSION_AREAS,
  CLIENT_PERMISSION_AREA,
  ALL_ROLE_PERMISSION_KEYS,
  isAdminSuiteEnabled,
  emptyPermissionsMap,
  type RolePermissionKey,
  type RolePermissionsMap,
  type RolePermissionArea,
} from "@shared/role-permissions";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type RolePermissionsEditorProps = {
  value: RolePermissionsMap;
  onChange: (next: Record<RolePermissionKey, boolean>) => void;
  readOnly?: boolean;
  disabled?: boolean;
};

export function normalizePermissionsValue(
  raw?: RolePermissionsMap | null
): Record<RolePermissionKey, boolean> {
  const base = emptyPermissionsMap();
  if (!raw) return base;
  for (const key of ALL_ROLE_PERMISSION_KEYS) {
    if (typeof raw[key] === "boolean") {
      base[key] = raw[key]!;
    }
  }
  return base;
}

function PermissionGrid({
  area,
  perms,
  readOnly,
  disabled,
  onToggle,
}: {
  area: RolePermissionArea;
  perms: Record<RolePermissionKey, boolean>;
  readOnly: boolean;
  disabled: boolean;
  onToggle: (key: RolePermissionKey, checked: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-foreground">{area.label}</p>
        {area.description ? (
          <p className="text-xs text-muted-foreground">{area.description}</p>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {area.permissions.map((p) => {
          const key = p.key as RolePermissionKey;
          const id = `perm-${key}`;
          return (
            <div
              key={key}
              className="flex items-start gap-2 rounded-md border border-border/60 bg-background p-2.5"
            >
              <Checkbox
                id={id}
                checked={perms[key] === true}
                disabled={readOnly || disabled}
                onCheckedChange={(v) => onToggle(key, v === true)}
              />
              <Label htmlFor={id} className="text-sm font-normal leading-snug cursor-pointer">
                {p.label}
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RolePermissionsEditor({
  value,
  onChange,
  readOnly = false,
  disabled = false,
}: RolePermissionsEditorProps) {
  const perms = useMemo(() => normalizePermissionsValue(value), [value]);
  const adminSuiteOn = isAdminSuiteEnabled(perms);

  function toggle(key: RolePermissionKey, checked: boolean) {
    if (readOnly || disabled) return;
    onChange({ ...perms, [key]: checked });
  }

  function toggleAdminSuite(checked: boolean) {
    if (readOnly || disabled) return;
    const next: Record<RolePermissionKey, boolean> = {
      ...perms,
      [ADMIN_SUITE_MASTER_KEY]: checked,
    };
    if (!checked) {
      for (const area of ADMIN_PERMISSION_AREAS) {
        for (const p of area.permissions) {
          next[p.key as RolePermissionKey] = false;
        }
      }
    }
    onChange(next);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="font-medium text-foreground">Permisos del rol</p>
        <p className="text-xs text-muted-foreground mt-1">
          Organiza qué puede hacer este rol en la plataforma: administración (panel staff),
          asociado/central o cliente.
        </p>
      </div>

      {/* Opciones administrativas */}
      <section className="rounded-lg border border-border bg-muted/20 overflow-hidden">
        <div className="flex items-start gap-3 p-4 bg-muted/40 border-b border-border">
          <Checkbox
            id="perm-admin-suite"
            checked={adminSuiteOn}
            disabled={readOnly || disabled}
            onCheckedChange={(v) => toggleAdminSuite(v === true)}
          />
          <div className="space-y-0.5">
            <Label htmlFor="perm-admin-suite" className="text-base font-semibold cursor-pointer">
              Opciones administrativas
            </Label>
            <p className="text-xs text-muted-foreground">
              Panel de administración, usuarios, roles, finanzas y configuración. Activa esta casilla
              para ver y marcar los permisos de staff.
            </p>
          </div>
        </div>
        {adminSuiteOn ? (
          <div className="p-4 space-y-5">
            {ADMIN_PERMISSION_AREAS.map((area) => (
              <PermissionGrid
                key={area.id}
                area={area}
                perms={perms}
                readOnly={readOnly}
                disabled={disabled}
                onToggle={toggle}
              />
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground italic">
            Marca «Opciones administrativas» para configurar permisos del panel admin.
          </p>
        )}
      </section>

      {/* Asociado y Central */}
      <section className={cn("rounded-lg border border-border bg-muted/20 p-4 space-y-5")}>
        <div>
          <p className="text-base font-semibold text-foreground">Opciones de Asociado y Central</p>
          <p className="text-xs text-muted-foreground mt-1">
            Permisos de proveedor (asociado/driver) y de empresa despachadora (central).
          </p>
        </div>
        {ASSOCIATE_CENTRAL_PERMISSION_AREAS.map((area) => (
          <PermissionGrid
            key={area.id}
            area={area}
            perms={perms}
            readOnly={readOnly}
            disabled={disabled}
            onToggle={toggle}
          />
        ))}
      </section>

      {/* Cliente */}
      <section className={cn("rounded-lg border border-border bg-muted/20 p-4 space-y-4")}>
        <div>
          <p className="text-base font-semibold text-foreground">Opciones de Cliente</p>
          <p className="text-xs text-muted-foreground mt-1">
            Uso básico de la plataforma para contratar servicios.
          </p>
        </div>
        <PermissionGrid
          area={CLIENT_PERMISSION_AREA}
          perms={perms}
          readOnly={readOnly}
          disabled={disabled}
          onToggle={toggle}
        />
      </section>
    </div>
  );
}
