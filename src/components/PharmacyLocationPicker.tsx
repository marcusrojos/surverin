import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Search, X, Loader2, Navigation } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
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
    source: 'nominatim' | 'manuel';
  }) => void;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapCenterUpdater({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 16);
    }
  }, [center, map]);
  return null;
}

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
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Côte d'Ivoire bounds
  const CI_CENTER: [number, number] = [7.54, -5.55];
  const CI_BOUNDS: L.LatLngBoundsExpression = [[4.3, -8.6], [10.7, -2.5]];

  const searchPharmacies = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const q = query.trim();
      // Multiple search strategies for maximum coverage
      const searches = [
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent('pharmacie ' + q)}&countrycodes=ci&limit=10&addressdetails=1&viewbox=-8.6,4.3,-2.5,10.7&bounded=1`),
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=ci&limit=10&addressdetails=1&viewbox=-8.6,4.3,-2.5,10.7&bounded=1`),
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent('pharmacie ' + q + ' abidjan')}&countrycodes=ci&limit=5&addressdetails=1`),
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ' pharmacie côte d\'ivoire')}&limit=10&addressdetails=1`),
      ];
      const responses = await Promise.all(searches);
      const allData = await Promise.all(responses.map(r => r.json()));
      
      // Deduplicate by place_id
      const seen = new Set<number>();
      const merged: NominatimResult[] = [];
      for (const results of allData) {
        for (const r of results) {
          if (!seen.has(r.place_id)) {
            seen.add(r.place_id);
            merged.push(r);
          }
        }
      }
      setResults(merged.slice(0, 15));
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
    setMapCenter([lat, lng]);
    setSelectedAddress(result.display_name);
    setResults([]);
    setSearchQuery(result.display_name.split(',')[0]);
    onLocationSelect({
      latitude: lat,
      longitude: lng,
      address: result.display_name,
      source: 'nominatim',
    });
  };

  const handleMapClick = async (lat: number, lng: number) => {
    setMarkerPos([lat, lng]);
    // Reverse geocode
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

  const clearLocation = () => {
    setMarkerPos(null);
    setSelectedAddress('');
    setSearchQuery('');
    setResults([]);
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
        onClick={() => setShowMap(!showMap)}
      >
        <MapPin className="w-4 h-4 mr-2" />
        {showMap ? 'Masquer la carte' : 'Sélection manuelle sur la carte'}
      </Button>

      {/* Map */}
      {showMap && (
        <div className="h-64 rounded-lg overflow-hidden border">
          <MapContainer
            center={markerPos || CI_CENTER}
            zoom={markerPos ? 16 : 7}
            maxBounds={CI_BOUNDS}
            minZoom={6}
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onMapClick={handleMapClick} />
            {mapCenter && <MapCenterUpdater center={mapCenter} />}
            {markerPos && <Marker position={markerPos} />}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
