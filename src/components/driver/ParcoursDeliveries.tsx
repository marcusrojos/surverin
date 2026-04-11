import { useState, useEffect, useCallback } from 'react';
import localforage from 'localforage';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  Package,
  MapPin,
  CheckCircle2,
  Clock,
  Loader2,
  Truck,
  ShieldCheck,
  PenLine,
  Hash,
  Navigation,
  WifiOff,
  Camera,
  MapPinOff,
  LocateFixed,
  Database,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { SignaturePad } from '@/components/ui/signature-pad';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useGeolocation } from '@/hooks/use-geolocation';
import { GEOFENCE_RADIUS } from '@/lib/geolocation';

interface ParcoursDeliveriesProps {
  parcoursId: string;
  parcoursName: string;
  driverId: string;
  forceConfirmed: boolean;
  onBack: () => void;
}

interface PharmacyDelivery {
  pharmacyId: string;
  pharmacyName: string;
  pharmacyAddress: string | null;
  pharmacyLatitude: number | null;
  pharmacyLongitude: number | null;
  position: number;
  colis: { id: string; barcode: string; type: string }[];
  // Existing delivery record (if any)
  deliveryId: string | null;
  deliveryStatus: string | null;
  deliveryReference: string | null;
  deliveredAt: string | null;
  recipientName: string | null;
  verificationCode: string | null;
  nb_cartons: number;
  nb_sachets: number;
  nb_barques: number;
  // Bacs recovery
  bacsToRecover: number;
}

// Stable cache store — created once outside component renders
const parcoursCacheStore = localforage.createInstance({ name: 'dpci', storeName: 'parcours_deliveries_cache' });

