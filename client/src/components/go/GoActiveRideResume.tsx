import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { loadGoDriverActiveRideId } from "@/lib/cargo-driver-storage";
import { loadGoRiderActiveRideId } from "@/lib/cargo-rider-storage";

/**
 * Reanuda Go (Taxi / Delivery) al reabrir la app:
 * - Si hay servicio activo del conductor, lo lleva a `/go/taxi/driver` o `/go/delivery/driver`
 * - Si hay servicio activo del cliente, lo lleva a `/go/taxi` o `/go/delivery`
 */
export function GoActiveRideResume() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const path = location.split("?")[0];
    if (path.startsWith("/login") || path.startsWith("/register")) return;

    const cargoDriver = loadGoDriverActiveRideId("cargo");
    const packDriver = loadGoDriverActiveRideId("pack");
    if (packDriver && !path.startsWith("/go/delivery/driver")) {
      setLocation("/go/delivery/driver");
      return;
    }
    if (cargoDriver && !path.startsWith("/go/taxi/driver")) {
      setLocation("/go/taxi/driver");
      return;
    }

    const cargoRider = loadGoRiderActiveRideId("cargo");
    const packRider = loadGoRiderActiveRideId("pack");
    if (packRider && !path.startsWith("/go/delivery")) {
      setLocation("/go/delivery");
      return;
    }
    if (cargoRider && !path.startsWith("/go/taxi")) {
      setLocation("/go/taxi");
    }
  }, [isAuthenticated, isLoading, location, setLocation]);

  return null;
}

