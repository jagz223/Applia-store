import {
  getStoreOrderRoadmapStepIndex,
  getStoreOrderRoadmapSteps,
  getStoreOrderStatusProgress,
  STORE_ORDER_STATUS_LABELS,
  type StoreOrderStatus,
} from "@shared/store-order-schema";
import type { StoreFulfillmentMode } from "@shared/store-fulfillment";
import { cn } from "@/lib/utils";

type StoreOrderStatusRoadmapProps = {
  status: StoreOrderStatus;
  fulfillmentMode: StoreFulfillmentMode | null;
  className?: string;
};

export function StoreOrderStatusRoadmap({
  status,
  fulfillmentMode,
  className,
}: StoreOrderStatusRoadmapProps) {
  const steps = getStoreOrderRoadmapSteps(fulfillmentMode);
  const fillPercent = status === "rechazado" ? 8 : getStoreOrderStatusProgress(status, fulfillmentMode);
  const currentIndex = getStoreOrderRoadmapStepIndex(status, fulfillmentMode);
  const isRejected = status === "rechazado";

  /** Escala horizontal para que las etiquetas de los últimos pasos no se solapen. */
  function stepVisualLeft(progress: number): string {
    const min = 14;
    const max = 86;
    return `${min + (progress / 100) * (max - min)}%`;
  }

  return (
    <div className={cn("rounded-xl border border-border bg-muted/20 p-4 sm:p-5 space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Progreso del pedido</p>
        <span
          className={cn(
            "text-xs font-medium px-2.5 py-1 rounded-full",
            isRejected
              ? "bg-destructive/15 text-destructive"
              : "bg-primary/10 text-primary",
          )}
        >
          {STORE_ORDER_STATUS_LABELS[status]}
        </span>
      </div>

      <div className="px-2 sm:px-6">
        <div className="relative pt-1 pb-12 sm:pb-14 min-w-[20rem]">
          <div className="h-3 rounded-full bg-muted overflow-hidden shadow-inner">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                isRejected
                  ? "bg-gradient-to-r from-destructive to-destructive/70"
                  : "bg-gradient-to-r from-primary/80 via-primary to-primary",
              )}
              style={{ width: `${Math.max(fillPercent, isRejected ? 8 : 4)}%` }}
            />
          </div>

          {/* Rechazado — inicio */}
          <div className="absolute top-0 left-0 flex flex-col items-start">
            <div
              className={cn(
                "h-3 w-3 rounded-full border-2 sm:h-3.5 sm:w-3.5 ring-2 ring-background",
                isRejected
                  ? "border-destructive bg-destructive scale-110"
                  : "border-muted-foreground/30 bg-background",
              )}
            />
            <span
              className={cn(
                "mt-2 text-[10px] sm:text-xs leading-tight whitespace-nowrap",
                isRejected ? "font-semibold text-destructive" : "text-muted-foreground",
              )}
            >
              {STORE_ORDER_STATUS_LABELS.rechazado}
            </span>
          </div>

          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;
            const isPenultimate = index === steps.length - 2;
            const isCurrent = !isRejected && step.status === status;
            const isCompleted = !isRejected && currentIndex > index;
            const isUpcoming = !isRejected && currentIndex < index;

            return (
              <div
                key={step.status}
                className={cn(
                  "absolute top-0 flex flex-col",
                  isLast ? "right-[3%] items-end" : "items-center -translate-x-1/2",
                )}
                style={isLast ? undefined : { left: stepVisualLeft(step.progress) }}
              >
                <div
                  className={cn(
                    "h-3 w-3 rounded-full border-2 sm:h-3.5 sm:w-3.5 ring-2 ring-background transition-all",
                    isCurrent && "border-primary bg-primary scale-125 shadow-md shadow-primary/30",
                    isCompleted && "border-primary bg-primary",
                    isUpcoming && "border-muted-foreground/35 bg-background",
                    isRejected && "border-muted-foreground/25 bg-muted/50 opacity-60",
                  )}
                />
                <span
                  className={cn(
                    "mt-2 text-[10px] sm:text-xs leading-tight",
                    isLast && "text-right whitespace-nowrap",
                    isPenultimate && "text-center whitespace-nowrap -translate-x-1/4",
                    !isLast && !isPenultimate && "text-center whitespace-nowrap max-w-[5rem] sm:max-w-none",
                    isCurrent && "font-semibold text-primary",
                    isCompleted && "font-medium text-foreground",
                    (isUpcoming || isRejected) && "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
