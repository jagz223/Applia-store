import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navigation } from "@/components/Navigation";
import { PushForegroundHandler } from "@/components/PushForegroundHandler";
import { TwaTouchGuard } from "@/components/TwaTouchGuard";
import { PushAutoRegister } from "@/components/PushAutoRegister";
import { PushPermissionReminder } from "@/components/PushPermissionReminder";
import { SocketProvider } from "@/hooks/use-socket";
import { AccountRecoveryGate } from "@/components/AccountRecoveryGate";

import HomePage from "@/pages/Home";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import Notifications from "@/pages/Notifications";
import AccountRecoverySetup from "@/pages/AccountRecoverySetup";
import ForgotPassword from "@/pages/ForgotPassword";
import StorePage from "@/pages/StorePage";
import StoreCreate from "@/pages/StoreCreate";
import StoreAdmin from "@/pages/StoreAdmin";
import StoreAdminOrderDelivery from "@/pages/StoreAdminOrderDelivery";
import StoreSubscriptionPayment from "@/pages/StoreSubscriptionPayment";
import MyStoreOrders from "@/pages/MyStoreOrders";
import StoreEntry from "@/pages/StoreEntry";

function MainRouter() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/register" component={Register} />
      <Route path="/account-recovery/setup" component={AccountRecoverySetup} />
      <Route path="/settings" component={Settings} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/tienda/crear" component={StoreCreate} />
      <Route path="/pedidos-tienda" component={MyStoreOrders} />
      <Route path="/tienda/:slug/pago" component={StoreSubscriptionPayment} />
      <Route path="/tienda/:slug/admin/ordenes/delivery/:orderId" component={StoreAdminOrderDelivery} />
      <Route path="/tienda/:slug/admin/:section?" component={StoreAdmin} />
      <Route path="/tienda" component={StoreEntry} />
      <Route path="/tienda/:slug" component={StorePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  const pathname = location.split("?")[0] ?? location;
  const isStoreVitrinaPage = /^\/tienda\/[^/]+$/.test(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SocketProvider>
          <PushForegroundHandler />
          <TwaTouchGuard />
          <PushAutoRegister />
          <div className="pointer-events-none fixed left-1/2 top-2 z-[80] w-[min(100%,28rem)] -translate-x-1/2 px-3">
            <PushPermissionReminder />
          </div>
          <AccountRecoveryGate />
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
          <Toaster />
        </SocketProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
