import { StorePaymentMethodsConfigCard } from "@/components/store/StorePaymentMethodsConfigCard";
import { StoreCasheaConfigCard } from "@/components/store/StoreCasheaConfigCard";

type StoreAdminPaymentMethodsPanelProps = {
  storeId: number;
  slug: string;
  initialWhatsappPhone?: string | null;
  initialCasheaEnabled?: boolean;
};

export function StoreAdminPaymentMethodsPanel({
  storeId,
  slug,
  initialWhatsappPhone,
  initialCasheaEnabled,
}: StoreAdminPaymentMethodsPanelProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold tracking-tight">Métodos de pago</h2>
        <p className="text-sm text-muted-foreground">
          Cuentas, transferencias y opciones como Cashea que verán los clientes al pagar.
        </p>
      </div>

      <StorePaymentMethodsConfigCard storeId={storeId} />

      <StoreCasheaConfigCard
        storeId={storeId}
        slug={slug}
        initialEnabled={initialCasheaEnabled}
        whatsappPhone={initialWhatsappPhone}
      />
    </div>
  );
}
