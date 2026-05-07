import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MOBILITY_UI } from "@shared/mobility-ui-labels";

export default function GoPack() {
  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>{MOBILITY_UI.delivery}</CardTitle>
          <CardDescription>{MOBILITY_UI.delivery}: envíos con tu saldo GenFeb.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Aquí podrás solicitar delivery con el mismo saldo GenFeb, estrellas y chat.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

