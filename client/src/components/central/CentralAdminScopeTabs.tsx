import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AdminCentralView } from "@/hooks/use-central";

type CentralAdminScopeTabsProps = {
  value: AdminCentralView;
  onChange: (value: AdminCentralView) => void;
  className?: string;
};

export function CentralAdminScopeTabs({ value, onChange, className }: CentralAdminScopeTabsProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as AdminCentralView)} className={className}>
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="centrales">Centrales</TabsTrigger>
        <TabsTrigger value="all-drivers">Todos los conductores</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
