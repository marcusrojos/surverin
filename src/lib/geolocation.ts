/**
 * Geolocation utilities for distance calculation and position tracking
 */

// Haversine formula to calculate distance between two GPS coordinates in meters
export function calculateDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
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

export const GEOFENCE_RADIUS = 10; // meters

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export function isWithinRadius(
  driverPos: GeoPosition,
  pharmacyPos: GeoPosition,
  radiusMeters: number = GEOFENCE_RADIUS
): boolean {
  const distance = calculateDistance(
    driverPos.latitude, driverPos.longitude,
    pharmacyPos.latitude, pharmacyPos.longitude
  );
  return distance <= radiusMeters;
}

export function getCurrentPosition(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('La géolocalisation n\'est pas supportée par votre navigateur'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('Accès à la localisation refusé. Veuillez autoriser l\'accès dans les paramètres.'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error('Position indisponible. Vérifiez que le GPS est activé.'));
            break;
          case error.TIMEOUT:
            reject(new Error('Délai dépassé pour obtenir la position.'));
            break;
          default:
            reject(new Error('Erreur de géolocalisation inconnue.'));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export function watchPosition(
  onUpdate: (pos: GeoPosition) => void,
  onError: (error: string) => void
): number | null {
  if (!navigator.geolocation) {
    onError('La géolocalisation n\'est pas supportée');
    return null;
  }
  return navigator.geolocation.watchPosition(
    (position) => {
      onUpdate({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
    },
    (error) => {
      switch (error.code) {
        case error.PERMISSION_DENIED:
          onError('Accès à la localisation refusé');
          break;
        case error.POSITION_UNAVAILABLE:
          onError('GPS indisponible');
          break;
        default:
          onError('Erreur GPS');
      }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
}
