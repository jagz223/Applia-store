import { Switch, Route, useLocation, Redirect } from "wouter";
import { FEATURE_WALLET_RECHARGE_UI_ENABLED } from "@shared/feature-flags";
import { AdminRechargeRoute } from "@/components/AdminRechargeRoute";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navigation } from "@/components/Navigation";
import { PushForegroundHandler } from "@/components/PushForegroundHandler";
import { TwaTouchGuard } from "@/components/TwaTouchGuard";
import { PushAutoRegister } from "@/components/PushAutoRegister";
import { AndroidGeolocationBootstrap } from "@/components/AndroidGeolocationBootstrap";
import { PushPermissionReminder } from "@/components/PushPermissionReminder";
import { SocketProvider } from "@/hooks/use-socket";
import { ServiceBookingChatListener } from "@/components/chat/ServiceBookingChatListener";
import { ExploreCategoryProvider } from "@/contexts/ExploreCategoryContext";
import { RatingGate } from "@/components/RatingGate";

import HomePage from "@/pages/Home";
import TaxiRide from "@/pages/TaxiRide";
import DriverGoApplia, { DriverGoAppliaWithGoChat } from "@/pages/DriverGoApplia";
import CargoDriverSettings from "@/pages/CargoDriverSettings";
import Dashboard from "@/pages/Dashboard";
import BecomeDriver from "@/pages/BecomeDriver";
import Chat from "@/pages/Chat";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import PaymentVoucher from "@/pages/PaymentVoucher";
import Recharge from "@/pages/Recharge";
import RechargeConfirm from "@/pages/RechargeConfirm";
import Movimientos from "@/pages/Movimientos";
import Settings from "@/pages/Settings";
import Politics from "@/pages/Politics";
import NotFound from "@/pages/not-found";
import Notifications from "@/pages/Notifications";
import { AccountRecoveryGate } from "@/components/AccountRecoveryGate";
import AccountRecoverySetup from "@/pages/AccountRecoverySetup";
import ForgotPassword from "@/pages/ForgotPassword";
import StorePage from "@/pages/StorePage";
import StoreCreate from "@/pages/StoreCreate";
import StoreAdmin from "@/pages/StoreAdmin";
import StoreAdminOrderDelivery from "@/pages/StoreAdminOrderDelivery";
import MyStoreOrders from "@/pages/MyStoreOrders";
import StoreEntry from "@/pages/StoreEntry";
import { GoShellLayout } from "@/components/go/GoShellLayout";
import { GoCategoryGate } from "@/components/go/GoCategoryGate";
import { GoActiveRideResume } from "@/components/go/GoActiveRideResume";
import PackRide from "@/pages/PackRide";

function MainRouter() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      {/* Servicios / asociados: ocultos — redirigen a inicio */}
      <Route path="/explore">{() => <Redirect to="/" />}</Route>
      <Route path="/categories">{() => <Redirect to="/" />}</Route>
      <Route path="/marketplace">{() => <Redirect to="/" />}</Route>
      <Route path="/go/shop">{() => <Redirect to="/" />}</Route>
      <Route path="/service/:id">{() => <Redirect to="/" />}</Route>
      <Route path="/become-pro">{() => <Redirect to="/" />}</Route>
      <Route path="/create-service">{() => <Redirect to="/" />}</Route>
      <Route path="/my-services">{() => <Redirect to="/" />}</Route>
      <Route path="/edit-service/:id">{() => <Redirect to="/" />}</Route>
      <Route path="/booking">{() => <Redirect to="/" />}</Route>
      <Route path="/bookings">{() => <Redirect to="/" />}</Route>
      <Route path="/vault">{() => <Redirect to="/" />}</Route>
      <Route path="/professional-dashboard">{() => <Redirect to="/" />}</Route>
      <Route path="/promociones">{() => <Redirect to="/" />}</Route>
      <Route path="/professional/verify">{() => <Redirect to="/" />}</Route>
      <Route path="/professional/verify/payment">{() => <Redirect to="/" />}</Route>
      <Route path="/tiendas">{() => <Redirect to="/tienda" />}</Route>
      <Route path="/central/setup">{() => <Redirect to="/" />}</Route>
      <Route path="/central">{() => <Redirect to="/" />}</Route>

      <Route path="/taxi">{() => <TaxiRide />}</Route>
      <Route path="/driver/go-applia" component={DriverGoAppliaWithGoChat} />
      <Route path="/driver/go-applia/configuracion" component={CargoDriverSettings} />
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/register" component={Register} />
      <Route path="/account-recovery/setup" component={AccountRecoverySetup} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/become-driver" component={BecomeDriver} />
      <Route path="/chat" component={Chat} />
      <Route path="/admin/users/create">{() => <Redirect to="/" />}</Route>
      <Route path="/admin/users/:id/edit">{() => <Redirect to="/" />}</Route>
      <Route path="/admin/create-role">{() => <Redirect to="/" />}</Route>
      <Route path="/admin/providers/:providerId">{() => <Redirect to="/" />}</Route>
      <Route path="/admin">{() => <Redirect to="/" />}</Route>
      <Route path="/payment-voucher">{() => <PaymentVoucher />}</Route>
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
      <Route path="/tienda/crear" component={StoreCreate} />
      <Route path="/pedidos-tienda" component={MyStoreOrders} />
      <Route path="/tienda/:slug/pago">
        {(params) => <Redirect to={`/tienda/${encodeURIComponent(params.slug ?? "")}/admin`} />}
      </Route>
      <Route path="/tienda/:slug/admin/ordenes/delivery/:orderId" component={StoreAdminOrderDelivery} />
      <Route path="/tienda/:slug/admin/:section?" component={StoreAdmin} />
      <Route path="/tienda" component={StoreEntry} />
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
  const GoUnifiedDriver = () => <DriverGoApplia />;
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
      <Route path="/go/taxi" component={GoCargoClient} />
      <Route path="/go/driver" component={GoUnifiedDriver} />
      <Route path="/go/driver/settings" component={GoUnifiedDriverSettings} />
      <Route path="/go/taxi/driver" component={GoCargoDriver} />
      <Route path="/go/taxi/driver/settings" component={GoCargoDriverSettings} />
      <Route path="/go/cargo">{() => <Redirect to="/go/taxi" />}</Route>
      <Route path="/go/cargo/driver">{() => <Redirect to="/go/driver" />}</Route>
      <Route path="/go/cargo/driver/settings">{() => <Redirect to="/go/driver/settings" />}</Route>
      <Route path="/go/delivery" component={GoPackRoute} />
      <Route path="/go/delivery/driver" component={GoPackDriver} />
      <Route path="/go/delivery/driver/settings" component={GoPackDriverSettings} />
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
  const isStoreVitrinaPage = /^\/tienda\/[^/]+$/.test(pathname);

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
            <div className="pointer-events-none fixed left-1/2 top-2 z-[80] w-[min(100%,28rem)] -translate-x-1/2 px-3">
              <PushPermissionReminder />
            </div>
            <GoActiveRideResume />
            <RatingGate />
            <AccountRecoveryGate />
            {inGoShell ? (
              <GoShellLayout>
                <GoRouter />
              </GoShellLayout>
            ) : (
              <div
                className={
                  isStoreVitrinaPage
                    ? "flex h-dvh max-h-dvh flex-col overflow-hidden bg-background font-sans"
                    : "flex min-h-screen flex-col bg-background font-sans"
                }
              >
                <Navigation />
                <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <MainRouter />
                </main>
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
