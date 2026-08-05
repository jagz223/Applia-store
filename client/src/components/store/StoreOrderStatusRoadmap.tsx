import {
  getStoreOrderRoadmapStepIndex,
  getStoreOrderRoadmapSteps,
  getStoreOrderStatusProgress,
  STORE_ORDER_STATUS_LABELS,
  type StoreOrderStatus,
} from "@shared/store-order-schema";
import type { StoreFulfillmentMode } from "@shared/store-fulfillment";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type StoreOrderStatusRoadmapProps = {
  status: StoreOrderStatus;
  fulfillmentMode: StoreFulfillmentMode | null;
  className?: string;
};

type StepVisual = {
  key: string;
  status: StoreOrderStatus;
  label: string;
  kind: "rejected" | "flow";
};

function buildVisualSteps(
  status: StoreOrderStatus,
  fulfillmentMode: StoreFulfillmentMode | null,
): StepVisual[] {
  const flow = getStoreOrderRoadmapSteps(fulfillmentMode).map((step) => ({
    key: step.status,
    status: step.status,
    label: step.label,
    kind: "flow" as const,
  }));

  // Solo mostrar «Rechazado» cuando aplica; si no, el flujo feliz.
  if (status === "rechazado") {
    return [
      {
        key: "rechazado",
        status: "rechazado",
        label: STORE_ORDER_STATUS_LABELS.rechazado,
        kind: "rejected",
      },
      ...flow,
    ];
  }
  return flow;
}

export function StoreOrderStatusRoadmap({
  status,
  fulfillmentMode,
  className,
}: StoreOrderStatusRoadmapProps) {
  const steps = getStoreOrderRoadmapSteps(fulfillmentMode);
  const fillPercent = status === "rechazado" ? 0 : getStoreOrderStatusProgress(status, fulfillmentMode);
  const currentIndex = getStoreOrderRoadmapStepIndex(status, fulfillmentMode);
  const isRejected = status === "rechazado";
  const visualSteps = buildVisualSteps(status, fulfillmentMode);

  return (
    <div
      className={cn(
        "space-y-4 rounded-2xl border border-border/70 bg-muted/20 p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold tracking-tight">Progreso del pedido</p>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            isRejected
              ? "bg-destructive/15 text-destructive"
              : "bg-secondary/15 text-secondary dark:bg-primary/15 dark:text-primary",
          )}
        >
          {STORE_ORDER_STATUS_LABELS[status]}
        </span>
      </div>

      {/* Móvil: timeline vertical */}
      <ol className="space-y-0 md:hidden" aria-label="Progreso del pedido">
        {visualSteps.map((step, index) => {
          const isLast = index === visualSteps.length - 1;
          const flowIndex = steps.findIndex((s) => s.status === step.status);
          const isCurrent =
            step.kind === "rejected"
              ? isRejected
              : !isRejected && step.status === status;
          const isCompleted =
            step.kind === "flow" && !isRejected && flowIndex >= 0 && currentIndex > flowIndex;
          const isDimmed =
            (step.kind === "flow" && isRejected) ||
            (!isRejected && step.kind === "flow" && currentIndex < flowIndex);

          return (
            <li key={step.key} className="flex gap-3">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px]",
                    isCurrent &&
                      step.kind === "rejected" &&
                      "border-destructive bg-destructive text-destructive-foreground",
                    isCurrent &&
                      step.kind === "flow" &&
                      "border-secondary bg-secondary text-secondary-foreground dark:border-primary dark:bg-primary dark:text-primary-foreground",
                    isCompleted && "border-primary bg-primary text-primary-foreground",
                    isDimmed && "border-border bg-background text-muted-foreground",
                    !isCurrent &&
                      !isCompleted &&
                      !isDimmed &&
                      "border-muted-foreground/30 bg-background",
                  )}
                >
                  {step.kind === "rejected" && isCurrent ? (
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : isCompleted || (isCurrent && step.kind === "flow") ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : null}
                </span>
                {!isLast ? (
                  <span
                    className={cn(
                      "mt-1 w-0.5 flex-1 min-h-[1.25rem]",
                      isCompleted || (isCurrent && step.kind === "flow")
                        ? "bg-primary/70"
                        : "bg-border",
                    )}
                  />
                ) : null}
              </div>
              <div className={cn("min-w-0 pb-4", isLast && "pb-0")}>
                <p
                  className={cn(
                    "text-sm leading-snug",
                    isCurrent && "font-semibold text-foreground",
                    isCompleted && "font-medium text-foreground",
                    isDimmed && "text-muted-foreground",
                    isCurrent && step.kind === "rejected" && "text-destructive",
                  )}
                >
                  {step.label}
                </p>
                {isCurrent ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">Estado actual</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Desktop: barra horizontal sin etiquetas absolutas apretadas */}
      <div className="hidden md:block">
        <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-muted shadow-inner">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              isRejected
                ? "bg-destructive"
                : "bg-gradient-to-r from-primary/80 via-primary to-secondary",
            )}
            style={{ width: `${Math.max(fillPercent, isRejected ? 4 : 4)}%` }}
          />
        </div>
        <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${visualSteps.length}, minmax(0, 1fr))` }}>
          {visualSteps.map((step) => {
            const flowIndex = steps.findIndex((s) => s.status === step.status);
            const isCurrent =
              step.kind === "rejected"
                ? isRejected
                : !isRejected && step.status === status;
            const isCompleted =
              step.kind === "flow" && !isRejected && flowIndex >= 0 && currentIndex > flowIndex;
            const isDimmed =
              (step.kind === "flow" && isRejected) ||
              (!isRejected && step.kind === "flow" && currentIndex < flowIndex);

            return (
              <li key={step.key} className="flex min-w-0 flex-col items-center gap-2 text-center">
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 ring-2 ring-background",
                    isCurrent &&
                      step.kind === "rejected" &&
                      "scale-110 border-destructive bg-destructive",
                    isCurrent &&
                      step.kind === "flow" &&
                      "scale-110 border-secondary bg-secondary shadow-md shadow-secondary/25 dark:border-primary dark:bg-primary",
                    isCompleted && "border-primary bg-primary",
                    isDimmed && "border-muted-foreground/30 bg-background opacity-70",
                  )}
                />
                <span
                  className={cn(
                    "max-w-full text-xs leading-snug",
                    isCurrent && "font-semibold text-foreground",
                    isCompleted && "font-medium text-foreground",
                    isDimmed && "text-muted-foreground",
                    isCurrent && step.kind === "rejected" && "text-destructive",
                  )}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
