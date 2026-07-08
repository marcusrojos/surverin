/**
 * Geolocation utilities for distance calculation and position tracking
 */
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const isNative = () => Capacitor.isNativePlatform();

/**
 * Ensure location permission is granted on native platforms.
 * Triggers the OS permission prompt if needed. No-op on the web
 * (the browser prompts automatically when a position is requested).
 */
export async function ensureLocationPermission(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const status = await Geolocation.checkPermissions();
    if (status.location === 'granted' || status.coarseLocation === 'granted') {
      return true;
    }
    const req = await Geolocation.requestPermissions();
    return req.location === 'granted' || req.coarseLocation === 'granted';
  } catch (err) {
    console.error('[geolocation] permission error:', err);
    return false;
  }
}


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

export async function getCurrentPosition(): Promise<GeoPosition> {
  if (isNative()) {
    const granted = await ensureLocationPermission();
    if (!granted) {
      throw new Error('Accès à la localisation refusé. Veuillez autoriser l\'accès dans les paramètres.');
    }
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
  }

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

// --- Native watch bookkeeping -------------------------------------------------
let nativeWatchHandle = 0;
const nativeWatchIds = new Map<number, string>();
const nativeWatchClearers = new Map<number, () => void>();

export function watchPosition(
  onUpdate: (pos: GeoPosition) => void,
  onError: (error: string) => void
): number | null {
  if (isNative()) {
    let cleared = false;
    const handle = nativeWatchHandle++;
    nativeWatchClearers.set(handle, () => { cleared = true; });

    ensureLocationPermission().then((granted) => {
      if (!granted) {
        onError('Accès à la localisation refusé');
        return;
      }
      Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
        (position, err) => {
          if (cleared) return;
          if (err || !position) {
            onError('Erreur GPS');
            return;
          }
          onUpdate({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        }
      ).then((id) => {
        if (cleared) {
          Geolocation.clearWatch({ id });
        } else {
          nativeWatchIds.set(handle, id);
        }
      });
    });

    // Negative sentinel distinguishes native handles from browser numeric ids.
    return -handle - 1;
  }

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

/**
 * Clear a position watch created by watchPosition, on web or native.
 */
export function clearWatch(watchId: number | null): void {
  if (watchId === null) return;
  if (watchId < 0) {
    const handle = -watchId - 1;
    const clearer = nativeWatchClearers.get(handle);
    if (clearer) clearer();
    nativeWatchClearers.delete(handle);
    const id = nativeWatchIds.get(handle);
    if (id) {
      Geolocation.clearWatch({ id });
      nativeWatchIds.delete(handle);
    }
    return;
  }
  if (navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
}
