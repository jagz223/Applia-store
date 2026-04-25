import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function GoPack() {
  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Pack Go</CardTitle>
          <CardDescription>Delivery.</CardDescription>
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

