import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Loader2 } from "lucide-react";
import { getTaxiRasterLayerProps } from "@/components/taxi/leaflet-config";
import { createDriverVehicleIcon } from "@/components/driver/cargo-map-markers";
import { LeafletMapLayoutFix } from "@/components/taxi/LeafletMapLayoutFix";
import { useDeferredLeafletMount } from "@/hooks/useDeferredLeafletMount";
import { useTheme } from "@/contexts/ThemeContext";
import type { CentralFleetDriver } from "@/hooks/use-central";

const DEFAULT_CENTER: [number, number] = [-0.22, -78.5];

function FitFleetBounds({ drivers }: { drivers: CentralFleetDriver[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = drivers.filter((d) => d.lat != null && d.lon != null) as Array<{
      lat: number;
      lon: number;
    }>;
    if (pts.length === 0) return;
    const bounds = L.latLngBounds(pts.map((p) => L.latLng(p.lat, p.lon)));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
  }, [drivers, map]);
  return null;
}

type CentralFleetMapProps = {
  drivers: CentralFleetDriver[];
  onSelectDriver: (driver: CentralFleetDriver) => void;
};

export function CentralFleetMap({ drivers, onSelectDriver }: CentralFleetMapProps) {
  const { theme } = useTheme();
  const raster = getTaxiRasterLayerProps(theme === "dark");
  const { shellRef, ready } = useDeferredLeafletMount({ minShellHeightPx: 64 });

  return (
    <div
      ref={shellRef}
      className="relative h-[420px] w-full overflow-hidden rounded-b-lg"
      style={{ width: "100%", minHeight: 420, height: 420 }}
    >
      {!ready ? (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : (
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={12}
          className="h-full w-full z-0"
          style={{ width: "100%", height: "100%", minHeight: 400 }}
          scrollWheelZoom
        >
          <LeafletMapLayoutFix />
          <TileLayer {...raster} />
          <FitFleetBounds drivers={drivers} />
          {drivers.map((d) => (
            <Marker
              key={d.userId}
              position={[d.lat!, d.lon!]}
              icon={createDriverVehicleIcon(d.vehicleType)}
              eventHandlers={{ click: () => onSelectDriver(d) }}
            >
              <Popup>
                {d.name} {d.lastName}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}
