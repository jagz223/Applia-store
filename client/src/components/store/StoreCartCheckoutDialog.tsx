import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AlertCircle, Loader2 } from "lucide-react";

import { STORE_FULFILLMENT_DESCRIPTIONS } from "@shared/store-fulfillment";

import type { StoreFulfillmentMode } from "@shared/store-fulfillment";

import {

  useSubmitStoreCheckout,

  type StoreCartSummary,

} from "@/hooks/use-store-cart";

import { StoreCoverPhotoPicker } from "@/components/store/StoreCoverPhotoPicker";

import {

  StoreCheckoutDeliverySection,

  type StoreDeliveryQuote,

} from "@/components/store/StoreCheckoutDeliverySection";

import type { PickedLocation } from "@/components/taxi/SingleLocationPicker";

import { uploadStoreCheckoutProofImage } from "@/lib/firebase-client";

import { revokeBlobPreview } from "@/lib/store-image-draft";

import { useToast } from "@/hooks/use-toast";

import {

  Dialog,

  DialogContent,

  DialogDescription,

  DialogFooter,

  DialogHeader,

  DialogTitle,

} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";

import { Label } from "@/components/ui/label";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { cn } from "@/lib/utils";



function formatPrice(value: number) {

  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);

}



function missingFieldsMessage(fields: string[]): string {

  if (fields.length === 1) {

    return `Hace falta llenar el siguiente campo: ${fields[0]}`;

  }

  return `Hace falta llenar los siguientes campos: ${fields.join(", ")}`;

}



function hasProofValue(proofPreviewUrl: string | null, pendingProofFile: File | null): boolean {

  return Boolean(pendingProofFile || proofPreviewUrl?.trim());

}



type FormFeedback = {

  title: string;

  description: string;

};




