import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GoDriverCentralAffiliationFields } from "@/components/provider/GoDriverCentralAffiliationFields";
import { useDispatchCompanyOptions } from "@/hooks/use-central";
import { useSubmitGoDriverPendingCentral } from "@/hooks/use-mango-data";
import { useToast } from "@/hooks/use-toast";

export type RequestCentralAffiliationFormProps = {
  /** Tras enviar correctamente (p. ej. cerrar diálogo o refrescar lista). */
  onSuccess?: () => void;
};

/**
 * Formulario reutilizable: elegir central y enviar POST /api/me/go-driver (solo pending).
 */
export function RequestCentralAffiliationForm({ onSuccess }: RequestCentralAffiliationFormProps) {
  const { toast } = useToast();
  const { data: companies = [] } = useDispatchCompanyOptions();
  const submit = useSubmitGoDriverPendingCentral();
  const [search, setSearch] = useState("");
  const [pendingCentralCompanyId, setPendingCentralCompanyId] = useState<string | null>(null);

  const runSubmit = async () => {
    if (!pendingCentralCompanyId) {
      toast({
        variant: "destructive",
        title: "Selecciona una central",
        description: "Indica a qué empresa despachadora quieres solicitar afiliación.",
      });
      return;
    }
    await submit.mutateAsync(pendingCentralCompanyId);
    setSearch("");
    setPendingCentralCompanyId(null);
    onSuccess?.();
  };

  return (
    <div className="space-y-4">
      <GoDriverCentralAffiliationFields
        companies={companies}
        belongToCentral
        onBelongToCentralChange={() => {}}
        pendingCentralCompanyId={pendingCentralCompanyId}
        onPendingCentralCompanyIdChange={setPendingCentralCompanyId}
        search={search}
        onSearchChange={setSearch}
        showBelongCheckbox={false}
      />
      <Button type="button" className="w-full sm:w-auto" disabled={submit.isPending} onClick={() => void runSubmit()}>
        {submit.isPending ? "Enviando…" : "Enviar solicitud"}
      </Button>
    </div>
  );
}