export function ParcoursDeliveries({
  parcoursId,
  parcoursName,
  driverId,
  forceConfirmed,
  onBack,
}: ParcoursDeliveriesProps) {
  const [pharmacyDeliveries, setPharmacyDeliveries] = useState<PharmacyDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingCache, setUsingCache] = useState(false);
  const { isOnline, queueDelivery, pendingDeliveries, syncPending } = useOfflineSync();

   const [validating, setValidating] = useState<PharmacyDelivery | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [signature, setSignature] = useState<string | null>('');
  const [nbCartonsReceived, setNbCartonsReceived] = useState(0);
  const [nbSachetsReceived, setNbSachetsReceived] = useState(0);
  const [nbBarquesReceived, setNbBarquesReceived] = useState(0);
  const [offlinePhoto, setOfflinePhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // GPS verification for online mode
  const { driverPosition, distance, isWithinZone, error: geoError, loading: geoLoading } = useGeolocation({
    pharmacyLat: validating?.pharmacyLatitude,
    pharmacyLng: validating?.pharmacyLongitude,
    enabled: !!validating && isOnline,
  });

  // ── IndexedDB cache for parcours deliveries ──
  const CACHE_KEY = `parcours_${parcoursId}`;

  const saveToCache = useCallback(async (data: PharmacyDelivery[]) => {
    try {
      await parcoursCacheStore.setItem(CACHE_KEY, { data, cachedAt: Date.now() });
    } catch (e) {
      console.warn('[Cache] Failed to save:', e);
    }
  }, [CACHE_KEY]);

  const loadFromCache = useCallback(async (): Promise<PharmacyDelivery[] | null> => {
    try {
      const cached = await parcoursCacheStore.getItem<{ data: PharmacyDelivery[]; cachedAt: number }>(CACHE_KEY);
      return cached?.data || null;
    } catch { return null; }
  }, [CACHE_KEY]);

  const buildMappedData = (
    ppData: { id: string; pharmacy_id: string; position: number }[],
    pharmData: { id: string; name: string; address: string | null; latitude: number | null; longitude: number | null }[],
    colisData: { id: string; barcode: string; type: string; parcours_pharmacy_id: string }[],
    delivData: { id: string; pharmacy_id: string; status: string; reference: string; delivered_at: string | null; recipient_name: string | null; verification_code: string | null }[],
  ): PharmacyDelivery[] => {
    const pharmMap = new Map(pharmData.map(p => [p.id, p]));
    const colisMap = new Map<string, { id: string; barcode: string; type: string }[]>();
    colisData.forEach(c => {
      const list = colisMap.get(c.parcours_pharmacy_id) || [];
      list.push({ id: c.id, barcode: c.barcode, type: c.type });
      colisMap.set(c.parcours_pharmacy_id, list);
    });
    const delivMap = new Map<string, (typeof delivData)[number]>();
    delivData.forEach(d => delivMap.set(d.pharmacy_id, d));

    return ppData.map(pp => {
      const pharm = pharmMap.get(pp.pharmacy_id);
      const colis = colisMap.get(pp.id) || [];
      const deliv = delivMap.get(pp.pharmacy_id);
      return {
        pharmacyId: pp.pharmacy_id,
        pharmacyName: pharm?.name || 'Inconnu',
        pharmacyAddress: pharm?.address || null,
        pharmacyLatitude: pharm?.latitude ?? null,
        pharmacyLongitude: pharm?.longitude ?? null,
        position: pp.position,
        colis,
        deliveryId: deliv?.id || null,
        deliveryStatus: deliv?.status || null,
        deliveryReference: deliv?.reference || null,
        deliveredAt: deliv?.delivered_at || null,
        recipientName: deliv?.recipient_name || null,
        verificationCode: deliv?.verification_code || null,
        nb_cartons: colis.filter(c => c.type === 'carton').length,
        nb_sachets: colis.filter(c => c.type === 'sachet').length,
        nb_barques: colis.filter(c => c.type === 'barque').length,
      };
    });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setUsingCache(false);

    // If offline, load from cache immediately
    if (!navigator.onLine) {
      const cached = await loadFromCache();
      if (cached && cached.length > 0) {
        setPharmacyDeliveries(cached);
        setUsingCache(true);
      } else {
        setPharmacyDeliveries([]);
      }
      setLoading(false);
      return;
    }

    try {
      const { data: ppData, error: ppError } = await supabase
        .from('parcours_pharmacies')
        .select('id, pharmacy_id, position')
        .eq('parcours_id', parcoursId)
        .order('position', { ascending: true });

      if (ppError) throw ppError;
      if (!ppData || ppData.length === 0) {
        setPharmacyDeliveries([]);
        setLoading(false);
        return;
      }

      const pharmacyIds = ppData.map(pp => pp.pharmacy_id);
      const ppIds = ppData.map(pp => pp.id);

      const [pharmRes, colisRes, delivRes] = await Promise.all([
        supabase.from('pharmacies').select('id, name, address, latitude, longitude').in('id', pharmacyIds),
        supabase.from('parcours_colis').select('id, barcode, type, parcours_pharmacy_id').in('parcours_pharmacy_id', ppIds),
        supabase.from('deliveries').select('*').eq('parcours_id', parcoursId),
      ]);

      const mapped = buildMappedData(
        ppData,
        pharmRes.data || [],
        colisRes.data || [],
        (delivRes.data || []).map(d => ({
          id: d.id,
          pharmacy_id: d.pharmacy_id,
          status: d.status,
          reference: d.reference,
          delivered_at: d.delivered_at,
          recipient_name: d.recipient_name,
          verification_code: d.verification_code,
        })),
      );

      setPharmacyDeliveries(mapped);
      // Save to cache for offline use
      saveToCache(mapped);
    } catch {
      // Network error — try cache fallback
      const cached = await loadFromCache();
      if (cached && cached.length > 0) {
        setPharmacyDeliveries(cached);
        setUsingCache(true);
        toast.warning('Données chargées depuis le cache local');
      } else {
        toast.error('Erreur lors du chargement des livraisons');
      }
    } finally {
      setLoading(false);
    }
  }, [parcoursId, driverId, loadFromCache, saveToCache]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (pendingDeliveries.length === 0) return;
    setPharmacyDeliveries(prev => {
      const pendingKeys = new Set(
        pendingDeliveries.map(p => p.delivery_id ?? `${p.parcours_id}:${p.pharmacy_id}`)
      );
      let changed = false;
      const updated = prev.map(pd => {
        const deliveryKey = pd.deliveryId ?? `${parcoursId}:${pd.pharmacyId}`;
        if (pendingKeys.has(deliveryKey) && pd.deliveryStatus !== 'livre') {
          changed = true;
          return { ...pd, deliveryStatus: 'livre', recipientName: 'Validation hors-ligne', deliveredAt: new Date().toISOString() };
        }
        return pd;
      });
      return changed ? updated : prev;
    });
  }, [pendingDeliveries, parcoursId]);

  // Re-fetch when coming back online
  useEffect(() => {
    if (isOnline && usingCache) {
      fetchData();
    }
  }, [isOnline]);

  const openValidation = (pd: PharmacyDelivery) => {
    setValidating(pd);
    setRecipientName('');
    setVerificationCode('');
    setSignature('');
    setOfflinePhoto(null);
    setNbCartonsReceived(pd.nb_cartons);
    setNbSachetsReceived(pd.nb_sachets);
    setNbBarquesReceived(pd.nb_barques);
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setOfflinePhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleValidateDelivery = async () => {
    if (!validating) return;
    if (isOnline && !recipientName.trim()) {
      toast.error('Le nom du destinataire est requis');
      return;
    }

    if (isOnline) {
      // GPS check - block if pharmacy has coordinates and driver is not within zone
      const pharmacyHasCoords = validating.pharmacyLatitude != null && validating.pharmacyLongitude != null;
      if (pharmacyHasCoords && !isWithinZone) {
        toast.error(`Vous devez être à moins de ${GEOFENCE_RADIUS}m de la pharmacie pour valider`);
        return;
      }

      // Verification code check
      if (validating.verificationCode && verificationCode !== validating.verificationCode) {
        toast.error('Code de vérification incorrect');
        return;
      }

      // Signature check
      if (!signature) {
        toast.error('La signature est requise');
        return;
      }

      if (!validating.deliveryId) {
        toast.error('Aucune livraison associée à cette pharmacie');
        return;
      }

      setSaving(true);
      try {
        const deliveryId = validating.deliveryId;

        const { error } = await supabase
          .from('deliveries')
          .update({
            status: 'livre',
            recipient_name: recipientName.trim(),
            recipient_signature: signature,
            nb_cartons_received: nbCartonsReceived,
            nb_sachets_received: nbSachetsReceived,
            nb_barques_received: nbBarquesReceived,
            delivered_at: new Date().toISOString(),
            driver_latitude: driverPosition?.latitude ?? null,
            driver_longitude: driverPosition?.longitude ?? null,
          } as any)
          .eq('id', deliveryId);
        if (error) throw error;

        toast.success('Livraison validée ✓');
        setValidating(null);
        fetchData();

        // Check if all deliveries are done
        const updatedList = pharmacyDeliveries.map(pd =>
          pd.pharmacyId === validating.pharmacyId ? { ...pd, deliveryStatus: 'livre' } : pd
        );
        const allDone = updatedList.every(pd => pd.deliveryStatus === 'livre');
        if (allDone) {
          await supabase
            .from('parcours')
            .update({ status: 'termine' } as any)
            .eq('id', parcoursId);
          toast.success('🎉 Toutes les livraisons terminées ! Parcours terminé.');
        }
      } catch {
        toast.error('Erreur lors de la validation');
      } finally {
        setSaving(false);
      }
    } else {
      // Offline mode: only local validation is required
      if (!offlinePhoto) {
        toast.error('La photo du bon de livraison est obligatoire en mode hors-ligne');
        return;
      }

      const deliveredAt = new Date().toISOString();
      const reference = validating.deliveryReference || `${parcoursName}-${validating.pharmacyName}`;
      await queueDelivery(
        validating.deliveryId,
        reference,
        {
          status: 'livre',
          recipient_name: 'Validation hors-ligne',
          recipient_signature: null,
          delivered_at: deliveredAt,
        },
        offlinePhoto,
        {
          pharmacy_id: validating.pharmacyId,
          parcours_id: parcoursId,
          driver_id: driverId,
        }
      );
      toast.success('Livraison sauvegardée hors-ligne');
      setValidating(null);
      setPharmacyDeliveries(prev => {
        const updated = prev.map(pd =>
          pd.pharmacyId === validating.pharmacyId
            ? { ...pd, deliveryStatus: 'livre', recipientName: 'Validation hors-ligne', deliveredAt }
            : pd
        );
        void saveToCache(updated);
        return updated;
      });
    }
  };

  const hasPendingSync = (pd: PharmacyDelivery) =>
    pendingDeliveries.some(p => (p.delivery_id ?? `${p.parcours_id}:${p.pharmacy_id}`) === (pd.deliveryId ?? `${parcoursId}:${pd.pharmacyId}`));

  const pending = pharmacyDeliveries.filter(pd =>
    pd.deliveryStatus !== 'livre' && !hasPendingSync(pd)
  );
  const delivered = pharmacyDeliveries.filter(pd =>
    pd.deliveryStatus === 'livre' || hasPendingSync(pd)
  );

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold truncate">{parcoursName}</h2>
          <p className="text-xs text-muted-foreground">
            {pharmacyDeliveries.length} pharmacie{pharmacyDeliveries.length > 1 ? 's' : ''} · {delivered.length} livrée{delivered.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {!isOnline && (
            <span className="inline-flex items-center gap-1 text-[10px] text-warning">
              <WifiOff className="w-3 h-3" /> Hors-ligne
            </span>
          )}
          {forceConfirmed && (
            <span className="inline-flex items-center gap-1 text-[10px] text-warning">
              <ShieldCheck className="w-3 h-3" /> Forcé
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      {pharmacyDeliveries.length > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{delivered.length}/{pharmacyDeliveries.length} livrées</span>
            <span>{Math.round((delivered.length / pharmacyDeliveries.length) * 100)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', delivered.length === pharmacyDeliveries.length ? 'bg-green-500' : 'bg-primary')}
              style={{ width: `${(delivered.length / pharmacyDeliveries.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Pending offline sync indicator */}
      {pendingDeliveries.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="py-2 flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-warning shrink-0" />
            <p className="text-xs text-warning">
              {pendingDeliveries.length} livraison{pendingDeliveries.length > 1 ? 's' : ''} en attente de synchronisation
            </p>
            {isOnline && (
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={syncPending}>
                Synchroniser
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Using cached data indicator */}
      {usingCache && (
        <Card className="border-muted bg-muted/30">
          <CardContent className="py-2 flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              Données locales utilisées — les modifications seront synchronisées au retour en ligne
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : pharmacyDeliveries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Aucune pharmacie dans ce parcours</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Pending deliveries */}
          {pending.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                À livrer ({pending.length})
              </p>
              {pending.map(pd => (
                <Card key={pd.pharmacyId} className="card-hover border-primary/20">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Truck className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{pd.pharmacyName}</p>
                            {pd.deliveryReference && (
                              <p className="text-xs text-muted-foreground mt-0.5">{pd.deliveryReference}</p>
                            )}
                          </div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning/15 text-warning border border-warning/30 shrink-0">
                            <Clock className="w-3 h-3" /> En attente
                          </span>
                        </div>

                        {/* Destination address */}
                        {pd.pharmacyAddress && (
                          <div className="flex items-start gap-1.5 mt-2 p-2 rounded-lg bg-muted/50">
                            <Navigation className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                            <p className="text-xs text-foreground leading-relaxed">{pd.pharmacyAddress}</p>
                          </div>
                        )}

                        {/* Colis list */}
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                            Colis ({pd.colis.length})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {pd.nb_cartons > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Package className="w-3 h-3" />{pd.nb_cartons} carton{pd.nb_cartons > 1 ? 's' : ''}
                              </span>
                            )}
                            {pd.nb_sachets > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {pd.nb_sachets} sachet{pd.nb_sachets > 1 ? 's' : ''}
                              </span>
                            )}
                            {pd.nb_barques > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {pd.nb_barques} barque{pd.nb_barques > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {pd.colis.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {pd.colis.map(c => (
                                <span key={c.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">
                                  {c.barcode}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <Button
                          size="sm"
                          className="mt-3 w-full"
                          onClick={() => openValidation(pd)}
                        >
                          <Truck className="w-4 h-4 mr-1.5" />
                          Livrer
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}

          {/* Delivered */}
          {delivered.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4">
                Livrées ({delivered.length})
              </p>
              {delivered.map(pd => {
                const isPendingSync = hasPendingSync(pd);
                return (
                  <Card key={pd.pharmacyId} className={cn('opacity-70', isPendingSync && 'border-warning/30')}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start gap-3">
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', isPendingSync ? 'bg-warning/10' : 'bg-green-500/10')}>
                          {isPendingSync ? <WifiOff className="w-5 h-5 text-warning" /> : <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{pd.pharmacyName}</p>
                          {pd.deliveryReference && (
                            <p className="text-xs text-muted-foreground mt-0.5">{pd.deliveryReference}</p>
                          )}
                          {pd.pharmacyAddress && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {pd.pharmacyAddress}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            {pd.recipientName && <span>Reçu par : {pd.recipientName}</span>}
                            {pd.deliveredAt && (
                              <span>· {format(new Date(pd.deliveredAt), 'dd MMM HH:mm', { locale: fr })}</span>
                            )}
                            {isPendingSync && <span className="text-warning">· En attente sync</span>}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1 text-xs text-muted-foreground">
                            <span>{pd.colis.length} colis</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Validation Dialog */}
      <Dialog open={!!validating} onOpenChange={(open) => { if (!open) setValidating(null); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Livrer
            </DialogTitle>
            <DialogDescription>
              {validating?.pharmacyName}
              {validating?.pharmacyAddress && (
                <span className="block text-xs mt-0.5">{validating.pharmacyAddress}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {!isOnline && (
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="py-2 flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-warning shrink-0" />
                <p className="text-xs text-warning">
                  Mode hors-ligne — la livraison sera synchronisée automatiquement
                </p>
              </CardContent>
            </Card>
          )}

          {/* GPS Status - online mode only */}
          {isOnline && validating?.pharmacyLatitude != null && validating?.pharmacyLongitude != null && (
            <Card className={cn(
              'border',
              geoLoading ? 'border-muted' : isWithinZone ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/5'
            )}>
              <CardContent className="py-2.5 flex items-center gap-2">
                {geoLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">Localisation GPS en cours…</p>
                  </>
                ) : geoError ? (
                  <>
                    <MapPinOff className="w-4 h-4 text-destructive shrink-0" />
                    <p className="text-xs text-destructive">{geoError}</p>
                  </>
                ) : isWithinZone ? (
                  <>
                    <LocateFixed className="w-4 h-4 text-green-600 shrink-0" />
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Position vérifiée — {distance !== null ? `${Math.round(distance)}m` : ''} de la pharmacie
                    </p>
                  </>
                ) : (
                  <>
                    <MapPinOff className="w-4 h-4 text-destructive shrink-0" />
                    <p className="text-xs text-destructive">
                      Trop loin de la pharmacie ({distance !== null ? `${Math.round(distance)}m` : '?'} / {GEOFENCE_RADIUS}m max)
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {/* Colis summary */}
            {validating && validating.colis.length > 0 && (
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Colis à livrer</p>
                <div className="flex flex-wrap gap-1">
                  {validating.colis.map(c => (
                    <span key={c.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background text-[10px] font-mono text-muted-foreground border">
                      {c.type}: {c.barcode}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ─── ONLINE MODE FIELDS ─── */}
            {isOnline && (
              <>
                {/* Verification code */}
                {validating?.verificationCode && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5" />
                      Code de vérification *
                    </Label>
                    <Input
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="Code à 6 chiffres"
                      maxLength={6}
                    />
                    <p className="text-[10px] text-muted-foreground">Demandez le code au pharmacien</p>
                  </div>
                )}

                {/* Quantities received - always show all 3 fields */}
                <div className="space-y-2">
                  <Label>Quantités reçues</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">Cartons</p>
                      <Input type="number" min={0} value={nbCartonsReceived} onChange={(e) => setNbCartonsReceived(parseInt(e.target.value) || 0)} />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">Sachets</p>
                      <Input type="number" min={0} value={nbSachetsReceived} onChange={(e) => setNbSachetsReceived(parseInt(e.target.value) || 0)} />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">Bacs</p>
                      <Input type="number" min={0} value={nbBarquesReceived} onChange={(e) => setNbBarquesReceived(parseInt(e.target.value) || 0)} />
                    </div>
                  </div>
                </div>

                {/* Recipient name */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <PenLine className="w-3.5 h-3.5" />
                    Nom du destinataire *
                  </Label>
                  <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Nom de la personne qui réceptionne" />
                </div>

                {/* Signature */}
                <div className="space-y-1.5">
                  <Label>Signature du destinataire *</Label>
                  <SignaturePad onSignatureChange={setSignature} className="border rounded-lg" />
                </div>
              </>
            )}

            {/* ─── OFFLINE MODE: PHOTO ONLY ─── */}
            {!isOnline && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  Prenez une photo du bon de livraison papier pour valider.
                </p>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" />
                    Photo du bon de livraison *
                  </Label>
                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoCapture}
                    className="text-xs"
                  />
                  {offlinePhoto && (
                    <div className="relative">
                      <img src={offlinePhoto} alt="Photo bon" className="w-full h-40 object-cover rounded-lg border" />
                      <button
                        type="button"
                        onClick={() => setOfflinePhoto(null)}
                        className="absolute top-1 right-1 bg-background/80 rounded-full p-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleValidateDelivery}
              disabled={
                saving ||
                (isOnline && !recipientName.trim()) ||
                (isOnline && validating?.pharmacyLatitude != null && validating?.pharmacyLongitude != null && (!isWithinZone || geoLoading)) ||
                (isOnline && !!validating?.verificationCode && verificationCode !== validating?.verificationCode) ||
                (isOnline && !signature) ||
                (!isOnline && !offlinePhoto)
              }
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Validation...</>
              ) : (
                <><Truck className="w-4 h-4 mr-2" /> {isOnline ? 'Confirmer la livraison' : 'Sauvegarder hors-ligne'}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
