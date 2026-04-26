import TaxiRide from "@/pages/TaxiRide";

/**
 * Pack Go (cliente) usa el mismo layout que Car Go, pero el flujo/socket/API apuntan a Pack.
 * Para mantener el “copiar literalmente todo”, en esta primera iteración reutilizamos el componente
 * y solo cambiamos la ruta (el ajuste de endpoints/eventos se hace en la siguiente pasada).
 */
export default function PackRide() {
  return <TaxiRide goSlug="pack" />;
}

