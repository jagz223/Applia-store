import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { loadDriverActiveRideId } from "@/lib/cargo-driver-storage";
import { loadRiderActiveRideId } from "@/lib/cargo-rider-storage";

/**
 * Si hay un viaje Car Go activo guardado en localStorage, lleva al usuario a la pantalla correcta
 * al iniciar sesión o al cargar cualquier ruta (p. ej. abrió la app en Inicio).
 */
export function CargoActiveRideResume() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const path = location.split("?")[0];
    if (path.startsWith("/login") || path.startsWith("/register")) return;

    const driverRide = loadDriverActiveRideId();
    if (driverRide && !path.startsWith("/go/cargo/driver")) {
      setLocation("/go/cargo/driver");
      return;
    }

    const riderRide = loadRiderActiveRideId();
    if (riderRide && path !== "/go/cargo") {
      setLocation("/go/cargo");
    }
  }, [isAuthenticated, isLoading, location, setLocation]);

  return null;
}
