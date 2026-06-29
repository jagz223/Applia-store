import { Car, ChevronRight, Radio } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { CentralFleetDriver } from "@/hooks/use-central";
import { centralDriverInServiceLabel, centralDriverReceivingModeLabel } from "@/lib/central-fleet-work-accent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LIST_ITEM_MOTION = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.38 } },
  transition: { duration: 0.48, ease: [0.22, 1, 0.36, 1] as const },
};

function driverStatusLabel(driver: CentralFleetDriver): string {
  if (driver.inService) return centralDriverInServiceLabel(driver);
  const receiving = centralDriverReceivingModeLabel(driver);
  if (receiving) return receiving;
  if (driver.receiving) return "En línea";
  return "Activo";
}

type CentralFleetActiveListProps = {
  drivers: CentralFleetDriver[];
  selectedUserId: string | null;
  onSelectDriver: (driver: CentralFleetDriver) => void;
  /** Altura máxima del scroll interno. */
  maxHeightClass?: string;
  emptyMessage?: string;
  /** Vista admin global: muestra la central de cada conductor. */
  showDispatchCompany?: boolean;
};

export function CentralFleetActiveList({
  drivers,
  selectedUserId,
  onSelectDriver,
  maxHeightClass = "max-h-72",
  emptyMessage = "No hay conductores recibiendo servicios ni en viaje en este momento.",
  showDispatchCompany = false,
}: CentralFleetActiveListProps) {
  return (
    <div className={cn("relative min-h-[4.5rem]", maxHeightClass, "overflow-y-auto overflow-x-hidden pr-0.5")}>
      <AnimatePresence mode="popLayout" initial={false}>
        {drivers.length === 0 ? (
          <motion.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-4 py-6 text-center text-sm text-muted-foreground"
          >
            {emptyMessage}
          </motion.p>
        ) : (
          <motion.ul
            key="list"
            layout
            className="space-y-1.5"
            aria-label="Conductores activos"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {drivers.map((driver) => {
                const selected = selectedUserId === driver.userId;
                const plate = driver.licensePlate?.trim();
                return (
                  <motion.li
                    key={driver.userId}
                    layout="position"
                    {...LIST_ITEM_MOTION}
                    className="origin-top"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDriver(driver)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-200",
                        selected
                          ? "border-primary/50 bg-primary/10 ring-1 ring-primary/25"
                          : "border-border/70 bg-card/80 hover:border-primary/30 hover:bg-muted/30",
                      )}
                    >
                      <Avatar className="h-10 w-10 shrink-0 ring-1 ring-border/60">
                        <AvatarImage src={driver.avatar ?? undefined} />
                        <AvatarFallback className="bg-primary/10 text-xs text-primary">
                          {driver.name[0]}
                          {driver.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {driver.name} {driver.lastName}
                        </p>
                        {showDispatchCompany ? (
                          <p className="truncate text-[10px] text-muted-foreground">
                            {driver.dispatchCompanyName?.trim() || "Sin central"}
                          </p>
                        ) : null}
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={driver.inService ? "default" : "secondary"}
                            className="h-5 px-1.5 text-[10px] font-normal"
                          >
                            {driverStatusLabel(driver)}
                          </Badge>
                          {plate ? (
                            <span className="truncate font-mono text-[10px] text-muted-foreground">{plate}</span>
                          ) : null}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Encabezado compacto para el listado de flota activa. */
export function CentralFleetActiveListHeader({
  count,
  compact = false,
}: {
  count: number;
  /** En franja móvil del mapa (sin margen inferior extra). */
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", compact ? "min-w-0 flex-1" : "mb-2 w-full justify-between")}>
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Radio className="h-4 w-4 text-primary" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Conductores activos</p>
          <p className={cn("text-[11px] text-muted-foreground", compact && "max-sm:hidden")}>
            Recibiendo servicios o en viaje
          </p>
        </div>
      </div>
      <Badge variant="outline" className="shrink-0 tabular-nums transition-all duration-500">
        <Car className="mr-1 h-3 w-3" aria-hidden />
        <motion.span
          key={count}
          initial={{ opacity: 0.4, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="inline-block"
        >
          {count}
        </motion.span>
      </Badge>
    </div>
  );
}
