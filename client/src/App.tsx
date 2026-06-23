import { lazy, Suspense } from "react";
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
import { TwaTouchGuard } from "@/components/TwaTouchGuard";
import { PushAutoRegister } from "@/components/PushAutoRegister";
import { AndroidGeolocationBootstrap } from "@/components/AndroidGeolocationBootstrap";
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
import BecomeDriver from "@/pages/BecomeDriver";
import CentralDashboard from "@/pages/CentralDashboard";
import CentralSetup from "@/pages/CentralSetup";
import CreateService from "@/pages/CreateService";
import MyServices from "@/pages/MyServices";
import EditService from "@/pages/EditService";
import Booking from "@/pages/Booking";
import Vault from "@/pages/Vault";
import Payments from "@/pages/Payments";
import Chat from "@/pages/Chat";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import CreateRole from "@/pages/CreateRole";
import EditUser from "@/pages/EditUser";
import AdminCreateUser from "@/pages/AdminCreateUser";
import AdminProviderDetailPage from "@/pages/AdminProviderDetailPage";
import { AccessGateLoading } from "@/components/AccessGateLoading";

const Admin = lazy(() => import("@/pages/Admin"));
import ProfessionalDashboard from "@/pages/ProfessionalDashboard";
import PaymentVoucher from "@/pages/PaymentVoucher";
import Bookings from "@/pages/Bookings";
import Promociones from "@/pages/Promociones";
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
import { AccountRecoveryGate } from "@/components/AccountRecoveryGate";
import AccountRecoverySetup from "@/pages/AccountRecoverySetup";
import ForgotPassword from "@/pages/ForgotPassword";
import VerifyProfessional from "@/pages/VerifyProfessional";
import VerifyProfessionalPayment from "@/pages/VerifyProfessionalPayment";
import StorePage from "@/pages/StorePage";
import StoreCreate from "@/pages/StoreCreate";
import StoreSubscriptionPayment from "@/pages/StoreSubscriptionPayment";
import StoreAdmin from "@/pages/StoreAdmin";
import StoreAdminOrderDelivery from "@/pages/StoreAdminOrderDelivery";
import StoresCatalog from "@/pages/StoresCatalog";
import MyStoreOrders from "@/pages/MyStoreOrders";
import { GoShellLayout } from "@/components/go/GoShellLayout";
import { useGoCompactViewport } from "@/lib/go-viewport-layout";
import { GoCategoryGate } from "@/components/go/GoCategoryGate";
import { GoActiveRideResume } from "@/components/go/GoActiveRideResume";
import Marketplace from "@/pages/Marketplace";
import GoPack from "@/pages/go/GoPack";
import PackRide from "@/pages/PackRide";

// Oculta pagos temporalmente (se configurará en el futuro).
const SHOW_PAYMENTS = false;

