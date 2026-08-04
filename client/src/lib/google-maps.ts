// Google Maps API utilities for Applia.
// This module provides geolocation, geocoding, and places search functionality

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  address: string;
  placeId: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating?: number;
  reviews?: number;
  photos?: string[];
  types?: string[];
  phone?: string;
  website?: string;
  openingHours?: string[];
}

export interface DistanceResult {
  distance: number; // in meters
  duration: number; // in seconds
}

// Geocode an address to coordinates
export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("Google Maps API key not configured");
    return null;
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    const data = await response.json();
    
    if (data.status === "OK" && data.results.length > 0) {
      const result = data.results[0];
      return {
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
        address: result.formatted_address,
        placeId: result.place_id,
      };
    }
    
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

// Reverse geocode coordinates to address
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("Google Maps API key not configured");
    return null;
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    const data = await response.json();
    
    if (data.status === "OK" && data.results.length > 0) {
      const result = data.results[0];
      return {
        latitude: lat,
        longitude: lng,
        address: result.formatted_address,
        placeId: result.place_id,
      };
    }
    
    return null;
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return null;
  }
}

// Search for nearby places
export async function searchNearbyPlaces(
  lat: number,
  lng: number,
  radius: number = 5000,
  type?: string
): Promise<PlaceDetails[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("Google Maps API key not configured");
    return [];
  }

  try {
    let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&key=${GOOGLE_MAPS_API_KEY}`;
    
    if (type) {
      url += `&type=${type}`;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === "OK") {
      return data.results.map((place: any) => ({
        placeId: place.place_id,
        name: place.name,
        address: place.vicinity || "",
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        rating: place.rating,
        photos: place.photos ? place.photos.map((p: any) => 
          `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photo_reference}&key=${GOOGLE_MAPS_API_KEY}`
        ) : [],
        types: place.types,
      }));
    }
    
    return [];
  } catch (error) {
    console.error("Places search error:", error);
    return [];
  }
}

// Get place details
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("Google Maps API key not configured");
    return null;
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,rating,reviews,photos,types,formatted_phone_number,website,opening_hours&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    const data = await response.json();
    
    if (data.status === "OK" && data.result) {
      const place = data.result;
      return {
        placeId: place.place_id,
        name: place.name,
        address: place.formatted_address,
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        rating: place.rating,
        reviews: place.user_ratings_total,
        photos: place.photos?.map((p: any) => 
          `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${p.photo_reference}&key=${GOOGLE_MAPS_API_KEY}`
        ),
        types: place.types,
        phone: place.formatted_phone_number,
        website: place.website,
        openingHours: place.opening_hours?.weekday_text,
      };
    }
    
    return null;
  } catch (error) {
    console.error("Place details error:", error);
    return null;
  }
}

// Calculate distance between two points
export async function calculateDistance(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<DistanceResult | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    // Fallback to Haversine formula
    const result = haversineDistance(originLat, originLng, destLat, destLng);
    return {
      distance: result,
      duration: Math.round(result / 1.2), // Assuming average walking speed 1.2 m/s
    };
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    const data = await response.json();
    
    if (data.status === "OK" && data.rows[0]?.elements[0]?.status === "OK") {
      const element = data.rows[0].elements[0];
      return {
        distance: element.distance.value,
        duration: element.duration.value,
      };
    }
    
    return null;
  } catch (error) {
    console.error("Distance calculation error:", error);
    return null;
  }
}

// Haversine formula for distance calculation (fallback)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Get user's current location
export function getCurrentLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

// Check if Google Maps is configured
export function isGoogleMapsConfigured(): boolean {
  return !!GOOGLE_MAPS_API_KEY;
}
