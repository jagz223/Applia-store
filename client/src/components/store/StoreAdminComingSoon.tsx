import { Construction } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type StoreAdminComingSoonProps = {
  title: string;
};

export function StoreAdminComingSoon({ title }: StoreAdminComingSoonProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Construction className="h-5 w-5 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>Próximamente</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Esta sección estará disponible en una próxima actualización del módulo de tiendas.
        </p>
      </CardContent>
    </Card>
  );
}
