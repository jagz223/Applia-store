import { useRoute, Link, useLocation } from "wouter";
import { useService, useCreateBooking, useCurrentProvider, useBookings, useProviderCompletedCount, useWallet } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Star, ShieldCheck, Calendar, Clock, ArrowLeft, MessageSquare, Pencil, User, Wallet, Banknote } from "lucide-react";
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
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { isBeforeToday } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { api } from "@shared/routes";
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
        title: "Validando saldo",
        description: "Estamos cargando tu saldo actual, intenta de nuevo en un momento.",
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

  // Prevent booking own service
  const isOwnService = myProviderProfile?.id === service.providerId;
  const hasBookingForThisService = (myBookings as { serviceId: number }[] | undefined)?.some((b) => b.serviceId === id) ?? false;
  const showChatButton = isAuthenticated && (isOwnService || hasBookingForThisService);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <AlertDialog open={insufficientFundsOpen} onOpenChange={setInsufficientFundsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Saldo insuficiente</AlertDialogTitle>
            <AlertDialogDescription>
              No tienes saldo suficiente en tu wallet para pedir este servicio. Recarga tu saldo para continuar.
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
              Recargar saldo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Link href="/explore" className="inline-flex items-center text-muted-foreground hover:text-primary mb-6 transition-colors">
        <ArrowLeft className="mr-2 h-4 w-4" /> Volver a los servicios
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: Service Info */}
        <div className="lg:col-span-2 space-y-8">
          {/* Nota: no mostramos foto del servicio. Solo mostramos foto del profesional en el círculo. */}

          <div>
            <div className="flex items-center gap-3 mb-4">
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20">{getCategoryDisplayName(service.category)}</Badge>
              <div className="flex items-center text-amber-500 font-bold text-sm">
                <Star className="h-4 w-4 fill-current mr-1" />
                {Number((service.provider?.user as { rating?: number } | undefined)?.rating ?? 5).toFixed(1)} (
                {Number((service.provider?.user as { ratingCount?: number } | undefined)?.ratingCount ?? 0)} reseñas)
                <span className="font-normal text-xs text-muted-foreground ml-2">
                  · {completedCountLoading ? "..." : `${completedCount ?? 0}`} servicios completados
                </span>
              </div>
            </div>
            
            <h1 className="text-4xl font-display font-bold mb-4">{service.title}</h1>
            
            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>{service.description}</p>
            </div>
          </div>

          <div className="border-t border-border/50 pt-8">
            <h3 className="text-xl font-bold font-display mb-6">Acerca del asociado</h3>
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-bold text-2xl overflow-hidden">
                {service.provider?.user?.profileImageUrl ? (
                  <img
                    src={service.provider?.user?.profileImageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-7 h-7" />
                )}
              </div>
              <div>
                <h4 className="font-bold text-lg">{service.provider?.user?.firstName ?? ""} {service.provider?.user?.lastName ?? ""}</h4>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <span>{service.provider.profession}</span>
                  <span>•</span>
                  <span>{service.provider.yearsExperience} años de experiencia</span>
                </div>
                <p className="text-muted-foreground">{service.provider.bio}</p>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Booking Card */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-2xl border border-border bg-white shadow-xl p-6 space-y-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Price</p>
                <p className="text-3xl font-bold text-primary">${Number(service.price).toFixed(0)}</p>
              </div>
              {service.provider.isVerified && (
                <div className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-bold">
                  <ShieldCheck className="h-3 w-3" /> Verificado
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs font-bold text-foreground">Tiempo de respuesta</p>
                  <p className="text-xs text-muted-foreground">Suele responder en 1 hora</p>
                </div>
              </div>
            </div>

            {showChatButton && (
              <Button className="w-full" variant="outline" asChild>
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
              <Button className="w-full" variant="outline" asChild>
                <Link href={`/edit-service/${id}`} className="gap-2">
                  <Pencil className="h-4 w-4" />
                  Editar servicio
                </Link>
              </Button>
            )}
            {isAuthenticated ? (
               isOwnService ? (
                 <Button className="w-full" variant="secondary" disabled>No puedes reservar tu propio servicio</Button>
               ) : (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full h-12 text-lg shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
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
                              <Wallet className="mb-2 h-6 w-6" />
                              <span className="text-xs font-medium">Billetera</span>
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
                          <p className="text-[11px] text-red-500 font-medium">Saldo insuficiente para este método.</p>
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
                      <Button onClick={handleBooking} disabled={createBooking.isPending}>
                        {createBooking.isPending ? "Reservando..." : "Confirmar reserva"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
               )
            ) : (
              <Button className="w-full h-12 text-lg" variant="outline" asChild>
                <Link href="/login">Inicia sesión para reservar</Link>
              </Button>
            )}
            
            <p className="text-xs text-center text-muted-foreground">
              Todavía no se te cobrará.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
