import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  Clock, 
  CheckCircle, 
  ArrowRight, 
  Star,
  User,
  ChevronLeft,
  ChevronRight,
  Filter,
  Phone,
  Mail,
  Loader2
} from "lucide-react";
import { useCategories, useServices, useProviderCategoryAvailability, useCreateBooking, useProviderCompletedCount, useWallet } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { useSocketBookings } from "@/hooks/use-socket";
import { useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_CATEGORIES, HIDDEN_CATEGORY_SLUGS_IN_UI, getCategoryDisplayName } from "@shared/default-categories";
import { getCurrentLocation, reverseGeocode } from "@/lib/google-maps";
import { isBeforeToday } from "@/lib/date-utils";
import { CategoryIcon } from "@/components/CategoryIcon";
import { motion } from "framer-motion";
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

type ProviderOption = {
  id: number;
  name: string;
  profession: string;
  rating: number;
  reviewCount: number;
  price: number;
  firstServiceId: number;
  profileImageUrl?: string | null;
};

function ProviderOptionCard({
  provider,
  selected,
  onSelect,
}: {
  provider: ProviderOption;
  selected: boolean;
  onSelect: (providerId: number, firstServiceId: number) => void;
}) {
  const { data: completedCount, isLoading: completedCountLoading } = useProviderCompletedCount(provider.id);

  return (
    <button
      type="button"
      onClick={() => onSelect(provider.id, provider.firstServiceId)}
      className={`
        w-full p-4 rounded-lg border text-left transition-all flex flex-col items-start gap-3
        sm:flex-row sm:items-center sm:justify-between
        ${selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}
      `}
    >
      <div className="flex items-center gap-3 w-full">
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
          {provider.profileImageUrl ? (
            <img src={provider.profileImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <User className="w-6 h-6 text-primary" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-medium">{provider.name}</p>
          <p className="text-sm text-muted-foreground">{provider.profession}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
            <span className="text-sm">{provider.rating > 0 ? provider.rating.toFixed(1) : "—"}</span>
            <span className="text-xs text-muted-foreground">({provider.reviewCount} reseñas)</span>
            {completedCountLoading ? (
              <span className="text-xs text-muted-foreground">· ... completados</span>
            ) : (
              <span className="text-xs text-muted-foreground">· {completedCount ?? 0} servicios completados</span>
            )}
          </div>
        </div>
      </div>
      <div className="w-full text-left sm:w-auto sm:text-right">
        <p className="font-bold text-base sm:text-lg">${Number(provider.price).toFixed(0)}</p>
        <p className="text-xs text-muted-foreground">desde</p>
      </div>
    </button>
  );
}

export default function Booking() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  /** Id del servicio a reservar (uno del proveedor elegido en la categoría). */
  const [selectedBookingServiceId, setSelectedBookingServiceId] = useState<number | null>(null);
  const [step, setStep] = useState(1);
  /** Dirección/ubicación del servicio (geolocalización); no confundir con useLocation de wouter. */
  const [userLocation, setUserLocation] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const hasValidLocation = userLocation.trim().length > 0;
  const [notes, setNotes] = useState("");
  const [insufficientFundsOpen, setInsufficientFundsOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const createBooking = useCreateBooking();
  const { notifyNewBooking } = useSocketBookings();
  const { data: walletData, isLoading: walletLoading } = useWallet({ enabled: !!user?.id });

  const { data: categories } = useCategories();
  const { data: categoryAvailability } = useProviderCategoryAvailability();
  const visibleCategories = useMemo(() => {
    const providerSlugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));
    const hidden = new Set(HIDDEN_CATEGORY_SLUGS_IN_UI);
    return (categories ?? []).filter((c) => {
      const slug = (c as { slug?: string }).slug;
      return slug && providerSlugs.has(slug) && !hidden.has(slug);
    });
  }, [categories]);
  const categoryIdNum = selectedService ? Number(selectedService) : undefined;
  const { data: services = [], isLoading: isLoadingServices } = useServices(
    { providerCategoryId: categoryIdNum },
    { enabled: !!selectedService }
  );
  const walletBalance = typeof walletData?.wallet === "number" ? walletData.wallet : 0;

  /** Proveedores únicos de la categoría seleccionada, con datos para la lista (nombre, profesión, rating, precio). */
  const providersInCategory = useMemo(() => {
    if (!services?.length) return [];
    const byProvider = new Map<
      number,
      {
        id: number;
        name: string;
        profession: string;
        rating: number;
        reviewCount: number;
        price: number;
        firstServiceId: number;
        profileImageUrl?: string | null;
      }
    >();
    for (const s of services as Array<{
      id: number;
      price: string | number;
      provider?: {
        id: number;
        profession?: string;
        rating?: string | number;
        reviewCount?: number;
        user?: { firstName?: string; lastName?: string; name?: string; profileImageUrl?: string | null };
      };
    }>) {
      const p = s.provider;
      if (!p?.id) continue;
      const name = p.user
        ? [p.user.firstName, p.user.lastName].filter(Boolean).join(" ").trim() || (p.user as { name?: string }).name || "Asociado"
        : "Asociado";
      const price = typeof s.price === "string" ? Number(s.price) : Number(s.price);
      if (!byProvider.has(p.id)) {
        byProvider.set(p.id, {
          id: p.id,
          name,
          profession: p.profession ?? "",
          rating: Number(p.rating ?? 0),
          reviewCount: Number(p.reviewCount ?? 0),
          price,
          firstServiceId: s.id,
          profileImageUrl: p.user?.profileImageUrl ?? null,
        });
      } else {
        const existing = byProvider.get(p.id)!;
        if (price < existing.price) {
          existing.price = price;
          existing.firstServiceId = s.id;
        }
      }
    }
    return Array.from(byProvider.values());
  }, [services]);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "No disponible",
        description: "Tu navegador no soporta geolocalización",
      });
      return;
    }
    setLocationLoading(true);
    toast({ title: "Obteniendo ubicación...", description: "Permite el acceso si el navegador lo pide." });
    getCurrentLocation()
      .then(async (position) => {
        const { latitude, longitude } = position.coords;
        const result = await reverseGeocode(latitude, longitude);
        if (result?.address) {
          setUserLocation(result.address);
          toast({ title: "Ubicación obtenida", description: "Tu dirección se ha guardado para la reserva." });
        } else {
          setUserLocation(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          toast({ title: "Coordenadas guardadas", description: "No se pudo obtener la dirección exacta; se usan coordenadas." });
        }
      })
      .catch(() => {
        toast({
          variant: "destructive",
          title: "Ubicación no disponible",
          description: "No se pudo obtener tu ubicación. Revisa los permisos del navegador.",
        });
      })
      .finally(() => setLocationLoading(false));
  };

  // Horarios disponibles (mock; en el futuro podría venir de disponibilidad del profesional)
  const timeSlots = [
    "08:00", "09:00", "10:00", "11:00", "12:00",
    "14:00", "15:00", "16:00", "17:00", "18:00"
  ];

  const handleSelectProvider = (providerId: number, firstServiceId: number) => {
    setSelectedProvider(String(providerId));
    setSelectedBookingServiceId(firstServiceId);
  };

  /** Fecha a inicio de día en ISO para la API (hora vacía). */
  const bookingDateISO = useMemo(() => {
    if (!selectedDate) return null;
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [selectedDate]);

  const selectedServiceForBooking = useMemo(() => {
    if (!selectedBookingServiceId) return null;
    const list = services as Array<{ id: number; price?: string | number }>;
    return list.find((s) => s.id === selectedBookingServiceId) ?? null;
  }, [services, selectedBookingServiceId]);

  const handleBooking = () => {
    if (!user?.id) {
      toast({
        variant: "destructive",
        title: "Inicia sesión",
        description: "Debes iniciar sesión para confirmar la reserva.",
      });
      return;
    }
    if (!hasValidLocation) {
      toast({
        variant: "destructive",
        title: "Dirección requerida",
        description: "Debes seleccionar tu ubicación/dirección antes de confirmar la reserva.",
      });
      setStep(1);
      return;
    }
    if (selectedBookingServiceId == null || !bookingDateISO) {
      toast({
        variant: "destructive",
        title: "Datos incompletos",
        description: "Selecciona asociado y fecha.",
      });
      return;
    }
    if (walletLoading) {
      toast({
        title: "Validando saldo",
        description: "Estamos cargando tu saldo actual, intenta de nuevo en un momento.",
      });
      return;
    }

    const selectedServicePrice = Number(selectedServiceForBooking?.price ?? 0);
    if (Number.isFinite(selectedServicePrice) && selectedServicePrice > 0 && walletBalance < selectedServicePrice) {
      setInsufficientFundsOpen(true);
      return;
    }
    createBooking.mutate(
      {
        userId: user.id,
        serviceId: selectedBookingServiceId,
        date: bookingDateISO,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          const providerId = (data as { providerId?: number })?.providerId;
          if (providerId != null && notifyNewBooking) {
            notifyNewBooking(String(providerId), data);
          }
          setStep(4);
        },
      }
    );
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="min-h-screen bg-background">
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
                navigate("/recharge");
              }}
            >
              Recargar saldo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="absolute inset-0 grid-pattern opacity-50"></div>
        <div className="container px-4 mx-auto max-w-7xl relative">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <Badge variant="outline" className="mb-4 border-primary/50 text-primary">
              <CalendarIcon className="w-3 h-3 mr-1" />
              Reserva en 3 clics
            </Badge>
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">
              Reserva tu <span className="text-gradient-primary">Servicio</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Encuentra asociados verificados, técnicos especializados y consultores.
              Reserva online con confirmación inmediata.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Booking Flow */}
      <section className="py-12">
        <div className="container px-4 mx-auto max-w-7xl">
          
          {/* Progress Steps */}
          <div className="flex justify-center mb-12">
            <div className="flex items-center gap-4">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-bold
                    ${step >= s ? 'bg-primary text-primary-foreground glow-primary' : 'bg-muted text-muted-foreground'}
                  `}>
                    {step > s ? <CheckCircle className="w-5 h-5" /> : s}
                  </div>
                  {s < 3 && (
                    <div className={`w-16 h-1 mx-2 ${step > s ? 'bg-primary' : 'bg-muted'}`}></div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2">
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {/* Step 1: Select Service */}
                {step === 1 && (
                  <motion.div variants={itemVariants}>
                    <Card className="card-industrial">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Filter className="w-5 h-5 text-primary" />
                          Selecciona un Servicio
                        </CardTitle>
                        <CardDescription>
                          Elige tu ubicación y el tipo de servicio que necesitas
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Location: solo se llena al presionar el botón (como en el chat) */}
                        <div className="space-y-3">
                          <Label>Ubicación</Label>
                          <div className="flex gap-2">
                            <div className="relative flex-1 min-w-0">
                              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                              <Input
                                readOnly
                                placeholder="Presiona el botón para usar tu ubicación actual"
                                className="input-industrial pl-10 bg-muted/50"
                                value={userLocation}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleUseMyLocation}
                              disabled={locationLoading}
                              className="shrink-0 border-border"
                            >
                              {locationLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <MapPin className="h-4 w-4 mr-1.5" />
                                  Usar mi ubicación
                                </>
                              )}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            🎯 La ubicacion nos permite mostrarte asociados cercanos y fijar el punto del servicio
                          </p>
                        </div>

                        {/* Tipo de servicio: categorías con servicios seleccionables; sin servicios se ven apagadas */}
                        <div className="space-y-3">
                          <Label>Tipo de Servicio</Label>
                          <div className="grid sm:grid-cols-2 gap-3">
                            {visibleCategories
                              ?.filter((cat): cat is typeof cat & { id: number; icon?: string } => cat.id != null)
                              ?.map((cat) => {
                                const hasServices = categoryAvailability?.[String(cat.id)] === true;
                                return (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    disabled={!hasServices}
                                    onClick={() => hasServices && setSelectedService(String(cat.id))}
                                    className={`
                                      p-4 rounded-lg border text-left transition-all flex items-center gap-3
                                      ${!hasServices
                                        ? "opacity-50 cursor-not-allowed border-border bg-muted/30 text-muted-foreground"
                                        : selectedService === String(cat.id)
                                          ? "border-primary bg-primary/10 text-primary"
                                          : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"}
                                    `}
                                  >
                                    <span className={`flex shrink-0 p-2 rounded-lg ${hasServices ? "bg-muted/80" : "bg-muted"}`}>
                                      <CategoryIcon name={cat.icon ?? "HelpCircle"} className="h-5 w-5" />
                                    </span>
                                    {getCategoryDisplayName(cat)}
                                    {!hasServices && (
                                      <span className="text-xs ml-auto shrink-0">Sin servicios</span>
                                    )}
                                  </button>
                                );
                              })}
                          </div>
                        </div>

                        <Button 
                          className="w-full" 
                          size="lg"
                          onClick={() => setStep(2)}
                            disabled={!selectedService || !hasValidLocation || locationLoading}
                        >
                          Continuar <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Step 2: Select Provider & Date */}
                {step === 2 && (
                  <motion.div variants={itemVariants} className="space-y-6">
                    <Card className="card-industrial">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <User className="w-5 h-5 text-primary" />
                          Selecciona Asociado
                        </CardTitle>
                        <CardDescription>
                          Asociados con servicios en la categoria elegida
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {isLoadingServices ? (
                          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span>Cargando asociados...</span>
                          </div>
                        ) : !providersInCategory.length ? (
                          <p className="text-center py-8 text-muted-foreground">
                            No hay asociados con servicios en esta categoria. Prueba otra categoria.
                          </p>
                        ) : (
                          <div className="space-y-4">
                            {providersInCategory.map((provider) => (
                              <ProviderOptionCard
                                key={provider.id}
                                provider={provider}
                                selected={selectedProvider === String(provider.id)}
                                onSelect={handleSelectProvider}
                              />
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="card-industrial">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CalendarIcon className="w-5 h-5 text-primary" />
                          Selecciona Fecha y Hora
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <Calendar
                              mode="single"
                              selected={selectedDate}
                              onSelect={setSelectedDate}
                              disabled={isBeforeToday}
                              className="rounded-lg border border-border"
                            />
                          </div>
                          {/* Horarios: ocultos por ahora; se pueden volver a mostrar cuando se use disponibilidad real */}
                          <div className="hidden">
                            <Label className="mb-3 block">Horarios Disponibles</Label>
                            <div className="grid grid-cols-2 gap-2">
                              {timeSlots.map((time) => (
                                <Button
                                  key={time}
                                  variant="outline"
                                  className="border-border hover:border-primary hover:bg-primary/10"
                                >
                                  <Clock className="w-4 h-4 mr-1" />
                                  {time}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setStep(1);
                              setSelectedProvider(null);
                              setSelectedBookingServiceId(null);
                            }}
                          >
                            <ChevronLeft className="mr-2 h-4 w-4" />
                            Atrás
                          </Button>
                          <Button 
                            className="flex-1"
                            onClick={() => setStep(3)}
                            disabled={!selectedProvider || !selectedDate || !hasValidLocation}
                          >
                            Continuar <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Step 3: Confirm Booking */}
                {step === 3 && (
                  <motion.div variants={itemVariants}>
                    <Card className="card-industrial">
                      <CardHeader>
                        <CardTitle>Confirma tu Reserva</CardTitle>
                        <CardDescription>
                          Revisa los detalles de tu reserva
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Booking Summary */}
                        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                          <h3 className="font-semibold mb-3">Resumen de Reserva</h3>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Categoría:</span>
                              <span>
                                {getCategoryDisplayName(categories?.find((c) => c.id != null && String(c.id) === selectedService)) || "—"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Asociado:</span>
                              <span>{providersInCategory.find((p) => String(p.id) === selectedProvider)?.name ?? "—"}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Fecha:</span>
                              <span>{selectedDate?.toLocaleDateString("es-EC")}</span>
                            </div>
                            {/* Hora oculta; al crear la reserva se envía la fecha sin hora (o hora vacía) */}
                            <div className="hidden">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Hora:</span>
                                <span>—</span>
                              </div>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Ubicación:</span>
                              <span>{userLocation || "Por determinar"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Notes */}
                        <div className="space-y-3">
                          <Label>Notas adicionales (opcional)</Label>
                          <Textarea
                            placeholder="Describe detalles adicionales de tu requerimiento..."
                            className="input-industrial"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                          />
                        </div>

                        {/* Contact Info: datos del usuario cliente que crea la reserva */}
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Teléfono de contacto</Label>
                            <div className="relative">
                              <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input
                                readOnly
                                value={(user as { phone?: string } | null)?.phone ?? ""}
                                placeholder="Tu teléfono (Mi Cuenta)"
                                className="input-industrial pl-10 bg-muted/50"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Email de confirmación</Label>
                            <div className="relative">
                              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input
                                readOnly
                                type="email"
                                value={user?.email ?? ""}
                                placeholder="Tu correo (Mi Cuenta)"
                                className="input-industrial pl-10 bg-muted/50"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row gap-3">
                          <Button
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={() => setStep(2)}
                            disabled={createBooking.isPending}
                          >
                            <ChevronLeft className="mr-2 h-4 w-4" />
                            Atrás
                          </Button>
                          <Button
                            className="w-full sm:flex-1 min-h-12 py-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-md active:scale-[0.98] transition-transform"
                            onClick={handleBooking}
                            disabled={createBooking.isPending}
                          >
                            {createBooking.isPending ? (
                              <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Confirmando…
                              </>
                            ) : (
                              <>
                                <CheckCircle className="mr-2 h-5 w-5" />
                                Confirmar Reserva
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Step 4: Confirmation */}
                {step === 4 && (
                  <motion.div variants={itemVariants}>
                    <Card className="card-industrial text-center py-8">
                      <CardContent>
                        <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-6 glow-emerald">
                          <CheckCircle className="w-10 h-10 text-accent" />
                        </div>
                        <h2 className="text-2xl font-display font-bold mb-6">¡Reserva Confirmada!</h2>
                        <div className="flex gap-3 justify-center flex-wrap">
                          <Button variant="outline" asChild>
                            <Link href="/bookings">Ver mis Reservas</Link>
                          </Button>
                          <Button asChild>
                            <Link href="/">Volver al Inicio</Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </motion.div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <Card className="card-industrial sticky top-24">
                <CardHeader>
                  <CardTitle className="text-lg">¿Necesitas Ayuda?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm font-medium mb-1">💬 Chat en Vivo</p>
                    <p className="text-xs text-muted-foreground">
                      Chatea con un asesor para resolver tus dudas
                    </p>
                    <Button variant="ghost" size="sm" className="p-0 h-auto text-primary" asChild>
                      <Link href="/chat">Iniciar chat</Link>
                    </Button>
                  </div>
                  <div className="p-3 rounded-lg bg-accent/5 border border-accent/20">
                    <p className="text-sm font-medium mb-1">📞 Línea de Ayuda</p>
                    <p className="text-xs text-muted-foreground">
                      Ecuador: 1800 GENFEB (436333)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      WhatsApp: +593 99 123 4567
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
