import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CompanyCombobox } from "@/components/central/CompanyCombobox";
import type { DispatchCompanyOption } from "@/hooks/use-central";

export type GoDriverCentralAffiliationFieldsProps = {
  companies: DispatchCompanyOption[];
  belongToCentral: boolean;
  onBelongToCentralChange: (value: boolean) => void;
  pendingCentralCompanyId: string | null;
  onPendingCentralCompanyIdChange: (id: string | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  /** En flujos posteriores al alta (diálogo «solicitar central») solo se muestra el buscador. */
  showBelongCheckbox?: boolean;
  commandListClassName?: string;
};

export function GoDriverCentralAffiliationFields({
  companies,
  belongToCentral,
  onBelongToCentralChange,
  pendingCentralCompanyId,
  onPendingCentralCompanyIdChange,
  search,
  onSearchChange,
  showBelongCheckbox = true,
  commandListClassName,
}: GoDriverCentralAffiliationFieldsProps) {
  const showCombobox = !showBelongCheckbox || belongToCentral;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      {showBelongCheckbox ? (
        <div className="flex items-start gap-3">
          <Checkbox
            id="belong-central"
            checked={belongToCentral}
            onCheckedChange={(v) => {
              const on = v === true;
              onBelongToCentralChange(on);
              if (!on) {
                onPendingCentralCompanyIdChange(null);
                onSearchChange("");
              }
            }}
            className="mt-1"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <label htmlFor="belong-central" className="cursor-pointer text-sm font-medium leading-none">
              Pertenezco a una central
            </label>
            <p className="text-xs text-muted-foreground">
              Si marcas esta opción, tu cuenta sigue siendo tuya; la central deberá aprobar tu solicitud para
              vincularte. No podrá cambiar tu correo ni tu contraseña.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Empresa despachadora (central)</p>
          <p className="text-xs text-muted-foreground">
            Elige la central a la que quieres solicitar afiliación. Deberán aprobar tu solicitud; tu cuenta Genfeb sigue
            siendo tuya.
          </p>
        </div>
      )}

      {showCombobox ? (
        <div className="space-y-2 pt-1">
          {showBelongCheckbox ? (
            <>
              <Label className="text-sm">Central (empresa despachadora)</Label>
              <p className="text-xs text-muted-foreground">
                Busca por nombre. Se muestran varias opciones y puedes filtrar escribiendo.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Busca por nombre. Se muestran varias opciones y puedes filtrar escribiendo.
            </p>
          )}
          <CompanyCombobox
            companies={companies}
            value={pendingCentralCompanyId}
            onChange={onPendingCentralCompanyIdChange}
            search={search}
            onSearchChange={onSearchChange}
            commandListClassName={commandListClassName ?? "max-h-[220px]"}
          />
        </div>
      ) : null}
    </div>
  );
}
