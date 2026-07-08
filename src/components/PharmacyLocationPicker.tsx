import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Search, X, Loader2, Navigation, Crosshair, Check } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

interface PharmacyLocationPickerProps {
  initialLat?: number | null;
  initialLng?: number | null;
  initialAddress?: string;
  onLocationSelect: (data: {
    latitude: number;
    longitude: number;
    address: string;
    name?: string;
    source: 'nominatim' | 'manuel' | 'gps';
  }) => void;
}

// Côte d'Ivoire bounds & center
const CI_CENTER: L.LatLngTuple = [7.54, -5.55];
const CI_BOUNDS: L.LatLngBoundsExpression = [[4.3, -8.6], [10.7, -2.5]];

export function PharmacyLocationPicker({
  initialLat,
  initialLng,
  initialAddress = '',
  onLocationSelect,
}: PharmacyLocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(
    initialLat && initialLng ? [initialLat, initialLng] : null
  );
  const [selectedAddress, setSelectedAddress] = useState(initialAddress);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationSuccess, setLocationSuccess] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Leaflet refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const markerPosRef = useRef(markerPos);
  markerPosRef.current = markerPos;

  // Initialize/destroy Leaflet map imperatively
  useEffect(() => {
    if (!showMap || !mapContainerRef.current) return;

    const container = mapContainerRef.current;

    const initTimer = setTimeout(() => {
      try {
        const center = markerPosRef.current || CI_CENTER;
        const zoom = markerPosRef.current ? 16 : 7;

        const map = L.map(container, {
          center,
          zoom,
          maxBounds: CI_BOUNDS,
          minZoom: 6,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        map.on('click', (e: L.LeafletMouseEvent) => {
          const { lat, lng } = e.latlng;
          updateMarker(map, lat, lng);
          reverseGeocode(lat, lng);
        });

        setTimeout(() => map.invalidateSize(), 100);
        setTimeout(() => map.invalidateSize(), 500);

        if (markerPosRef.current) {
          const m = L.marker(markerPosRef.current).addTo(map);
          markerRef.current = m;
        }

        mapInstanceRef.current = map;
      } catch (err) {
        console.error('[LeafletMap] Init error:', err);
      }
    }, 50);

    return () => {
      clearTimeout(initTimer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap]);

  const updateMarker = (map: L.Map, lat: number, lng: number) => {
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng]).addTo(map);
    }
    setMarkerPos([lat, lng]);
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
      );
      const data = await resp.json();
      const addr = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setSelectedAddress(addr);
      onLocationSelect({ latitude: lat, longitude: lng, address: addr, source: 'manuel' });
    } catch {
      const addr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setSelectedAddress(addr);
      onLocationSelect({ latitude: lat, longitude: lng, address: addr, source: 'manuel' });
    }
  };

  const searchPharmacies = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const q = query.trim();
      const base = 'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1';
      const searches = [
        fetch(`${base}&q=${encodeURIComponent(q)}&countrycodes=ci&limit=15`),
        fetch(`${base}&q=${encodeURIComponent('pharmacie ' + q)}&countrycodes=ci&limit=15`),
        fetch(`${base}&q=${encodeURIComponent(q)}&countrycodes=ci&limit=10&viewbox=-8.6,4.3,-2.5,10.7`),
        fetch(`${base}&q=${encodeURIComponent(q)}&countrycodes=ci&limit=10&amenity=pharmacy`),
        fetch(`${base}&q=${encodeURIComponent('pharmacie ' + q + ' côte d\'ivoire')}&limit=10`),
        fetch(`${base}&q=${encodeURIComponent('pharmacie ' + q + ' abidjan')}&countrycodes=ci&limit=5`),
        fetch(`${base}&q=${encodeURIComponent('pharmacie ' + q + ' bouaké')}&countrycodes=ci&limit=3`),
        fetch(`${base}&q=${encodeURIComponent('pharmacie ' + q + ' yamoussoukro')}&countrycodes=ci&limit=3`),
      ];
      const responses = await Promise.allSettled(searches);
      const allData: NominatimResult[][] = [];
      for (const r of responses) {
        if (r.status === 'fulfilled') {
          try { allData.push(await r.value.json()); } catch { /* skip */ }
        }
      }
      const seen = new Set<number>();
      const merged: NominatimResult[] = [];
      for (const batch of allData) {
        for (const r of batch) {
          if (!seen.has(r.place_id)) {
            seen.add(r.place_id);
            merged.push(r);
          }
        }
      }
      setResults(merged.slice(0, 20));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchPharmacies(value), 400);
  };

  const handleSelectResult = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setMarkerPos([lat, lng]);
    setSelectedAddress(result.display_name);
    setResults([]);
    setSearchQuery(result.display_name.split(',')[0]);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 16);
      updateMarker(mapInstanceRef.current, lat, lng);
    }

    onLocationSelect({
      latitude: lat,
      longitude: lng,
      address: result.display_name,
      source: 'nominatim',
    });
  };

  const clearLocation = () => {
    setMarkerPos(null);
    setSelectedAddress('');
    setSearchQuery('');
    setResults([]);
    if (markerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
  };

  const handleUseCurrentPosition = async () => {
    setGettingLocation(true);
    setLocationSuccess(false);
    try {
      const position = await getCurrentPosition();
      const lat = position.latitude;
      const lng = position.longitude;
      setMarkerPos([lat, lng]);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([lat, lng], 16);
        updateMarker(mapInstanceRef.current, lat, lng);
      }

      // Reverse geocode
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
        );
        const data = await resp.json();
        const addr = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        setSelectedAddress(addr);
        onLocationSelect({ latitude: lat, longitude: lng, address: addr, source: 'gps' });
      } catch {
        const addr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        setSelectedAddress(addr);
        onLocationSelect({ latitude: lat, longitude: lng, address: addr, source: 'gps' });
      }

      setGettingLocation(false);
      setLocationSuccess(true);
      setTimeout(() => setLocationSuccess(false), 2000);
    } catch (err: any) {
      setGettingLocation(false);
      toast.error(err?.message || 'Impossible d\'obtenir votre position');
    }
  };


  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <MapPin className="w-4 h-4" />
        Position GPS de la pharmacie
      </Label>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher une pharmacie en Côte d'Ivoire..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-10 pr-10"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
        {searchQuery && !searching && (
          <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => { setSearchQuery(''); setResults([]); }}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Results list */}
      {results.length > 0 && (
        <Card className="max-h-64 overflow-y-auto">
          <CardContent className="p-1">
            {results.map((r) => (
              <button
                key={r.place_id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md transition-colors"
                onClick={() => handleSelectResult(r)}
              >
                <p className="font-medium truncate">{r.display_name.split(',')[0]}</p>
                <p className="text-xs text-muted-foreground truncate">{r.display_name}</p>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Use current position button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-2 transition-all"
        onClick={handleUseCurrentPosition}
        disabled={gettingLocation}
      >
        {gettingLocation ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : locationSuccess ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : (
          <Crosshair className="w-4 h-4" />
        )}
        {gettingLocation
          ? 'Récupération de la position…'
          : locationSuccess
            ? 'Position récupérée !'
            : 'Utiliser ma position actuelle'}
      </Button>

      {/* Selected location display */}
      {selectedAddress && markerPos && (
        <div className="flex items-start gap-2 p-2 bg-accent/50 rounded-md text-sm">
          <Navigation className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="truncate">{selectedAddress}</p>
            <p className="text-xs text-muted-foreground">
              {markerPos[0].toFixed(6)}, {markerPos[1].toFixed(6)}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 h-6 w-6" onClick={clearLocation}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Toggle map button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setShowMap(prev => !prev)}
      >
        <MapPin className="w-4 h-4 mr-2" />
        {showMap ? 'Masquer la carte' : 'Sélection manuelle sur la carte'}
      </Button>

      {/* Map */}
      {showMap && (
        <div
          ref={mapContainerRef}
          className="rounded-lg overflow-hidden border"
          style={{ height: '256px', width: '100%' }}
        />
      )}
    </div>
  );
}