function MainRouter() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/explore" component={Explore} />
      <Route path="/categories" component={Categories} />
      <Route path="/marketplace">
        {() => (
          <GoCategoryGate slug="marketplace">
            <Marketplace />
          </GoCategoryGate>
        )}
      </Route>
      <Route path="/go/shop">{() => <Redirect to="/marketplace" />}</Route>
      <Route path="/taxi">{() => <TaxiRide />}</Route>
      {/* Rutas legacy (mantener por compatibilidad, pero el shell nuevo vive en /go/*). */}
      <Route path="/driver/go-genfeb" component={DriverGoGenfebWithGoChat} />
      <Route path="/driver/go-genfeb/configuracion" component={CargoDriverSettings} />
      <Route path="/service/:id" component={ServiceDetails} />
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/register" component={Register} />
      <Route path="/account-recovery/setup" component={AccountRecoverySetup} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/become-pro" component={BecomePro} />
      <Route path="/become-driver" component={BecomeDriver} />
      <Route path="/central/setup" component={CentralSetup} />
      <Route path="/central" component={CentralDashboard} />
      <Route path="/create-service" component={CreateService} />
      <Route path="/my-services" component={MyServices} />
      <Route path="/edit-service/:id" component={EditService} />
      <Route path="/booking" component={Booking} />
      <Route path="/vault" component={Vault} />
      {SHOW_PAYMENTS && <Route path="/payments" component={Payments} />}
      <Route path="/chat" component={Chat} />
      <Route path="/admin/users/create" component={AdminCreateUser} />
      <Route path="/admin/users/:id/edit" component={EditUser} />
      <Route path="/admin/create-role" component={CreateRole} />
      <Route path="/admin/providers/:providerId" component={AdminProviderDetailPage} />
      <Route path="/admin">
        {() => (
          <Suspense fallback={<AccessGateLoading message="Cargando panel de administración…" />}>
            <Admin />
          </Suspense>
        )}
      </Route>
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
      <Route path="/promociones" component={Promociones} />
      <Route path="/professional/verify" component={VerifyProfessional} />
      <Route path="/professional/verify/payment" component={VerifyProfessionalPayment} />
      <Route path="/tienda/crear" component={StoreCreate} />
      <Route path="/tiendas" component={StoresCatalog} />
      <Route path="/pedidos-tienda" component={MyStoreOrders} />
      <Route path="/tienda/:slug/pago" component={StoreSubscriptionPayment} />
      <Route path="/tienda/:slug/admin/ordenes/delivery/:orderId" component={StoreAdminOrderDelivery} />
      <Route path="/tienda/:slug/admin/:section?" component={StoreAdmin} />
      <Route path="/tienda/:slug" component={StorePage} />
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
  const GoUnifiedDriver = () => <DriverGoGenfeb />;
  const GoUnifiedDriverSettings = () => <CargoDriverSettings />;
  const GoCargoDriver = () => <Redirect to="/go/driver" />;
  const GoCargoDriverSettings = () => <Redirect to="/go/driver/settings" />;
  const GoPackDriver = () => <Redirect to="/go/driver" />;
  const GoPackDriverSettings = () => <Redirect to="/go/driver/settings" />;
  const GoPackRoute = () => (
    <GoCategoryGate slug="delivery">
      <PackRide />
    </GoCategoryGate>
  );
  return (
    <Switch>
      {/* Canonical (rebrand) */}
      {/* Cliente (pedir servicio) */}
      <Route path="/go/taxi" component={GoCargoClient} />
      {/* Conductor unificado (taxi o delivery, una URL) */}
      <Route path="/go/driver" component={GoUnifiedDriver} />
      <Route path="/go/driver/settings" component={GoUnifiedDriverSettings} />
      {/* Legacy conductor */}
      <Route path="/go/taxi/driver" component={GoCargoDriver} />
      <Route path="/go/taxi/driver/settings" component={GoCargoDriverSettings} />

      {/* Legacy (compat): mantener por links/vistas ya configuradas */}
      <Route path="/go/cargo">{() => <Redirect to="/go/taxi" />}</Route>
      <Route path="/go/cargo/driver">{() => <Redirect to="/go/driver" />}</Route>
      <Route path="/go/cargo/driver/settings">{() => <Redirect to="/go/driver/settings" />}</Route>

      {/* Delivery canonical */}
      <Route path="/go/delivery" component={GoPackRoute} />
      <Route path="/go/delivery/driver" component={GoPackDriver} />
      <Route path="/go/delivery/driver/settings" component={GoPackDriverSettings} />

      {/* Legacy (compat) */}
      <Route path="/go/pack">{() => <Redirect to="/go/delivery" />}</Route>
      <Route path="/go/pack/driver">{() => <Redirect to="/go/driver" />}</Route>
      <Route path="/go/pack/driver/settings">{() => <Redirect to="/go/driver/settings" />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  const pathnameForShell = location.split("?")[0] ?? location;
  const inGoShell =
    (pathnameForShell === "/go" || pathnameForShell.startsWith("/go/")) &&
    pathnameForShell !== "/go/shop" &&
    !pathnameForShell.startsWith("/go/shop/");
  const pathname = location.split("?")[0] ?? location;
  const inCentralPanel = pathname === "/central" || pathname.startsWith("/central/");
  const compactViewport = useGoCompactViewport();
  /** Móvil en /central: mapa a pantalla completa con barra propia (sin nav/footer global). */
  const centralMobileShell = inCentralPanel && compactViewport;
  /** Vitrina de tienda (/tienda/:slug): layout con carrito lateral, sin footer global. */
  const isStoreVitrinaPage = /^\/tienda\/[^/]+$/.test(pathname);
  /** En /chat el input va fijo abajo; el footer global quedaría “entre” mensajes y barra — se oculta en esta ruta. */
  const showGlobalFooter =
    pathname !== "/chat" &&
    pathname !== "/pedidos-tienda" &&
    !centralMobileShell &&
    !isStoreVitrinaPage;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SocketProvider>
          <ExploreCategoryProvider>
            <ServiceBookingChatListener />
            <PushForegroundHandler />
            <TwaTouchGuard />
            <PushAutoRegister />
            <AndroidGeolocationBootstrap />
            {/* Recordatorio global para activar push si están apagadas */}
            <div className="pointer-events-none fixed left-1/2 top-2 z-[80] w-[min(100%,28rem)] -translate-x-1/2 px-3">
              <PushPermissionReminder />
            </div>
            <GoActiveRideResume />
            <RatingGate />
            <AccountRecoveryGate />
            <ProviderTermsGate />
            {inGoShell ? (
              <GoShellLayout>
                <GoRouter />
              </GoShellLayout>
            ) : centralMobileShell ? (
              <main className="relative min-h-0 flex-1 bg-background">
                <MainRouter />
              </main>
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
