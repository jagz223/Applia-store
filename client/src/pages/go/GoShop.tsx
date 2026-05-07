import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function GoShop() {
  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Pedidos</CardTitle>
          <CardDescription>Pedidos en tienda.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Aquí podrás hacer pedidos en tienda con el mismo saldo GenFeb, estrellas y chat.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

