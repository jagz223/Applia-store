import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { SocketProvider } from "@/hooks/use-socket";

// Pages
import HomePage from "@/pages/Home";
import Explore from "@/pages/Explore";
import ServiceDetails from "@/pages/ServiceDetails";
import Dashboard from "@/pages/Dashboard";
import BecomePro from "@/pages/BecomePro";
import CreateService from "@/pages/CreateService";
import Booking from "@/pages/Booking";
import Vault from "@/pages/Vault";
import Payments from "@/pages/Payments";
import Chat from "@/pages/Chat";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Admin from "@/pages/Admin";
import CreateRole from "@/pages/CreateRole";
import EditUser from "@/pages/EditUser";
import ProfessionalDashboard from "@/pages/ProfessionalDashboard";
import PaymentVoucher from "@/pages/PaymentVoucher";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/explore" component={Explore} />
      <Route path="/categories" component={Explore} />
      <Route path="/service/:id" component={ServiceDetails} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/become-pro" component={BecomePro} />
      <Route path="/create-service" component={CreateService} />
      <Route path="/booking" component={Booking} />
      <Route path="/vault" component={Vault} />
      <Route path="/payments" component={Payments} />
      <Route path="/chat" component={Chat} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/create-role" component={CreateRole} />
      <Route path="/admin/users/:id/edit" component={EditUser} />
      <Route path="/professional-dashboard" component={ProfessionalDashboard} />
      <Route path="/payment-voucher" component={PaymentVoucher} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SocketProvider>
          <div className="flex flex-col min-h-screen bg-background font-sans">
            <Navigation />
            <main className="flex-grow">
              <Router />
            </main>
            <Footer />
            <Toaster />
          </div>
        </SocketProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
