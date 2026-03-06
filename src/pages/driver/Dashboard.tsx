import { useState, useCallback, useMemo, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/lib/auth';
import { useOfflineDeliveries, EnrichedDelivery } from '@/hooks/useOfflineDeliveries';
import { useRealtimeDeliveries } from '@/hooks/use-realtime-deliveries';
import { useGeolocation } from '@/hooks/use-geolocation';
import { GEOFENCE_RADIUS } from '@/lib/geolocation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { SignaturePad } from '@/components/ui/signature-pad';
import { toast } from 'sonner';
import { Package, CheckCircle, WifiOff, Loader2, Truck, Filter, CalendarDays, MapPin, Navigation, AlertTriangle, RefreshCw, Camera, ArrowDownFromLine } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

type Delivery = Database['public']['Tables']['deliveries']['Row'];
type Pharmacy = Database['public']['Tables']['pharmacies']['Row'];

export default function DriverDashboard() {
  const { user } = useAuth();
  const {
    deliveries,
    pharmacyOrder,
    loading,
    isOnline,
    isSyncing,
    syncMessage,
    pendingCount,
    validateDelivery,
    refetch,
  } = useOfflineDeliveries({ userId: user?.id });

  const [deliverDialog, setDeliverDialog] = useState<EnrichedDelivery | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [cartonsReceived, setCartonsReceived] = useState(0);
  const [sachetsReceived, setSachetsReceived] = useState(0);
  const [bacsReceived, setBacsReceived] = useState(0);
  const [verificationCode, setVerificationCode] = useState('');
  const [offlinePhoto, setOfflinePhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const PULL_THRESHOLD = 80;

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'en_attente' | 'livre'>('all');
  const [dateFilter, setDateFilter] = useState('');

  // Geolocation for delivery confirmation
  const pharmacyLat = (deliverDialog?.pharmacy as any)?.latitude ?? null;
  const pharmacyLng = (deliverDialog?.pharmacy as any)?.longitude ?? null;
  const hasPharmacyLocation = pharmacyLat !== null && pharmacyLng !== null;

  const { driverPosition, distance, isWithinZone, error: geoError, loading: geoLoading } = useGeolocation({
    pharmacyLat,
    pharmacyLng,
    enabled: !!deliverDialog && hasPharmacyLocation,
  });

  // Stable refs for realtime callbacks
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const stableOnNew = useCallback(() => { if (navigator.onLine) refetchRef.current(); }, []);
  const stableOnUpdate = useCallback(() => { if (navigator.onLine) refetchRef.current(); }, []);
  const stableOnDelete = useCallback(() => { if (navigator.onLine) refetchRef.current(); }, []);

  useRealtimeDeliveries({
    userId: user?.id,
    onNewDelivery: stableOnNew,
    onDeliveryUpdate: stableOnUpdate,
    onDeliveryDelete: stableOnDelete,
  });

  // Pull-to-refresh handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollContainerRef.current && scrollContainerRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, 120));
    }
  }, [isPulling]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(0);
      await refetch();
      setIsRefreshing(false);
      toast.success('Données actualisées');
    } else {
      setPullDistance(0);
    }
    setIsPulling(false);
  }, [pullDistance, isRefreshing, refetch]);

  const groupedByDate = useMemo(() => {
    let filtered = deliveries;
    if (statusFilter !== 'all') {
      filtered = filtered.filter(d => d.status === statusFilter);
    }
    if (dateFilter) {
      filtered = filtered.filter(d => format(new Date(d.created_at), 'yyyy-MM-dd') === dateFilter);
    }

    const sorted = [...filtered].sort((a, b) => {
      const posA = pharmacyOrder.get(a.pharmacy_id) ?? 9999;
      const posB = pharmacyOrder.get(b.pharmacy_id) ?? 9999;
      return posA - posB;
    });

    const groups = new Map<string, typeof sorted>();
    sorted.forEach(d => {
      const key = format(new Date(d.created_at), 'yyyy-MM-dd');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    });

    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [deliveries, statusFilter, dateFilter, pharmacyOrder]);

  const openDeliver = (d: EnrichedDelivery) => {
    setDeliverDialog(d);
    setRecipientName('');
    setVerificationCode('');
    setSignature(null);
    setOfflinePhoto(null);
    setCartonsReceived(d.nb_cartons);
    setSachetsReceived(d.nb_sachets);
    setBacsReceived(d.nb_barques);
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setOfflinePhoto(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDeliver = async () => {
    if (!deliverDialog || !recipientName.trim()) return;

    // Only check verification code if the delivery has one
    const hasVerificationCode = !!deliverDialog.verification_code;
    if (hasVerificationCode && verificationCode.trim() !== deliverDialog.verification_code) {
      toast.error('Code de vérification incorrect');
      return;
    }

    // Online geofence check: block if outside 20m
    if (isOnline && hasPharmacyLocation && !isWithinZone) {
      toast.error(`Vous devez être dans la pharmacie (${GEOFENCE_RADIUS}m maximum) pour valider la livraison.`);
      return;
    }

    setSubmitting(true);
    const now = new Date().toISOString();

    const payload: any = {
      status: 'livre' as const,
      recipient_name: recipientName.trim(),
      recipient_signature: signature,
      delivered_at: now,
      nb_cartons_received: cartonsReceived,
      nb_sachets_received: sachetsReceived,
      nb_barques_received: bacsReceived,
    };

    if (driverPosition) {
      payload.driver_latitude = driverPosition.latitude;
      payload.driver_longitude = driverPosition.longitude;
    }

    if (offlinePhoto) {
      payload.offline_photo = offlinePhoto;
    }

    await validateDelivery(deliverDialog.id, payload);

    setDeliverDialog(null);
    setSubmitting(false);
  };

  const pending = deliveries.filter(d => d.status === 'en_attente');
  const delivered = deliveries.filter(d => d.status === 'livre');

  const formatDistance = (d: number | null) => {
    if (d === null) return '';
    if (d < 1000) return `${Math.round(d)} m`;
    return `${(d / 1000).toFixed(1)} km`;
  };

  const canConfirm = !isOnline || !hasPharmacyLocation || isWithinZone;

  return (
    <DashboardLayout requiredRole="livreur">
      <div
        ref={scrollContainerRef}
        className="space-y-4"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        {(pullDistance > 0 || isRefreshing) && (
          <div
            className="flex items-center justify-center transition-all duration-200"
            style={{ height: isRefreshing ? 48 : pullDistance }}
          >
            <div className={`flex items-center gap-2 text-sm text-muted-foreground ${pullDistance >= PULL_THRESHOLD ? 'text-primary' : ''}`}>
              {isRefreshing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Actualisation…</>
              ) : pullDistance >= PULL_THRESHOLD ? (
                <><ArrowDownFromLine className="w-4 h-4" /> Relâchez pour actualiser</>
              ) : (
                <><ArrowDownFromLine className="w-4 h-4" /> Tirez pour actualiser</>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold">Mes livraisons</h1>
          <div className="flex items-center gap-3">
            {/* Discrete refresh button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={async () => {
                setIsRefreshing(true);
                await refetch();
                setIsRefreshing(false);
                toast.success('Données actualisées');
              }}
              disabled={isRefreshing || !isOnline}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            {isSyncing && (
              <div className="flex items-center gap-1 text-primary text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Synchronisation…
              </div>
            )}
            {!isOnline && (
              <div className="flex items-center gap-2 text-warning text-sm">
                <WifiOff className="w-4 h-4" />
                Hors-ligne
                {pendingCount > 0 && <span className="font-medium">({pendingCount} en attente)</span>}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <Package className="w-6 h-6 mx-auto mb-1 text-warning" />
              <p className="text-2xl font-bold">{pending.length}</p>
              <p className="text-xs text-muted-foreground">En attente</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <CheckCircle className="w-6 h-6 mx-auto mb-1 text-success" />
              <p className="text-2xl font-bold">{delivered.length}</p>
              <p className="text-xs text-muted-foreground">Livrées</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtres</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Statut</Label>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="en_attente">En attente</SelectItem>
                    <SelectItem value="livre">Livrées</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
              </div>
            </div>
            {(statusFilter !== 'all' || dateFilter) && (
              <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => { setStatusFilter('all'); setDateFilter(''); }}>
                Réinitialiser les filtres
              </Button>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : groupedByDate.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Aucune livraison trouvée</p>
        ) : (
          <div className="space-y-5">
            {groupedByDate.map(([dateKey, items]) => (
              <div key={dateKey} className="space-y-2">
                <div className="flex items-center gap-2 sticky top-0 bg-background py-1 z-10">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-sm">
                    {format(new Date(dateKey), 'EEEE dd MMMM yyyy', { locale: fr })}
                  </h2>
                  <span className="text-xs text-muted-foreground">({items.length})</span>
                </div>
                {items.map(d => {
                  const pharm = d.pharmacy as any;
                  const hasLoc = pharm?.latitude && pharm?.longitude;
                  return (
                    <Card key={d.id} className={d.status === 'livre' ? 'opacity-70' : 'card-hover'}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-mono font-medium text-sm">{d.reference}</p>
                              <StatusBadge status={d.status} />
                              {d.pendingSync && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning/20 text-warning">
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Sync en attente
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{d.pharmacy?.name || '—'}</p>
                            <p className="text-xs text-muted-foreground mt-1">{d.nb_cartons}C · {d.nb_sachets}S · {d.nb_barques}B</p>
                            {hasLoc && d.status === 'en_attente' && (
                              <div className="flex items-center gap-1 mt-1">
                                <MapPin className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">GPS requis</span>
                              </div>
                            )}
                          </div>
                          {d.status === 'en_attente' && (
                            <Button size="sm" onClick={() => openDeliver(d)} className="shrink-0">
                              <Truck className="w-4 h-4 mr-1" />Livrer
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Delivery Confirmation Dialog */}
        <Dialog open={!!deliverDialog} onOpenChange={(open) => { if (!open) setDeliverDialog(null); }}>
          <DialogContent className="max-w-md w-[calc(100%-2rem)] mx-auto max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Confirmer la livraison</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Réf: <span className="font-mono font-medium text-foreground">{deliverDialog?.reference}</span></p>

              {/* Offline mode notice */}
              {!isOnline && (
                <Card className="border-2 border-warning bg-warning/5">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center gap-2 text-sm text-warning font-medium">
                      <WifiOff className="w-4 h-4" />
                      Vous êtes hors ligne
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      La livraison sera marquée comme « effectuée hors ligne ». La position GPS ne sera pas vérifiée. Les données seront synchronisées automatiquement au retour du réseau.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Geolocation status — only when online */}
              {hasPharmacyLocation && isOnline && (
                <Card className={`border-2 ${isWithinZone ? 'border-green-500 bg-green-500/5' : 'border-destructive bg-destructive/5'}`}>
                  <CardContent className="pt-3 pb-3">
                    {geoLoading ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Recherche de votre position GPS...</span>
                      </div>
                    ) : geoError ? (
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <AlertTriangle className="w-4 h-4" />
                        <span>{geoError}</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${isWithinZone ? 'bg-green-500' : 'bg-destructive'} animate-pulse`} />
                          <span className="text-sm font-medium">
                            {isWithinZone ? 'Dans la zone autorisée' : 'Hors zone — validation bloquée'}
                          </span>
                        </div>
                        {distance !== null && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Navigation className="w-3 h-3" />
                            <span>Distance: {formatDistance(distance)} / {GEOFENCE_RADIUS} m max</span>
                          </div>
                        )}
                        {!isWithinZone && (
                          <p className="text-xs text-destructive">
                            Vous devez être dans la pharmacie ({GEOFENCE_RADIUS}m maximum) pour valider la livraison.
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Verification code - only show if delivery has one */}
              {deliverDialog?.verification_code ? (
                <div className="space-y-2">
                  <Label>Code de vérification</Label>
                  <Input
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="Entrez le code à 6 chiffres"
                    maxLength={6}
                    className="font-mono tracking-widest text-center text-lg"
                  />
                  <p className="text-xs text-muted-foreground">Demandez le code de vérification au réceptionnaire de la pharmacie</p>
                </div>
              ) : (
                <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                  Pas de code de vérification requis pour cette pharmacie
                </div>
              )}

              <div className="space-y-2"><Label>Nom du réceptionnaire</Label><Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Nom et prénom" /></div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="space-y-1"><Label className="text-xs">Cartons reçus</Label><Input type="number" min={0} value={cartonsReceived} onChange={(e) => setCartonsReceived(Number(e.target.value))} /></div>
                <div className="space-y-1"><Label className="text-xs">Sachets reçus</Label><Input type="number" min={0} value={sachetsReceived} onChange={(e) => setSachetsReceived(Number(e.target.value))} /></div>
                <div className="space-y-1"><Label className="text-xs">Bacs reçus</Label><Input type="number" min={0} value={bacsReceived} onChange={(e) => setBacsReceived(Number(e.target.value))} /></div>
              </div>

              {/* Optional photo capture (available in both modes) */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Camera className="w-4 h-4" />
                  Photo du bon papier {!isOnline && <span className="text-xs text-muted-foreground">(optionnel)</span>}
                </Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                />
                {offlinePhoto ? (
                  <div className="relative">
                    <img src={offlinePhoto} alt="Bon papier" className="w-full h-40 object-cover rounded-lg border" />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="absolute bottom-2 right-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Reprendre
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-24 border-dashed flex flex-col items-center gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="w-6 h-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Prendre une photo du bon papier</span>
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label>Signature</Label>
                <SignaturePad onSignatureChange={setSignature} />
              </div>
              <Button
                onClick={handleDeliver}
                className="w-full"
                disabled={
                  submitting ||
                  !recipientName.trim() ||
                  (!!deliverDialog?.verification_code && !verificationCode.trim()) ||
                  (isOnline && hasPharmacyLocation && !canConfirm) ||
                  (isOnline && hasPharmacyLocation && geoLoading)
                }
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Confirmer la livraison
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
