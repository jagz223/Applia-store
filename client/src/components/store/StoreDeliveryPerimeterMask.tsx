import { Polygon } from "react-leaflet";

export type PerimeterLatLon = { lat: number; lon: number };

/** Anillo exterior mundial + agujero = zona cubierta (Leaflet Polygon con hole). */
export function deliveryPerimeterOutsideMaskPositions(
  ring: PerimeterLatLon[],
): [number, number][][] {
  const outer: [number, number][] = [
    [90, -180],
    [90, 180],
    [-90, 180],
    [-90, -180],
  ];
  const hole = ring.map((p) => [p.lat, p.lon] as [number, number]);
  return [outer, hole];
}

type StoreDeliveryPerimeterMaskProps = {
  points: PerimeterLatLon[];
  /** Color del borde del perímetro (zona clara). */
  strokeColor?: string;
};

/**
 * Oscurece lo que queda fuera del polígono; el interior se ve sin tinte.
 */
export function StoreDeliveryPerimeterMask({
  points,
  strokeColor = "hsl(var(--secondary))",
}: StoreDeliveryPerimeterMaskProps) {
  if (points.length < 3) return null;
  const ring = points.map((p) => [p.lat, p.lon] as [number, number]);
  return (
    <>
      <Polygon
        positions={deliveryPerimeterOutsideMaskPositions(points)}
        pathOptions={{
          stroke: false,
          fillColor: "#0a0a0a",
          fillOpacity: 0.48,
        }}
        interactive={false}
      />
      <Polygon
        positions={ring}
        pathOptions={{
          color: strokeColor,
          weight: 2,
          fillOpacity: 0,
        }}
        interactive={false}
      />
    </>
  );
}
