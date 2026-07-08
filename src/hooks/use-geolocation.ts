import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GeoPosition,
  calculateDistance,
  GEOFENCE_RADIUS,
  watchPosition,
  clearWatch,
} from '@/lib/geolocation';

interface UseGeolocationOptions {
  pharmacyLat?: number | null;
  pharmacyLng?: number | null;
  enabled?: boolean;
}

interface UseGeolocationResult {
  driverPosition: GeoPosition | null;
  distance: number | null;
  isWithinZone: boolean;
  error: string | null;
  loading: boolean;
}

export function useGeolocation({
  pharmacyLat,
  pharmacyLng,
  enabled = true,
}: UseGeolocationOptions): UseGeolocationResult {
  const [driverPosition, setDriverPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !pharmacyLat || !pharmacyLng) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const id = watchPosition(
      (pos) => {
        setDriverPosition(pos);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [pharmacyLat, pharmacyLng, enabled]);

  const distance =
    driverPosition && pharmacyLat && pharmacyLng
      ? calculateDistance(
          driverPosition.latitude,
          driverPosition.longitude,
          pharmacyLat,
          pharmacyLng
        )
      : null;

  const isWithinZone = distance !== null && distance <= GEOFENCE_RADIUS;

  return { driverPosition, distance, isWithinZone, error, loading };
}
