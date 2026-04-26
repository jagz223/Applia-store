import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { loadGoDriverActiveRideId } from "@/lib/cargo-driver-storage";
import { loadGoRiderActiveRideId } from "@/lib/cargo-rider-storage";

/**
 * Reanuda Go (Car Go / Pack Go) al reabrir la app:
 * - Si hay servicio activo del conductor, lo lleva a `/go/cargo/driver` o `/go/pack/driver`
 * - Si hay servicio activo del cliente, lo lleva a `/go/cargo` o `/go/pack`
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
    if (packDriver && !path.startsWith("/go/pack/driver")) {
      setLocation("/go/pack/driver");
      return;
    }
    if (cargoDriver && !path.startsWith("/go/cargo/driver")) {
      setLocation("/go/cargo/driver");
      return;
    }

    const cargoRider = loadGoRiderActiveRideId("cargo");
    const packRider = loadGoRiderActiveRideId("pack");
    if (packRider && !path.startsWith("/go/pack")) {
      setLocation("/go/pack");
      return;
    }
    if (cargoRider && !path.startsWith("/go/cargo")) {
      setLocation("/go/cargo");
    }
  }, [isAuthenticated, isLoading, location, setLocation]);

  return null;
}

