import { useAuth } from "@/hooks/use-auth";
import { useBookings, useCurrentProvider, useUpdateBookingStatus } from "@/hooks/use-mango-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Dashboard() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: bookings, isLoading: bookingsLoading } = useBookings();
  const { data: providerProfile } = useCurrentProvider();
  const updateStatus = useUpdateBookingStatus();

  if (authLoading || bookingsLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  if (!isAuthenticated) {
    return <div className="text-center py-20">Please log in to view your dashboard.</div>;
  }

  // Filter bookings
  const myRequests = bookings?.filter(b => b.userId === user?.id) || [];
  const incomingJobs = bookings?.filter(b => b.service?.providerId === providerProfile?.id) || [];

  const StatusBadge = ({ status }: { status: string }) => {
    const styles = {
      pending: "bg-yellow-100 text-yellow-800",
      confirmed: "bg-blue-100 text-blue-800",
      completed: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${styles[status as keyof typeof styles] || "bg-gray-100"}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user?.firstName}!</p>
        </div>
        {providerProfile && (
           <Link href="/create-service">
             <Button className="bg-secondary hover:bg-secondary/90 text-white">
               + Create New Service
             </Button>
           </Link>
        )}
      </div>

      <Tabs defaultValue="requests" className="w-full">
        <TabsList className="mb-6 bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="requests" className="rounded-lg">My Requests</TabsTrigger>
          {providerProfile && (
            <TabsTrigger value="jobs" className="rounded-lg">Incoming Jobs</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="requests">
          <div className="grid gap-4">
            {myRequests.length === 0 ? (
              <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed">
                <p className="text-muted-foreground mb-4">You haven't booked any services yet.</p>
                <Link href="/explore"><Button>Find a Service</Button></Link>
              </div>
            ) : (
              myRequests.map((booking) => (
                <Card key={booking.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <div className="flex flex-col md:flex-row">
                     {/* Image */}
                    <div className="w-full md:w-48 h-32 bg-muted">
                      <img 
                        src={booking.service?.imageUrl || "https://placehold.co/400x300"} 
                        className="w-full h-full object-cover" 
                        alt={booking.service?.title}
                      />
                    </div>
                    {/* Content */}
                    <div className="flex-1 p-6 flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                           <h3 className="font-bold text-lg">{booking.service?.title}</h3>
                           <p className="text-sm text-muted-foreground">Provider: {booking.service?.provider?.user?.firstName}</p>
                        </div>
                        <StatusBadge status={booking.status} />
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(booking.date), "PPP")}
                        </div>
                         <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {format(new Date(booking.date), "p")}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {providerProfile && (
          <TabsContent value="jobs">
            <div className="grid gap-4">
              {incomingJobs.length === 0 ? (
                <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed">
                  <p className="text-muted-foreground">No incoming jobs yet.</p>
                </div>
              ) : (
                incomingJobs.map((booking) => (
                  <Card key={booking.id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle>{booking.service?.title}</CardTitle>
                          <CardDescription>Requested by {booking.user?.firstName} {booking.user?.lastName}</CardDescription>
                        </div>
                        <StatusBadge status={booking.status} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                        <div className="space-y-2">
                           <div className="flex items-center gap-2 text-sm">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{format(new Date(booking.date), "PPP p")}</span>
                           </div>
                           {booking.notes && (
                             <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded-lg">
                               Note: "{booking.notes}"
                             </p>
                           )}
                        </div>
                        
                        {booking.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => updateStatus.mutate({ id: booking.id, status: 'cancelled' })}
                              disabled={updateStatus.isPending}
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Reject
                            </Button>
                            <Button 
                              size="sm" 
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => updateStatus.mutate({ id: booking.id, status: 'confirmed' })}
                              disabled={updateStatus.isPending}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Accept
                            </Button>
                          </div>
                        )}
                         {booking.status === 'confirmed' && (
                          <Button 
                            size="sm" 
                            className="bg-primary hover:bg-primary/90"
                            onClick={() => updateStatus.mutate({ id: booking.id, status: 'completed' })}
                            disabled={updateStatus.isPending}
                          >
                            Mark Complete
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
