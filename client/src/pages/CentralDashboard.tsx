import { useEffect, useMemo, useState } from "react";
import { Redirect } from "wouter";
import { Building2, Loader2, Star, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { canAccessCentralDashboard, hasAdminRole } from "@/lib/auth-utils";
import {
  useCentralCompaniesForAdmin,
  useCentralFleet,
  useCentralFares,
  useCentralMe,
  usePatchCentralFares,
  useRegisterCentralMember,
  type CentralFleetDriver,
} from "@/hooks/use-central";
import { useSocket } from "@/hooks/use-socket";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CentralFleetMap } from "@/components/central/CentralFleetMap";
import type { DispatchMobilityFares, DispatchPackFares } from "@shared/dispatch-company";

function FareTierFields({
  label,
  perKm,
  minUsd,
  onPerKm,
  onMin,
}: {
  label: string;
  perKm: number;
  minUsd: number;
  onPerKm: (v: number) => void;
  onMin: (v: number) => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-3 sm:items-end">
      <p className="text-sm font-medium sm:col-span-3">{label}</p>
      <div>
        <Label className="text-xs">USD / km</Label>
        <Input
          type="number"
          step="0.01"
          min={0}
          value={perKm}
          onChange={(e) => onPerKm(Number(e.target.value))}
        />
      </div>
      <div>
        <Label className="text-xs">Precio mínimo (USD)</Label>
        <Input
          type="number"
          step="0.01"
          min={0}
          value={minUsd}
          onChange={(e) => onMin(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

export default function CentralDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { socket } = useSocket();
  const isAdmin = hasAdminRole(user);
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    (user as { dispatchCompanyId?: string } | null)?.dispatchCompanyId ?? null,
  );
  const [selectedDriver, setSelectedDriver] = useState<CentralFleetDriver | null>(null);
  const [memberType, setMemberType] = useState<"central" | "driver">("driver");
  const [offerKind, setOfferKind] = useState<"moto" | "carro" | "camion" | "pet">("carro");

  const { data: companies } = useCentralCompaniesForAdmin(companySearch, isAdmin);
  const effectiveCompanyId = isAdmin ? selectedCompanyId : (user as { dispatchCompanyId?: string })?.dispatchCompanyId ?? null;

  const { data: me } = useCentralMe(effectiveCompanyId);
  const { data: fleet = [], refetch: refetchFleet } = useCentralFleet(effectiveCompanyId);
  const { data: faresData } = useCentralFares(effectiveCompanyId);
  const patchFares = usePatchCentralFares(effectiveCompanyId);
  const registerMember = useRegisterCentralMember(effectiveCompanyId);

  const [mobilityDraft, setMobilityDraft] = useState<DispatchMobilityFares | null>(null);
  const [packDraft, setPackDraft] = useState<DispatchPackFares | null>(null);

  useEffect(() => {
    if (faresData?.mobilityFares) setMobilityDraft(faresData.mobilityFares);
    if (faresData?.packFares) setPackDraft(faresData.packFares);
  }, [faresData]);

  useEffect(() => {
    if (!socket || !effectiveCompanyId) return;
    socket.emit("central:fleet:subscribe", { companyId: effectiveCompanyId });
    const onUpdate = () => void refetchFleet();
    socket.on("central:fleet:update", onUpdate);
    return () => {
      socket.emit("central:fleet:unsubscribe", { companyId: effectiveCompanyId });
      socket.off("central:fleet:update", onUpdate);
    };
  }, [socket, effectiveCompanyId, refetchFleet]);

  useEffect(() => {
    if (!isAdmin && (user as { dispatchCompanyId?: string })?.dispatchCompanyId) {
      setSelectedCompanyId((user as { dispatchCompanyId?: string }).dispatchCompanyId!);
    }
  }, [user, isAdmin]);

  const driversOnMap = useMemo(
    () => fleet.filter((d) => d.lat != null && d.lon != null),
    [fleet],
  );

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !canAccessCentralDashboard(user)) {
    return <Redirect to="/login" />;
  }

  if (isAdmin && !effectiveCompanyId) {
    return (
      <div className="container max-w-lg py-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Panel Central
            </CardTitle>
            <CardDescription>Selecciona la empresa despachadora que deseas administrar.</CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyCombobox
              companies={companies ?? []}
              value={selectedCompanyId}
              onChange={setSelectedCompanyId}
              search={companySearch}
              onSearchChange={setCompanySearch}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await registerMember.mutateAsync({
        memberType,
        email: String(fd.get("email")),
        password: String(fd.get("password")),
        name: String(fd.get("name")),
        lastName: String(fd.get("lastName")),
        phone: String(fd.get("phone")),
        offerKind: memberType === "driver" ? offerKind : undefined,
      });
      toast({ title: "Usuario registrado", description: "La cuenta fue creada correctamente." });
      (e.target as HTMLFormElement).reset();
      void refetchFleet();
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo registrar",
      });
    }
  };

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Central — {me?.company?.name ?? "Empresa"}</h1>
          <p className="text-muted-foreground text-sm">Flota en tiempo real y tarifas de taxi y delivery.</p>
        </div>
        {isAdmin && (
          <CompanyCombobox
            companies={companies ?? []}
            value={effectiveCompanyId}
            onChange={setSelectedCompanyId}
            search={companySearch}
            onSearchChange={setCompanySearch}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Mapa de flota</CardTitle>
            <CardDescription>Conductores buscando clientes o en servicio activo.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <CentralFleetMap drivers={driversOnMap} onSelectDriver={setSelectedDriver} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Conductor</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDriver ? (
              <DriverCard driver={selectedDriver} />
            ) : (
              <p className="text-sm text-muted-foreground">Selecciona un marcador en el mapa.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="fares">
        <TabsList>
          <TabsTrigger value="fares">Tarifas</TabsTrigger>
          <TabsTrigger value="members">Registrar usuarios</TabsTrigger>
        </TabsList>
        <TabsContent value="fares" className="space-y-4">
          {mobilityDraft && packDraft && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Taxi (movilidad)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(
                    [
                      ["moto", "Moto"],
                      ["auto", "Auto"],
                      ["camioneta", "Camioneta"],
                      ["pet_car", "Pet"],
                    ] as const
                  ).map(([key, label]) => (
                    <FareTierFields
                      key={key}
                      label={label}
                      perKm={mobilityDraft[key].perKmUsd}
                      minUsd={mobilityDraft[key].minUsd}
                      onPerKm={(v) =>
                        setMobilityDraft((m) => (m ? { ...m, [key]: { ...m[key], perKmUsd: v } } : m))
                      }
                      onMin={(v) =>
                        setMobilityDraft((m) => (m ? { ...m, [key]: { ...m[key], minUsd: v } } : m))
                      }
                    />
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Delivery</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(
                    [
                      ["moto", "Moto"],
                      ["auto", "Auto"],
                      ["camioneta", "Camioneta"],
                    ] as const
                  ).map(([key, label]) => (
                    <FareTierFields
                      key={key}
                      label={label}
                      perKm={packDraft[key].perKmUsd}
                      minUsd={packDraft[key].minUsd}
                      onPerKm={(v) =>
                        setPackDraft((p) => (p ? { ...p, [key]: { ...p[key], perKmUsd: v } } : p))
                      }
                      onMin={(v) =>
                        setPackDraft((p) => (p ? { ...p, [key]: { ...p[key], minUsd: v } } : p))
                      }
                    />
                  ))}
                </CardContent>
              </Card>
              <Button
                disabled={patchFares.isPending}
                onClick={() =>
                  patchFares.mutate(
                    { mobilityFares: mobilityDraft, packFares: packDraft },
                    {
                      onSuccess: () => toast({ title: "Tarifas guardadas" }),
                      onError: (e) =>
                        toast({ variant: "destructive", title: "Error", description: e.message }),
                    },
                  )
                }
              >
                {patchFares.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar tarifas"}
              </Button>
            </>
          )}
        </TabsContent>
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlus className="h-4 w-4" />
                Nuevo usuario de la empresa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 max-w-md" onSubmit={handleRegister}>
                <div className="grid gap-2">
                  <Label>Tipo</Label>
                  <Select value={memberType} onValueChange={(v) => setMemberType(v as "central" | "driver")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="central">Operador central</SelectItem>
                      <SelectItem value="driver">Conductor (taxi + delivery)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {memberType === "driver" && (
                  <div className="grid gap-2">
                    <Label>Vehículo</Label>
                    <Select value={offerKind} onValueChange={(v) => setOfferKind(v as typeof offerKind)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="moto">Moto</SelectItem>
                        <SelectItem value="carro">Carro</SelectItem>
                        <SelectItem value="camion">Camioneta</SelectItem>
                        <SelectItem value="pet">Pet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Input name="name" placeholder="Nombre" required />
                <Input name="lastName" placeholder="Apellido" required />
                <Input name="email" type="email" placeholder="Correo" required />
                <Input name="phone" placeholder="Teléfono" required />
                <Input name="password" type="password" placeholder="Contraseña" required minLength={6} />
                <Button type="submit" disabled={registerMember.isPending}>
                  Registrar
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DriverCard({ driver }: { driver: CentralFleetDriver }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarImage src={driver.avatar ?? undefined} />
          <AvatarFallback>
            {driver.name[0]}
            {driver.lastName[0]}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold">
            {driver.name} {driver.lastName}
          </p>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            {driver.rating.toFixed(1)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant={driver.inService ? "default" : "secondary"}>
          {driver.inService ? "En servicio" : "Buscando clientes"}
        </Badge>
        <Badge variant={driver.receiving ? "outline" : "destructive"}>
          {driver.receiving ? "Activo" : "Inactivo"}
        </Badge>
      </div>
    </div>
  );
}

function CompanyCombobox({
  companies,
  value,
  onChange,
  search,
  onSearchChange,
}: {
  companies: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = companies.find((c) => c.id === value);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full max-w-sm justify-between font-normal">
          {selected?.name ?? "Seleccionar central…"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar empresa…" value={search} onValueChange={onSearchChange} />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
