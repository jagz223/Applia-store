export type StoreGpsCoordinates = {
  latitude: number;
  longitude: number;
};

export function formatStoreGpsLabel(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function getBrowserGeolocationPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Tu navegador no soporta geolocalización."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 25_000,
      maximumAge: 0,
    });
  });
}

function geolocationErrorMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    return "Permiso de ubicación denegado. Actívalo en tu navegador o dispositivo.";
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return "No se pudo obtener tu ubicación. Intenta de nuevo.";
  }
  if (err.code === err.TIMEOUT) {
    return "La ubicación tardó demasiado. Intenta de nuevo.";
  }
  return "No se pudo obtener tu ubicación.";
}

/** Solo GPS del navegador — sin llamadas a Geoapify ni otros servicios de mapas. */
export async function detectStoreGpsCoordinates(): Promise<StoreGpsCoordinates> {
  try {
    const pos = await getBrowserGeolocationPosition();
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };
  } catch (e) {
    if (e instanceof GeolocationPositionError) {
      throw new Error(geolocationErrorMessage(e));
    }
    throw e;
  }
}
