import { Map, Tags, UserPlus, Users, ClipboardList, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { centralViewportClasses } from "@/lib/central-viewport-layout";

export type CentralMobileTab = "map" | "team" | "fares" | "register" | "history" | "requests";

const TABS: { id: CentralMobileTab; label: string; icon: typeof Map }[] = [
  { id: "map", label: "Mapa", icon: Map },
  { id: "team", label: "Equipo", icon: Users },
  { id: "history", label: "Historial", icon: History },
  { id: "fares", label: "Tarifas", icon: Tags },
  { id: "register", label: "Registrar", icon: UserPlus },
  { id: "requests", label: "Solicitudes", icon: ClipboardList },
];

type CentralBottomNavProps = {
  active: CentralMobileTab;
  onChange: (tab: CentralMobileTab) => void;
  teamCount?: number;
  fleetOnMap?: number;
  pendingAffiliationCount?: number;
};

export function CentralBottomNav({
  active,
  onChange,
  teamCount = 0,
  fleetOnMap = 0,
  pendingAffiliationCount = 0,
}: CentralBottomNavProps) {
  return (
    <div className={centralViewportClasses.bottomNav} style={{ height: "auto" }}>
      <nav
        className="grid gap-0 px-1 py-1.5"
        style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}
        aria-label="Navegación central"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          const badge =
            id === "team" && teamCount > 0
              ? teamCount
              : id === "map" && fleetOnMap > 0
                ? fleetOnMap
                : id === "requests" && pendingAffiliationCount > 0
                  ? pendingAffiliationCount
                  : null;
          return (
            <Button
              key={id}
              type="button"
              variant="ghost"
              className={cn(
                "relative flex h-auto min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium",
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground",
              )}
              onClick={() => onChange(id)}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="relative">
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                {badge != null ? (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span className="leading-none">{label}</span>
            </Button>
          );
        })}
      </nav>
    </div>
  );
}
