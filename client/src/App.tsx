import { Switch, Route, useLocation, Redirect } from "wouter";
import { FEATURE_WALLET_RECHARGE_UI_ENABLED } from "@shared/feature-flags";
import { AdminRechargeRoute } from "@/components/AdminRechargeRoute";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PushForegroundHandler } from "@/components/PushForegroundHandler";
import { PushPermissionReminder } from "@/components/PushPermissionReminder";
import { SocketProvider } from "@/hooks/use-socket";
import { ServiceBookingChatListener } from "@/components/chat/ServiceBookingChatListener";
import { ExploreCategoryProvider } from "@/contexts/ExploreCategoryContext";
import { RatingGate } from "@/components/RatingGate";

// Pages
import HomePage from "@/pages/Home";
import Explore from "@/pages/Explore";
import Categories from "@/pages/Categories";
import TaxiRide from "@/pages/TaxiRide";
import DriverGoGenfeb, { DriverGoGenfebWithGoChat } from "@/pages/DriverGoGenfeb";
import CargoDriverSettings from "@/pages/CargoDriverSettings";
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
import { ListingSubscriptionRibbon } from "@/components/ListingSubscriptionRibbon";
import { ProviderTermsGate } from "@/components/ProviderTermsGate";
import VerifyProfessional from "@/pages/VerifyProfessional";
import VerifyProfessionalPayment from "@/pages/VerifyProfessionalPayment";
import { GoShellLayout } from "@/components/go/GoShellLayout";
import { GoCategoryGate } from "@/components/go/GoCategoryGate";
import { GoActiveRideResume } from "@/components/go/GoActiveRideResume";
import GoShop from "@/pages/go/GoShop";
import GoPack from "@/pages/go/GoPack";
import PackRide from "@/pages/PackRide";
import DriverPackGenfeb from "@/pages/DriverPackGenfeb";
import PackDriverSettings from "@/pages/PackDriverSettings";

// Oculta pagos temporalmente (se configurará en el futuro).
const SHOW_PAYMENTS = false;

function MainRouter() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/explore" component={Explore} />
      <Route path="/categories" component={Categories} />
      <Route path="/taxi">{() => <TaxiRide />}</Route>
      {/* Rutas legacy (mantener por compatibilidad, pero el shell nuevo vive en /go/*). */}
      <Route path="/driver/go-genfeb" component={DriverGoGenfebWithGoChat} />
      <Route path="/driver/go-genfeb/configuracion" component={CargoDriverSettings} />
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
      {/* wouter: `component` recibe props de ruta; render inline evita mismatch de props */}
      <Route path="/payment-voucher">{() => <PaymentVoucher />}</Route>
      <Route path="/bookings" component={Bookings} />
      <Route path="/recharge">
        {() => (
          <AdminRechargeRoute>
            <Recharge />
          </AdminRechargeRoute>
        )}
      </Route>
      <Route path="/recharge/confirm">
        {() => (
          <AdminRechargeRoute>
            <RechargeConfirm />
          </AdminRechargeRoute>
        )}
      </Route>
      {FEATURE_WALLET_RECHARGE_UI_ENABLED ? (
        <Route path="/movimientos" component={Movimientos} />
      ) : (
        <Route path="/movimientos">{() => <Redirect to="/" />}</Route>
      )}
      <Route path="/settings" component={Settings} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/professional/verify" component={VerifyProfessional} />
      <Route path="/professional/verify/payment" component={VerifyProfessionalPayment} />
      <Route path="/politics" component={Politics} />
      <Route component={NotFound} />
    </Switch>
  );
}

function GoRouter() {
  const GoCargoClient = () => (
    <GoCategoryGate slug="transport">
      <TaxiRide />
    </GoCategoryGate>
  );
  const GoCargoDriver = () => (
    <GoCategoryGate slug="transport">
      <DriverGoGenfeb />
    </GoCategoryGate>
  );
  const GoCargoDriverSettings = () => (
    <GoCategoryGate slug="transport">
      <CargoDriverSettings />
    </GoCategoryGate>
  );
  const GoPackDriver = () => (
    <GoCategoryGate slug="delivery">
      <DriverPackGenfeb />
    </GoCategoryGate>
  );
  const GoPackDriverSettings = () => (
    <GoCategoryGate slug="delivery">
      <PackDriverSettings />
    </GoCategoryGate>
  );
  const GoShopRoute = () => (
    <GoCategoryGate slug="marketplace">
      <GoShop />
    </GoCategoryGate>
  );
  const GoPackRoute = () => (
    <GoCategoryGate slug="delivery">
      <PackRide />
    </GoCategoryGate>
  );
  return (
    <Switch>
      {/* Cliente (pedir servicio): mover flujo existente /taxi a esta sección */}
      <Route path="/go/cargo" component={GoCargoClient} />
      {/* Conductor (recibir viajes): panel de conducción */}
      <Route path="/go/cargo/driver" component={GoCargoDriver} />
      <Route path="/go/cargo/driver/settings" component={GoCargoDriverSettings} />
      <Route path="/go/shop" component={GoShopRoute} />
      <Route path="/go/pack" component={GoPackRoute} />
      <Route path="/go/pack/driver" component={GoPackDriver} />
      <Route path="/go/pack/driver/settings" component={GoPackDriverSettings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  const inGoShell = location === "/go" || location.startsWith("/go/");
  /** En /chat el input va fijo abajo; el footer global quedaría “entre” mensajes y barra — se oculta en esta ruta. */
  const showGlobalFooter =
    location.split("?")[0] !== "/chat";

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SocketProvider>
          <ExploreCategoryProvider>
            <ServiceBookingChatListener />
            <PushForegroundHandler />
            {/* Recordatorio global para activar push si están apagadas */}
            <div className="pointer-events-none fixed left-1/2 top-2 z-[80] w-[min(100%,28rem)] -translate-x-1/2 px-3">
              <PushPermissionReminder />
            </div>
            <GoActiveRideResume />
            <RatingGate />
            <ProviderTermsGate />
            {inGoShell ? (
              <GoShellLayout>
                <GoRouter />
              </GoShellLayout>
            ) : (
              <div className="flex min-h-screen flex-col bg-background font-sans">
                <Navigation />
                <ProfessionalVerificationBanner />
                <ListingSubscriptionRibbon />
                <main className="flex min-h-0 flex-1 flex-col">
                  <MainRouter />
                </main>
                {showGlobalFooter ? <Footer /> : null}
              </div>
            )}
            <Toaster />
          </ExploreCategoryProvider>
        </SocketProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
