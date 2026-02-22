import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Search,
  Phone,
  Mail
} from "lucide-react";
import { useCategories, useServices } from "@/hooks/use-mango-data";
import { motion } from "framer-motion";

export default function Booking() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [location, setLocation] = useState("");
  
  const { data: categories } = useCategories();
  const { data: services } = useServices();

  // Mock available time slots
  const timeSlots = [
    "08:00", "09:00", "10:00", "11:00", "12:00",
    "14:00", "15:00", "16:00", "17:00", "18:00"
  ];

  // Mock providers
  const providers = [
    { id: "1", name: "Ing. Carlos Mendoza", profession: "Ingeniero Civil", rating: 4.9, reviews: 234, price: 45, image: null },
    { id: "2", name: "Abg. María García", profession: "Abogada Corporativa", rating: 4.8, reviews: 189, price: 60, image: null },
    { id: "3", name: "Eco. Roberto Sánchez", profession: "Asesor Financiero", rating: 5.0, reviews: 312, price: 55, image: null },
  ];

  const handleBooking = () => {
    setStep(4); // Confirmation step
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
              Encuentra profesionales verificados, técnicos especializados y consultores. 
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
                          Elige la categoría y tipo de servicio que necesitas
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Category Selection */}
                        <div className="space-y-3">
                          <Label>Categoría</Label>
                          <Select onValueChange={(value) => setSelectedService(value)}>
                            <SelectTrigger className="input-industrial">
                              <SelectValue placeholder="Selecciona una categoría" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories?.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id.toString()}>
                                  <div className="flex items-center gap-2">
                                    <span>{cat.name}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Location */}
                        <div className="space-y-3">
                          <Label>Ubicación</Label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input 
                              placeholder="Ingresa tu ubicación o permite el acceso a tu ubicación" 
                              className="input-industrial pl-10"
                              value={location}
                              onChange={(e) => setLocation(e.target.value)}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            🎯 La geolocalización nos permite mostrarte profesionales cercanos
                          </p>
                        </div>

                        {/* Service Type */}
                        <div className="space-y-3">
                          <Label>Tipo de Servicio</Label>
                          <div className="grid sm:grid-cols-2 gap-3">
                            {[
                              { id: "technical", name: "Servicio Técnico", icon: "🔧" },
                              { id: "legal", name: "Asesoría Legal", icon: "⚖️" },
                              { id: "financial", name: "Consulta Financiera", icon: "💰" },
                              { id: "maintenance", name: "Mantenimiento", icon: "🏠" },
                            ].map((type) => (
                              <button
                                key={type.id}
                                onClick={() => setSelectedService(type.id)}
                                className={`
                                  p-4 rounded-lg border text-left transition-all
                                  ${selectedService === type.id 
                                    ? 'border-primary bg-primary/10 text-primary' 
                                    : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'}
                                `}
                              >
                                <span className="text-2xl mr-2">{type.icon}</span>
                                {type.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        <Button 
                          className="w-full" 
                          size="lg"
                          onClick={() => setStep(2)}
                          disabled={!selectedService}
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
                          Selecciona Profesional
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {providers.map((provider) => (
                            <button
                              key={provider.id}
                              onClick={() => setSelectedProvider(provider.id)}
                              className={`
                                w-full p-4 rounded-lg border text-left transition-all flex items-center justify-between
                                ${selectedProvider === provider.id 
                                  ? 'border-primary bg-primary/10' 
                                  : 'border-border hover:border-primary/50'}
                              `}
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                                  <User className="w-6 h-6 text-primary" />
                                </div>
                                <div>
                                  <p className="font-medium">{provider.name}</p>
                                  <p className="text-sm text-muted-foreground">{provider.profession}</p>
                                  <div className="flex items-center gap-1 mt-1">
                                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                    <span className="text-sm">{provider.rating}</span>
                                    <span className="text-xs text-muted-foreground">({provider.reviews} reseñas)</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-lg">${provider.price}</p>
                                <p className="text-xs text-muted-foreground">/hora</p>
                              </div>
                            </button>
                          ))}
                        </div>
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
                              className="rounded-lg border border-border"
                            />
                          </div>
                          <div>
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
                            onClick={() => setStep(1)}
                          >
                            <ChevronLeft className="mr-2 h-4 w-4" />
                            Atrás
                          </Button>
                          <Button 
                            className="flex-1"
                            onClick={() => setStep(3)}
                            disabled={!selectedProvider || !selectedDate}
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
                              <span className="text-muted-foreground">Servicio:</span>
                              <span>Consulta Técnica</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Profesional:</span>
                              <span>Ing. Carlos Mendoza</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Fecha:</span>
                              <span>{selectedDate?.toLocaleDateString('es-EC')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Hora:</span>
                              <span>10:00</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Ubicación:</span>
                              <span>{location || "Por determinar"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Notes */}
                        <div className="space-y-3">
                          <Label>Notas adicionales (opcional)</Label>
                          <Textarea 
                            placeholder="Describe detalles adicionales de tu requerimiento..." 
                            className="input-industrial"
                          />
                        </div>

                        {/* Contact Info */}
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Teléfono de contacto</Label>
                            <div className="relative">
                              <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="+593 99 123 4567" className="input-industrial pl-10" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Email de confirmación</Label>
                            <div className="relative">
                              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="tu@email.com" className="input-industrial pl-10" />
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <Button 
                            variant="outline"
                            onClick={() => setStep(2)}
                          >
                            <ChevronLeft className="mr-2 h-4 w-4" />
                            Atrás
                          </Button>
                          <Button 
                            className="flex-1 bg-accent hover:bg-accent/90"
                            onClick={handleBooking}
                          >
                            Confirmar Reserva
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
                        <h2 className="text-2xl font-display font-bold mb-2">¡Reserva Confirmada!</h2>
                        <p className="text-muted-foreground mb-6">
                          Tu reserva ha sido creada exitosamente. Recibirás una confirmación por email.
                        </p>
                        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 mb-6 inline-block">
                          <p className="text-sm">
                            <span className="text-muted-foreground">Código de Reserva:</span>
                            <span className="font-mono font-bold ml-2">GEN-2026-8472</span>
                          </p>
                        </div>
                        <div className="flex gap-3 justify-center">
                          <Button variant="outline" asChild>
                            <Link href="/dashboard">Ver mis Reservas</Link>
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