function PaymentMethodDetails({
  method,
}: {
  method: StoreCartSummary["paymentMethods"][number];
}) {
  const extras = Array.isArray(method.extraFields) ? method.extraFields : [];
  const legacyAccount =
    typeof method.accountNumber === "string" ? method.accountNumber.trim() : "";
  const hasExtras = extras.length > 0;
  return (
    <div className="rounded-lg border border-border p-4 space-y-3 min-h-[8rem]">
      {hasExtras ? (
        <div className="space-y-2">
          {extras.map((field, index) => (
            <div key={`${field.name}-${index}`}>
              <p className="text-xs text-muted-foreground">{field.name}</p>
              <p className="text-sm font-medium break-all">{field.value}</p>
            </div>
          ))}
        </div>
      ) : legacyAccount ? (
        <div>
          <p className="text-xs text-muted-foreground">Número de cuenta</p>
          <p className="text-sm font-medium break-all">{legacyAccount}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin datos de pago adicionales.</p>
      )}
      {method.imageUrl ? (
        <img
          src={method.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="max-h-44 w-full rounded-md border border-border object-contain bg-muted/30"
        />
      ) : (
        <p className="text-xs text-muted-foreground">Sin imagen de referencia.</p>
      )}
    </div>
  );
}

export function StoreCartCheckoutDialog({

  storeId,

  cart,

  open,

  onOpenChange,

  onCheckoutSuccess,

}: {

  storeId: number;

  cart: StoreCartSummary;

  open: boolean;

  onOpenChange: (open: boolean) => void;

  onCheckoutSuccess?: (orderId: number) => void;

}) {

  const { toast } = useToast();

  const submitMutation = useSubmitStoreCheckout(storeId);



  const [reference, setReference] = useState("");

  const [amountPaid, setAmountPaid] = useState("");

  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);

  const [pendingProofFile, setPendingProofFile] = useState<File | null>(null);

  const [paymentMethodId, setPaymentMethodId] = useState<string>("");

  const [fulfillmentMode, setFulfillmentMode] = useState<string>("");

  const [deliveryLocation, setDeliveryLocation] = useState<PickedLocation | null>(null);

  const [deliveryQuote, setDeliveryQuote] = useState<StoreDeliveryQuote | null>(null);

  const [formFeedback, setFormFeedback] = useState<FormFeedback | null>(null);
  const formFeedbackRef = useRef<HTMLDivElement>(null);



  const handleDeliveryQuoteChange = useCallback((quote: StoreDeliveryQuote | null) => {

    setDeliveryQuote(quote);

  }, []);



  function clearFormFeedback() {

    setFormFeedback(null);

  }



  function showFormFeedback(feedback: FormFeedback) {

    setFormFeedback(feedback);

    requestAnimationFrame(() => {

      formFeedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });

    });

  }



  const effectivePaymentMethodId =

    paymentMethodId ||

    (cart.paymentMethods.length === 1 ? String(cart.paymentMethods[0].id) : "");



  const selectedPaymentMethod = useMemo(

    () => cart.paymentMethods.find((m) => String(m.id) === effectivePaymentMethodId),

    [cart.paymentMethods, effectivePaymentMethodId],

  );



  const isDelivery = fulfillmentMode === "delivery";

  const estimatedDeliveryFee = isDelivery ? (deliveryQuote?.deliveryFee ?? null) : null;

  const storePaymentDue =
    cart.subtotal + (isDelivery && estimatedDeliveryFee != null ? estimatedDeliveryFee : 0);



  useEffect(() => {

    if (!open) return;

    setReference("");

    setAmountPaid("");

    setProofPreviewUrl(null);

    setPendingProofFile(null);

    setPaymentMethodId(

      cart.paymentMethods.length === 1 ? String(cart.paymentMethods[0].id) : "",

    );

    setFulfillmentMode(

      cart.fulfillmentOptions.length === 1 ? cart.fulfillmentOptions[0].mode : "",

    );

    setDeliveryLocation(null);

    setDeliveryQuote(null);

    setFormFeedback(null);

  }, [open, cart.paymentMethods, cart.fulfillmentOptions]);



  function handleClose(next: boolean) {

    if (!next && proofPreviewUrl?.startsWith("blob:")) {

      revokeBlobPreview(proofPreviewUrl);

    }

    onOpenChange(next);

  }



  function handleProofChange(url: string | null, file?: File | null) {

    clearFormFeedback();

    setProofPreviewUrl(url);

    setPendingProofFile(file ?? null);

  }



  async function resolveProofUrl(): Promise<string | null> {

    if (pendingProofFile) {

      return uploadStoreCheckoutProofImage(storeId, pendingProofFile);

    }

    return proofPreviewUrl?.trim() || null;

  }



  async function handleSubmit(e: React.FormEvent) {

    e.preventDefault();



    const missing: string[] = [];

    const trimmedRef = reference.trim();

    if (!trimmedRef) missing.push("Referencia");



    const paid = Number.parseFloat(amountPaid.replace(",", "."));

    if (!Number.isFinite(paid) || paid <= 0) missing.push("Monto pagado");



    if (!hasProofValue(proofPreviewUrl, pendingProofFile)) missing.push("Comprobante de pago");



    if (cart.paymentMethods.length === 0) {

      missing.push("Método de pago");

    } else if (!effectivePaymentMethodId) {

      missing.push("Método de pago");

    }



    if (cart.fulfillmentOptions.length > 0 && !fulfillmentMode) {

      missing.push("Método de recibo");

    }



    if (isDelivery) {

      if (!cart.storeLocation) {

        missing.push("Ubicación de la tienda (contacta al vendedor)");

      } else if (!deliveryLocation) {

        missing.push("Ubicación de entrega");

      } else if (!deliveryQuote) {

        missing.push("Cálculo de delivery (espera a que se calcule la ruta)");

      }

    }



    if (missing.length > 0) {

      showFormFeedback({

        title: "Campos incompletos",

        description: missingFieldsMessage(missing),

      });

      return;

    }



    try {

      const proofImageUrl = await resolveProofUrl();

      if (!proofImageUrl) {

        showFormFeedback({

          title: "Campos incompletos",

          description: missingFieldsMessage(["Comprobante de pago"]),

        });

        return;

      }



      clearFormFeedback();



      const result = await submitMutation.mutateAsync({

        reference: trimmedRef,

        proofImageUrl,

        amountPaid: paid,

        paymentMethodId: Number(effectivePaymentMethodId),

        fulfillmentMode: fulfillmentMode ? (fulfillmentMode as StoreFulfillmentMode) : null,

        deliveryLocation:

          isDelivery && deliveryLocation

            ? {

                lat: deliveryLocation.lat,

                lon: deliveryLocation.lon,

                label: deliveryLocation.label,

              }

            : null,

      });



      if (proofPreviewUrl?.startsWith("blob:")) revokeBlobPreview(proofPreviewUrl);

      const newOrderId = result.order?.id;
      handleClose(false);
      if (newOrderId != null) onCheckoutSuccess?.(newOrderId);

    } catch (err) {

      showFormFeedback({

        title: "No se pudo completar la compra",

        description: err instanceof Error ? err.message : "Error desconocido",

      });

    }

  }



  const saving = submitMutation.isPending;



  return (

    <Dialog open={open} onOpenChange={handleClose}>

      <DialogContent

        layer="elevated"

        shellClassName="items-start justify-center pt-[4.5rem] pb-4 px-4"

        overlayClassName="bg-black/55 backdrop-blur-[1px]"

        className="max-w-5xl w-[min(95vw,64rem)] max-h-[70dvh] overflow-y-auto sm:rounded-xl"

      >

        <DialogHeader>

          <DialogTitle>Confirmar compra</DialogTitle>

          <DialogDescription>

            Revisa la modalidad de entrega, el pago y el total antes de confirmar.

          </DialogDescription>

        </DialogHeader>



        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">

          <div className="grid gap-6 lg:grid-cols-2">

            {cart.fulfillmentOptions.length > 0 ? (

              <div className="space-y-4 rounded-xl border border-border p-4">

                <div>

                  <h3 className="text-sm font-semibold">Método de entrega</h3>

                  <p className="text-xs text-muted-foreground mt-1">

                    ¿Cómo recibirás o usarás tu pedido?

                  </p>

                </div>

                <RadioGroup

                  value={fulfillmentMode}

                  disabled={saving}

                  onValueChange={(value) => {

                    clearFormFeedback();

                    setFulfillmentMode(value);

                    if (value !== "delivery") {

                      setDeliveryLocation(null);

                      setDeliveryQuote(null);

                    }

                  }}

                  className="space-y-2"

                >

                  {cart.fulfillmentOptions.map((option) => (

                    <div

                      key={option.mode}

                      className={cn(

                        "flex items-start gap-3 rounded-lg border border-border px-3 py-2.5",

                        fulfillmentMode === option.mode && "border-primary/60 bg-primary/5",

                      )}

                    >

                      <RadioGroupItem

                        value={option.mode}

                        id={`fulfillment-${option.mode}`}

                        className="mt-0.5"

                      />

                      <div className="space-y-0.5 min-w-0">

                        <Label

                          htmlFor={`fulfillment-${option.mode}`}

                          className="cursor-pointer font-medium text-sm"

                        >

                          {option.label}

                        </Label>

                        <p className="text-[11px] text-muted-foreground leading-snug">

                          {STORE_FULFILLMENT_DESCRIPTIONS[option.mode]}

                        </p>

                      </div>

                    </div>

                  ))}

                </RadioGroup>

              </div>

            ) : (

              <div />

            )}



            <div className="space-y-4 rounded-xl border border-border p-4">

              <div>

                <h3 className="text-sm font-semibold">Método de pago</h3>

                <p className="text-xs text-muted-foreground mt-1">

                  Elige dónde realizaste el pago en esta tienda.

                </p>

              </div>



              {cart.paymentMethods.length === 0 ? (

                <p className="text-sm text-amber-700 dark:text-amber-400 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">

                  Esta tienda aún no tiene métodos de pago registrados.

                </p>

              ) : cart.paymentMethods.length === 1 ? (

                <div className="space-y-2">
                  <p className="font-medium">{selectedPaymentMethod?.name ?? cart.paymentMethods[0].name}</p>
                  <PaymentMethodDetails method={selectedPaymentMethod ?? cart.paymentMethods[0]} />
                </div>

              ) : (

                <Tabs

                  value={effectivePaymentMethodId}

                  onValueChange={(value) => {

                    clearFormFeedback();

                    setPaymentMethodId(value);

                  }}

                >

                  <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1">

                    {cart.paymentMethods.map((method) => (

                      <TabsTrigger

                        key={method.id}

                        value={String(method.id)}

                        disabled={saving}

                        className="flex-1 min-w-[7rem]"

                      >

                        {method.name}

                      </TabsTrigger>

                    ))}

                  </TabsList>

                  {cart.paymentMethods.map((method) => (

                    <TabsContent key={method.id} value={String(method.id)} className="mt-4">

                      <PaymentMethodDetails method={method} />

                    </TabsContent>

                  ))}

                </Tabs>

              )}

            </div>

          </div>



          {isDelivery ? (

            cart.storeLocation ? (

              <StoreCheckoutDeliverySection

                storeLocation={cart.storeLocation}

                deliveryFares={cart.deliveryFares}

                value={deliveryLocation}

                disabled={saving}

                mapEnabled={open}

                onChange={(value) => {

                  clearFormFeedback();

                  setDeliveryLocation(value);

                  if (!value) setDeliveryQuote(null);

                }}

                onQuoteChange={handleDeliveryQuoteChange}

              />

            ) : (

              <Alert variant="destructive">

                <AlertCircle className="h-4 w-4" />

                <AlertTitle>Sin ubicación de tienda</AlertTitle>

                <AlertDescription>

                  Esta tienda aún no tiene registrada su ubicación. No es posible calcular el delivery.

                </AlertDescription>

              </Alert>

            )

          ) : null}



          <div className="grid gap-6 lg:grid-cols-2">

            <div className="space-y-4 rounded-xl border border-border p-4">

              <div>

                <h3 className="text-sm font-semibold">Comprobante de pago</h3>

                <p className="text-xs text-muted-foreground mt-1">

                  Indica la referencia, el monto pagado y adjunta el comprobante.

                </p>

              </div>



              <div className="space-y-2">

                <Label htmlFor="checkout-reference">Referencia</Label>

                <Input

                  id="checkout-reference"

                  value={reference}

                  maxLength={120}

                  disabled={saving}

                  placeholder="Número de transferencia o referencia bancaria"

                  onChange={(e) => {

                    clearFormFeedback();

                    setReference(e.target.value);

                  }}

                />

              </div>



              <div className="space-y-2">

                <Label htmlFor="checkout-amount-paid">Monto pagado</Label>

                <NumberField

                  id="checkout-amount-paid"

                  min={0.01}

                  step={0.01}

                  value={amountPaid}

                  disabled={saving}

                  placeholder={storePaymentDue.toFixed(2)}

                  onChange={(next) => {

                    clearFormFeedback();

                    setAmountPaid(next);

                  }}

                />

                <p className="text-[11px] text-muted-foreground">
                  Total a pagar a la tienda:{" "}
                  <span className="font-medium text-foreground">{formatPrice(storePaymentDue)}</span>
                  {isDelivery && estimatedDeliveryFee != null ? (
                    <span> (incluye envío {formatPrice(estimatedDeliveryFee)}).</span>
                  ) : null}
                </p>

              </div>



              <StoreCoverPhotoPicker

                label="Comprobante de pago"

                previewUrl={proofPreviewUrl}

                disabled={saving}

                onPreviewChange={handleProofChange}

              />

            </div>



            <div className="rounded-xl border border-border p-4 space-y-4">

              <div>

                <h3 className="text-sm font-semibold">Resumen a pagar</h3>

                <p className="text-xs text-muted-foreground mt-1">
                  {isDelivery
                    ? "Productos y envío se pagan a la tienda. La tienda coordina el delivery."
                    : "El monto total se paga a la tienda."}
                </p>

              </div>



              <div className="space-y-3 text-sm">

                <div className="flex items-center justify-between gap-4">

                  <span className="text-muted-foreground">Subtotal productos</span>

                  <span className="font-medium">{formatPrice(cart.subtotal)}</span>

                </div>

                {isDelivery ? (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">Envío</span>
                    <span className="font-medium text-right">
                      {estimatedDeliveryFee != null ? formatPrice(estimatedDeliveryFee) : "—"}
                    </span>
                  </div>
                ) : null}

                <div className="border-t border-border pt-3 flex items-center justify-between gap-4">

                  <span className="font-semibold">Total a la tienda</span>

                  <span className="text-lg font-bold">{formatPrice(storePaymentDue)}</span>

                </div>

              </div>



              {cart.items.length > 0 ? (

                <ul className="space-y-2 pt-2 border-t border-border max-h-40 overflow-y-auto text-xs text-muted-foreground">

                  {cart.items.map((item, idx) => (

                    <li key={`${item.kind}-${item.productId ?? item.promotionId ?? idx}`} className="flex justify-between gap-2">

                      <span className="truncate">

                        {item.quantity}× {item.name}

                      </span>

                      <span className="shrink-0 font-medium text-foreground">{formatPrice(item.lineTotal)}</span>

                    </li>

                  ))}

                </ul>

              ) : null}

            </div>

          </div>



          {formFeedback ? (

            <Alert ref={formFeedbackRef} variant="destructive">

              <AlertCircle className="h-4 w-4" />

              <AlertTitle>{formFeedback.title}</AlertTitle>

              <AlertDescription>{formFeedback.description}</AlertDescription>

            </Alert>

          ) : null}



          <DialogFooter className="gap-2 sm:gap-0">

            <Button type="button" variant="outline" disabled={saving} onClick={() => handleClose(false)}>

              Cancelar

            </Button>

            <Button

              type="submit"

              disabled={saving || cart.paymentMethods.length === 0 || !effectivePaymentMethodId}

            >

              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}

              Confirmar compra

            </Button>

          </DialogFooter>

        </form>

      </DialogContent>

    </Dialog>

  );

}


