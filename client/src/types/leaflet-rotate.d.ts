import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    rotate?: boolean;
    bearing?: number;
    touchRotate?: boolean;
    shiftKeyRotate?: boolean;
    rotateControl?: boolean | Record<string, unknown>;
  }

  interface Map {
    setBearing(theta: number): this;
    getBearing(): number;
  }
}
