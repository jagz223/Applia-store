import { useRoute, Link, useLocation } from "wouter";
import { useService, useCreateBooking, useCurrentProvider, useBookings, useProviderCompletedCount, useWallet } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import {
  Loader2,
  Star,
  ShieldCheck,
  Calendar,
  Clock,
  ArrowLeft,
  MessageSquare,
  Pencil,
  Banknote,
  Cog,
  Lightbulb,
  LineChart,
  Wrench,
  Sparkles,
  Target,
  Award,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { isBeforeToday } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { getCategoryDisplayName } from "@shared/default-categories";
import { useSocketBookings } from "@/hooks/use-socket";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getProviderUserAvatarUrl } from "@/lib/user-avatar";

const SKILL_ICONS = [Cog, Lightbulb, LineChart, Wrench, Sparkles, Target, Award] as const;

/** Paleta alineada al diseño de referencia (crema, dorado/naranja, verde éxito). */
const cream = {
  page: "#FDFBF7",
  box: "#F2F2F2",
};
const gold = {
  accent: "#D48806",
  darkGoldenrod: "#B8860B",
  ctaFrom: "#F39C12",
  ctaTo: "#E67E22",
};
const success = "#27AE60";

export default function ServiceDetails() {
  const [, params] = useRoute("/service/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  const { data: serviceRaw, isLoading } = useService(id);
  const service = serviceRaw as any; // Cast for easier access to nested provider/user
  const { user, isAuthenticated } = useAuth();
  // ... rest of the component
  const { data: myProviderProfile } = useCurrentProvider();
  const { data: myBookings } = useBookings();
  const { data: walletData, isLoading: walletLoading } = useWallet({ enabled: isAuthenticated });
  const providerId = Number((service as any)?.providerId ?? (service as any)?.provider?.id);
  const {
    data: completedCount,
    isLoading: completedCountLoading,
  } = useProviderCompletedCount(Number.isFinite(providerId) ? providerId : undefined);
  
  const createBooking = useCreateBooking();
  const { notifyNewBooking } = useSocketBookings();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [notes, setNotes] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [insufficientFundsOpen, setInsufficientFundsOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "cash">("wallet");
  const { toast } = useToast();
  const walletBalance = typeof walletData?.wallet === "number" ? walletData.wallet : 0;

  const handleBooking = () => {
    if (!date) return;
    if (!user?.id) {
      toast({
        variant: "destructive",
        title: "Autenticación requerida",
        description: "Debes iniciar sesión para realizar una reserva",
      });
      setLocation("/login");
      return;
    }
    
    if (walletLoading) {
      toast({
        title: "Validando Saldo Genfeb",
        description: "Estamos cargando tu Saldo Genfeb, intenta de nuevo en un momento.",
      });
      return;
    }

    const servicePrice = Number(service?.price ?? 0);
    if (service && paymentMethod === "wallet" && Number.isFinite(servicePrice) && servicePrice > 0 && walletBalance < servicePrice) {
      setInsufficientFundsOpen(true);
      return;
    }

    createBooking.mutate(
      {
        userId: user.id,
        serviceId: id,
        date: date.toISOString() as any,
        notes: notes,
        paymentMethod: paymentMethod,
      },
      {
        onSuccess: (data) => {
          const providerId = (service as any).providerId ?? (service as any).provider?.id;
          if (providerId != null && notifyNewBooking) {
            notifyNewBooking(String(providerId), data);
          }
          setDialogOpen(false);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="container py-20 text-center">
        <h1 className="text-2xl font-bold">Servicio no encontrado</h1>
        <Link href="/explore">
          <Button variant="ghost">Volver a explorar</Button>
        </Link>
      </div>
    );
  }

  const providerProfile = service.provider as {
    id?: number;
    profession?: string;
    yearsExperience?: number;
    bio?: string;
    skills?: string[] | null;
    isVerified?: boolean;
    rating?: string | number | null;
    reviewCount?: number | null;
    user?: {
      firstName?: string;
      lastName?: string;
      name?: string;
      rating?: number;
      ratingCount?: number;
      profileImageUrl?: string | null;
    };
  };

  const avatarUrl = getProviderUserAvatarUrl(providerProfile);
  const ratingNum = (() => {
    const r = providerProfile?.rating;
    if (r != null && String(r).trim() !== "") {
      const n = Number(r);
      if (!Number.isNaN(n)) return n;
    }
    const uR = Number(providerProfile?.user?.rating);
    return Number.isFinite(uR) ? uR : 0;
  })();
  const reviewTotal = (() => {
    const rc = providerProfile?.reviewCount;
    if (rc != null && Number(rc) >= 0) return Number(rc);
    return Number(providerProfile?.user?.ratingCount ?? 0);
  })();
  const displayName =
    [providerProfile?.user?.firstName, providerProfile?.user?.lastName].filter(Boolean).join(" ").trim() ||
    providerProfile?.user?.name ||
    "Asociado";
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";

  // Prevent booking own service
  const isOwnService = myProviderProfile?.id === service.providerId;
  const hasBookingForThisService = (myBookings as { serviceId: number }[] | undefined)?.some((b) => b.serviceId === id) ?? false;
  const showChatButton = isAuthenticated && (isOwnService || hasBookingForThisService);

  return (
    <div
      className="min-h-screen overflow-x-hidden dark:bg-background"
      style={{ backgroundColor: cream.page }}
    >
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <AlertDialog open={insufficientFundsOpen} onOpenChange={setInsufficientFundsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Saldo Genfeb insuficiente</AlertDialogTitle>
            <AlertDialogDescription>
              No tienes suficiente Saldo Genfeb para pedir este servicio. Añade saldo para continuar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setInsufficientFundsOpen(false);
                setDialogOpen(false);
                setLocation("/recharge");
              }}
            >
              Añadir saldo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Link
        href="/explore"
        className="mb-6 inline-flex items-center text-neutral-600 transition-colors hover:text-[#D48806] dark:text-muted-foreground dark:hover:text-primary"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Volver a los servicios
      </Link>

      {/*
        Grid estable: minmax(0,1fr) evita que la columna de texto colapse a 0 y rompa palabras.
        Dos columnas solo desde lg (≥1024px) para no forzar 1fr+360px en ventanas estrechas.
      */}
      <div className="mx-auto grid w-full max-w-full grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:items-start lg:gap-x-10">
        {/* COLUMNA IZQUIERDA: perfil + contenido */}
        <div className="min-w-0 max-w-full space-y-10 break-words">
          {/* Hero perfil (estilo referencia) */}
          <section className="relative isolate rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-sm md:p-8 dark:border-border dark:bg-card/80">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              <div className="relative shrink-0">
                <Avatar
                  className="h-32 w-32 border-2 border-white shadow-md ring-4 ring-[#C9A227]/90 md:h-40 md:w-40"
                  style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
                >
                  <AvatarImage src={avatarUrl ?? undefined} alt="" className="object-cover" />
                  <AvatarFallback className="bg-muted text-3xl font-semibold text-muted-foreground md:text-4xl">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h1 className="font-display text-2xl font-bold tracking-tight text-neutral-950 md:text-3xl dark:text-foreground">
                  {displayName}
                </h1>
                {providerProfile?.isVerified ? (
                  <div
                    className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white shadow-sm sm:gap-2 sm:px-3.5 sm:py-1.5 sm:text-sm"
                    style={{ backgroundColor: gold.darkGoldenrod }}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-white sm:h-4 sm:w-4" aria-hidden />
                    <span className="leading-tight">Verificado por GenFeb</span>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-col items-center gap-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-start sm:gap-x-6 sm:gap-y-2">
                  <div className="flex items-center gap-1.5" style={{ color: gold.accent }}>
                    <Star className="h-5 w-5 fill-current" aria-hidden />
                    {reviewTotal === 0 && ratingNum === 0 ? (
                      <span className="font-medium text-neutral-600 dark:text-muted-foreground">Sin reseñas aún</span>
                    ) : (
                      <>
                        <span className="text-lg font-bold tabular-nums text-neutral-950 dark:text-foreground">
                          {ratingNum.toFixed(1)}
                        </span>
                        <span className="text-neutral-600 dark:text-muted-foreground">
                          ({reviewTotal === 1 ? "1 reseña" : `${reviewTotal} reseñas`})
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-neutral-600 dark:text-muted-foreground">
                    {completedCountLoading ? (
                      "…"
                    ) : (
                      <>
                        <span className="font-semibold tabular-nums text-neutral-950 dark:text-foreground">
                          {completedCount ?? 0}
                        </span>{" "}
                        servicios completados
                      </>
                    )}
                  </p>
                </div>

                <p className="mt-3 text-sm text-neutral-600 dark:text-muted-foreground">
                  <span className="font-medium text-neutral-950 dark:text-foreground">{providerProfile?.profession}</span>
                  {providerProfile?.yearsExperience != null ? (
                    <>
                      <span className="mx-2 text-border">·</span>
                      {providerProfile.yearsExperience} años de experiencia
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          </section>

          {/* Servicio publicado */}
          <section className="space-y-3">
            <Badge
              variant="outline"
              className="border-[#D48806]/35 bg-[#D48806]/10 text-[#B45309] dark:border-primary/25 dark:bg-primary/10 dark:text-primary"
            >
              {getCategoryDisplayName(service.category)}
            </Badge>
            <h2 className="font-display text-2xl font-bold text-neutral-950 md:text-3xl dark:text-foreground">{service.title}</h2>
            <p className="text-base leading-relaxed text-neutral-700 dark:text-muted-foreground">{service.description}</p>
          </section>

          {/* Biografía */}
          {providerProfile?.bio ? (
            <section className="space-y-3">
              <h3 className="text-lg font-bold text-neutral-950 dark:text-foreground">Biografía y enfoque profesional</h3>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-700 dark:text-muted-foreground">
                {providerProfile.bio}
              </p>
            </section>
          ) : null}

          {/* Competencias (datos estructurados; sin campo extra en BD) */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-neutral-950 dark:text-foreground">Competencias principales</h3>
            <ul
              className="list-disc space-y-2 pl-5 text-[15px] text-neutral-700 marker:text-[#D48806] dark:text-muted-foreground dark:marker:text-amber-600"
            >
              <li>
                <span className="font-medium text-neutral-950 dark:text-foreground">Categoría:</span>{" "}
                {getCategoryDisplayName(service.category)}
              </li>
              <li>
                <span className="font-medium text-neutral-950 dark:text-foreground">Especialidad:</span>{" "}
                {providerProfile?.profession ?? "—"}
              </li>
              {providerProfile?.yearsExperience != null ? (
                <li>
                  <span className="font-medium text-neutral-950 dark:text-foreground">Experiencia:</span>{" "}
                  {providerProfile.yearsExperience} años
                </li>
              ) : null}
            </ul>
          </section>

          {/* Habilidades con iconos */}
          {Array.isArray(providerProfile?.skills) && providerProfile.skills.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-lg font-bold text-neutral-950 dark:text-foreground">Habilidades clave</h3>
              <div className="flex flex-wrap gap-2.5">
                {providerProfile.skills.map((skill, index) => {
                  const Icon = SKILL_ICONS[index % SKILL_ICONS.length];
                  return (
                    <div
                      key={`${skill}-${index}`}
                      className="inline-flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-medium text-neutral-900 shadow-sm dark:border-border dark:bg-muted/20 dark:text-foreground"
                    >
                      <Icon
                        className="h-4 w-4 shrink-0 dark:text-amber-500"
                        style={{ color: gold.darkGoldenrod }}
                        aria-hidden
                      />
                      {skill}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        {/* COLUMNA DERECHA: tarjeta de servicio (ancho fijado por la grid, sin solapar la izquierda) */}
        <aside className="relative z-0 min-w-0 w-full max-w-full lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-6 rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:border-border dark:bg-card">
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-muted-foreground">Precio</p>
              <p
                className="mt-0.5 text-4xl font-bold tabular-nums dark:text-amber-500"
                style={{ color: gold.accent }}
              >
                ${Number(service.price).toFixed(0)}
              </p>
            </div>

            <div
              className="rounded-xl border border-neutral-200/90 p-4 dark:border-border dark:bg-muted/10"
              style={{ backgroundColor: cream.box }}
            >
              <div className="flex gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500 dark:text-muted-foreground" />
                <div>
                  <p className="text-sm font-semibold text-neutral-950 dark:text-foreground">Tiempo de respuesta</p>
                  <p className="text-sm text-neutral-600 dark:text-muted-foreground">Suele responder en 1 hora</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-3 dark:border-border dark:bg-muted/5">
              <p className="text-sm font-semibold text-neutral-950 dark:text-foreground">Incluye</p>
              <ul className="space-y-2 text-sm text-neutral-600 dark:text-muted-foreground">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: success }} aria-hidden />
                  Reserva con fecha acordada en la app
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: success }} aria-hidden />
                  Chat con el asociado tras la reserva
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: success }} aria-hidden />
                  Pago con Saldo Genfeb o en efectivo al finalizar
                </li>
              </ul>
            </div>

            {showChatButton && (
              <Button
                variant="outline"
                className="h-11 w-full rounded-lg border-[#E0E0E0] bg-white font-medium text-neutral-900 shadow-sm hover:bg-[#F9F9F9] hover:text-neutral-950 dark:border-neutral-600 dark:bg-card dark:text-foreground dark:hover:bg-muted/50 [&_svg]:text-neutral-500"
                asChild
              >
                <Link
                  href={
                    (service as { provider?: { userId?: string } }).provider?.userId
                      ? `/chat?with=${(service as { provider: { userId: string } }).provider.userId}&serviceId=${id}`
                      : "/chat"
                  }
                  className="gap-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  Chat
                </Link>
              </Button>
            )}
            {isOwnService && (
              <Button
                variant="outline"
                className="h-11 w-full rounded-lg border-[#E0E0E0] bg-white font-medium text-neutral-900 shadow-sm hover:bg-[#F9F9F9] hover:text-neutral-950 dark:border-neutral-600 dark:bg-card dark:text-foreground dark:hover:bg-muted/50 [&_svg]:text-neutral-500"
                asChild
              >
                <Link href={`/edit-service/${id}`} className="gap-2">
                  <Pencil className="h-4 w-4" />
                  Editar servicio
                </Link>
              </Button>
            )}
            {isAuthenticated ? (
               isOwnService ? (
                 <Button
                   className="h-auto min-h-12 w-full rounded-lg border-0 px-3 py-3 text-center text-sm font-semibold leading-snug text-white shadow-sm whitespace-normal [text-wrap:balance] disabled:opacity-90 sm:px-4 sm:text-base dark:bg-teal-900"
                   variant="ghost"
                   disabled
                   style={{ backgroundColor: "#33B8A6" }}
                 >
                   No puedes reservar tu propio servicio
                 </Button>
               ) : (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-12 w-full rounded-lg border-0 text-lg font-semibold text-white shadow-lg shadow-orange-500/25 transition-transform hover:scale-[1.01] hover:opacity-[0.98] hover:shadow-xl hover:shadow-orange-500/30"
                      style={{
                        backgroundImage: `linear-gradient(to right, ${gold.ctaFrom}, ${gold.ctaTo})`,
                      }}
                    >
                      Reservar ahora
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Reservar servicio</DialogTitle>
                      <DialogDescription>
                        Selecciona una fecha para solicitar este servicio a {service.provider?.user?.firstName ?? "el asociado"}.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                      <div className="flex justify-center border rounded-lg p-2">
                        <CalendarComponent
                          mode="single"
                          selected={date}
                          onSelect={setDate}
                          className="rounded-md"
                          disabled={isBeforeToday}
                        />
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm font-bold">Método de pago</Label>
                        <RadioGroup 
                          value={paymentMethod} 
                          onValueChange={(val: any) => setPaymentMethod(val)}
                          className="grid grid-cols-2 gap-4"
                        >
                          <div>
                            <RadioGroupItem value="wallet" id="wallet" className="peer sr-only" />
                            <Label
                              htmlFor="wallet"
                              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                            >
                              <Banknote className="mb-2 h-6 w-6" />
                              <span className="text-xs font-medium">Saldo Genfeb</span>
                              <span className="text-[10px] text-muted-foreground mt-1">${walletBalance.toFixed(2)}</span>
                            </Label>
                          </div>
                          <div>
                            <RadioGroupItem value="cash" id="cash" className="peer sr-only" />
                            <Label
                              htmlFor="cash"
                              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                            >
                              <Banknote className="mb-2 h-6 w-6" />
                              <span className="text-xs font-medium">Efectivo</span>
                              <span className="text-[10px] text-muted-foreground mt-1">Pago físico</span>
                            </Label>
                          </div>
                        </RadioGroup>
                        {paymentMethod === "wallet" && walletBalance < Number(service.price) && (
                          <p className="text-[11px] text-red-500 font-medium">Saldo Genfeb insuficiente para este método.</p>
                        )}
                        {paymentMethod === "cash" && (
                          <p className="text-[11px] text-muted-foreground">Paga directamente al asociado al finalizar el servicio.</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Notas para el asociado</label>
                        <Textarea 
                          placeholder="Describe tus necesidades..."
                          value={notes} 
                          onChange={(e) => setNotes(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="ghost"
                        disabled={createBooking.isPending}
                        className={
                          createBooking.isPending
                            ? "h-11 w-full rounded-lg border border-neutral-200 bg-muted font-semibold text-muted-foreground shadow-sm sm:w-auto"
                            : "h-11 w-full rounded-lg border-0 font-semibold text-white shadow-md shadow-orange-500/20 hover:opacity-95 sm:w-auto"
                        }
                        style={
                          createBooking.isPending
                            ? undefined
                            : { backgroundImage: `linear-gradient(to right, ${gold.ctaFrom}, ${gold.ctaTo})` }
                        }
                      >
                        {createBooking.isPending ? "Reservando..." : "Confirmar reserva"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
               )
            ) : (
              <Button
                variant="outline"
                className="h-12 w-full rounded-lg border-[#E0E0E0] bg-white text-lg font-semibold text-neutral-900 shadow-sm hover:bg-[#F9F9F9] dark:border-neutral-600 dark:bg-card dark:text-foreground dark:hover:bg-muted/50"
                asChild
              >
                <Link href="/login">Inicia sesión para reservar</Link>
              </Button>
            )}
            
            <p className="text-xs text-center text-muted-foreground">
              Todavía no se te cobrará.
            </p>
          </div>
        </aside>
      </div>
    </div>
    </div>
  );
}
