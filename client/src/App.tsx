import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PushForegroundHandler } from "@/components/PushForegroundHandler";
import { SocketProvider } from "@/hooks/use-socket";
import { ExploreCategoryProvider } from "@/contexts/ExploreCategoryContext";
import { RatingGate } from "@/components/RatingGate";

// Pages
import HomePage from "@/pages/Home";
import Explore from "@/pages/Explore";
import Categories from "@/pages/Categories";
import ServiceDetails from "@/pages/ServiceDetails";
import Dashboard from "@/pages/Dashboard";
import BecomePro from "@/pages/BecomePro";
import CreateService from "@/pages/CreateService";
import EditService from "@/pages/EditService";
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
import Bookings from "@/pages/Bookings";
import Recharge from "@/pages/Recharge";
import RechargeConfirm from "@/pages/RechargeConfirm";
import Movimientos from "@/pages/Movimientos";
import Settings from "@/pages/Settings";
import Politics from "@/pages/Politics";
import NotFound from "@/pages/not-found";
import Notifications from "@/pages/Notifications";
import { ProfessionalVerificationBanner } from "@/components/ProfessionalVerificationBanner";
import { ProviderTermsGate } from "@/components/ProviderTermsGate";
import VerifyProfessional from "@/pages/VerifyProfessional";
import VerifyProfessionalPayment from "@/pages/VerifyProfessionalPayment";

// Oculta pagos temporalmente (se configurará en el futuro).
const SHOW_PAYMENTS = false;

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/explore" component={Explore} />
      <Route path="/categories" component={Categories} />
      <Route path="/service/:id" component={ServiceDetails} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/become-pro" component={BecomePro} />
      <Route path="/create-service" component={CreateService} />
      <Route path="/edit-service/:id" component={EditService} />
      <Route path="/booking" component={Booking} />
      <Route path="/vault" component={Vault} />
      {SHOW_PAYMENTS && <Route path="/payments" component={Payments} />}
      <Route path="/chat" component={Chat} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/create-role" component={CreateRole} />
      <Route path="/admin/users/:id/edit" component={EditUser} />
      <Route path="/professional-dashboard" component={ProfessionalDashboard} />
      <Route path="/payment-voucher" component={PaymentVoucher} />
      <Route path="/bookings" component={Bookings} />
      <Route path="/recharge" component={Recharge} />
      <Route path="/recharge/confirm" component={RechargeConfirm} />
      <Route path="/movimientos" component={Movimientos} />
      <Route path="/settings" component={Settings} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/professional/verify" component={VerifyProfessional} />
      <Route path="/professional/verify/payment" component={VerifyProfessionalPayment} />
      <Route path="/politics" component={Politics} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SocketProvider>
          <ExploreCategoryProvider>
            <PushForegroundHandler />
            <RatingGate />
            <ProviderTermsGate />
            <div className="flex flex-col min-h-screen bg-background font-sans">
              <Navigation />
              <ProfessionalVerificationBanner />
              <main className="flex-grow">
                <Router />
              </main>
            <Footer />
            <Toaster />
          </div>
          </ExploreCategoryProvider>
        </SocketProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
