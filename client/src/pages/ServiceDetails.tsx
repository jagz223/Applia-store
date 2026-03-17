import { useRoute, Link, useLocation } from "wouter";
import { useService, useCreateBooking, useCurrentProvider, useBookings } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Star, ShieldCheck, Calendar, Clock, ArrowLeft, MessageSquare, Pencil } from "lucide-react";
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

export default function ServiceDetails() {
  const [, params] = useRoute("/service/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  const { data: service, isLoading } = useService(id);
  const { user, isAuthenticated } = useAuth();
  const { data: myProviderProfile } = useCurrentProvider();
  const { data: myBookings } = useBookings();
  
  const createBooking = useCreateBooking();
  const { notifyNewBooking } = useSocketBookings();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [notes, setNotes] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

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
    
    createBooking.mutate(
      {
        userId: user.id,
        serviceId: id,
        date: date.toISOString(),
        notes: notes,
      },
      {
        onSuccess: (data) => {
          const providerId = (service as { providerId?: number; provider?: { id: number } }).providerId ?? service?.provider?.id;
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
        <h1 className="text-2xl font-bold">Service not found</h1>
        <Link href="/explore">
          <Button variant="link">Back to Explore</Button>
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
      <Link href="/explore" className="inline-flex items-center text-muted-foreground hover:text-primary mb-6 transition-colors">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Services
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: Service Info */}
        <div className="lg:col-span-2 space-y-8">
          <div className="rounded-3xl overflow-hidden shadow-xl">
             {/* Unsplash placeholder image */}
            <img 
              src={service.imageUrl || "https://images.unsplash.com/photo-1581092921461-eab62e97a783?w=1000&h=600&fit=crop"} 
              alt={service.title} 
              className="w-full h-auto object-cover max-h-[500px]"
            />
          </div>
          
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20">{getCategoryDisplayName(service.category)}</Badge>
              <div className="flex items-center text-amber-500 font-bold text-sm">
                <Star className="h-4 w-4 fill-current mr-1" />
                {Number(service.provider.rating).toFixed(1)} ({service.provider.reviewCount} reviews)
              </div>
            </div>
            
            <h1 className="text-4xl font-display font-bold mb-4">{service.title}</h1>
            
            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>{service.description}</p>
            </div>
          </div>

          <div className="border-t border-border/50 pt-8">
            <h3 className="text-xl font-bold font-display mb-6">About the Provider</h3>
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-bold text-2xl">
                {service.provider?.user?.firstName?.[0] ?? service.provider?.user?.lastName?.[0] ?? "P"}
              </div>
              <div>
                <h4 className="font-bold text-lg">{service.provider?.user?.firstName ?? ""} {service.provider?.user?.lastName ?? ""}</h4>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <span>{service.provider.profession}</span>
                  <span>•</span>
                  <span>{service.provider.yearsExperience} years exp</span>
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
                  <ShieldCheck className="h-3 w-3" /> Verified
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs font-bold text-foreground">Response Time</p>
                  <p className="text-xs text-muted-foreground">Usually responds in 1 hour</p>
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
                      Book Now
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Book Service</DialogTitle>
                      <DialogDescription>
                        Select a date to request this service from {service.provider?.user?.firstName ?? "el profesional"}.
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
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Notes for provider</label>
                        <Textarea 
                          placeholder="Describe your needs..." 
                          value={notes} 
                          onChange={(e) => setNotes(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleBooking} disabled={createBooking.isPending}>
                        {createBooking.isPending ? "Booking..." : "Confirm Booking"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
               )
            ) : (
              <a href={api.auth.replit.login.path}>
                <Button className="w-full h-12 text-lg" variant="outline">
                  Log in to Book
                </Button>
              </a>
            )}
            
            <p className="text-xs text-center text-muted-foreground">
              You won't be charged yet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
