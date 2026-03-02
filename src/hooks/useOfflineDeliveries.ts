import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { OfflineStorage, AxisPharmacy } from '@/services/offlineStorage';
import { SyncQueue, PendingValidation } from '@/services/syncQueue';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';

type Delivery = Database['public']['Tables']['deliveries']['Row'];
type Pharmacy = Database['public']['Tables']['pharmacies']['Row'];

export type EnrichedDelivery = Delivery & { pharmacy?: Pharmacy; pendingSync?: boolean };

interface UseOfflineDeliveriesOptions {
  userId: string | undefined;
}

export function useOfflineDeliveries({ userId }: UseOfflineDeliveriesOptions) {
  const [deliveries, setDeliveries] = useState<EnrichedDelivery[]>([]);
  const [pharmacyOrder, setPharmacyOrder] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // ── Online/offline listener ──
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => {
      setIsOnline(false);
      toast.warning('Mode hors-ligne activé');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ── Helper: enrich deliveries with pharmacies & pending status ──
  const enrichDeliveries = useCallback(async (dels: Delivery[], phars: Pharmacy[]): Promise<EnrichedDelivery[]> => {
    const pharMap = new Map(phars.map(p => [p.id, p]));
    const pendingIds = await SyncQueue.getPendingDeliveryIds();

    return dels.map(d => {
      const enriched: EnrichedDelivery = { ...d, pharmacy: pharMap.get(d.pharmacy_id) };
      if (pendingIds.has(d.id)) {
        enriched.pendingSync = true;
      }
      return enriched;
    });
  }, []);

  // ── Build pharmacy order map ──
  const buildOrderMap = useCallback((axisData: AxisPharmacy[]) => {
    const orderMap = new Map<string, number>();
    axisData.forEach(ap => {
      const existing = orderMap.get(ap.pharmacy_id);
      if (existing === undefined || ap.position < existing) {
        orderMap.set(ap.pharmacy_id, ap.position);
      }
    });
    return orderMap;
  }, []);

  // ── Load from IndexedDB (cold start / offline) ──
  const loadFromCache = useCallback(async () => {
    const [dels, phars, axisData] = await Promise.all([
      OfflineStorage.getDeliveries(),
      OfflineStorage.getPharmacies(),
      OfflineStorage.getAxisPharmacies(),
    ]);
    if (dels.length > 0) {
      const enriched = await enrichDeliveries(dels, phars);
      setDeliveries(enriched);
      setPharmacyOrder(buildOrderMap(axisData));
    }
    return dels.length > 0;
  }, [enrichDeliveries, buildOrderMap]);

  // ── Fetch from Supabase (online) ──
  const fetchFromServer = useCallback(async () => {
    if (!userIdRef.current) return false;
    try {
      const [delRes, pharRes, axisRes] = await Promise.all([
        supabase.from('deliveries').select('*').eq('driver_id', userIdRef.current).order('created_at', { ascending: false }),
        supabase.from('pharmacies').select('*'),
        supabase.from('axis_pharmacies').select('*').order('position', { ascending: true }),
      ]);

      const dels = delRes.data || [];
      const phars = pharRes.data || [];
      const axisData = (axisRes.data || []).map(a => ({ pharmacy_id: a.pharmacy_id, position: a.position }));

      // Persist to IndexedDB
      await Promise.all([
        OfflineStorage.saveDeliveries(dels),
        OfflineStorage.savePharmacies(phars),
        OfflineStorage.saveAxisPharmacies(axisData),
      ]);

      const enriched = await enrichDeliveries(dels, phars);
      setDeliveries(enriched);
      setPharmacyOrder(buildOrderMap(axisData));
      return true;
    } catch {
      return false;
    }
  }, [enrichDeliveries, buildOrderMap]);

  // ── Sync pending validations ──
  const syncPending = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setIsSyncing(true);

    try {
      const { synced, failed } = await SyncQueue.syncAll();
      if (synced > 0) {
        toast.success(`${synced} livraison${synced > 1 ? 's' : ''} synchronisée${synced > 1 ? 's' : ''}`);
      }
      if (failed > 0) {
        toast.error(`${failed} livraison${failed > 1 ? 's' : ''} en échec de synchronisation`);
      }

      // Refresh data from server after sync
      if (synced > 0) {
        await fetchFromServer();
      }

      // Cleanup old synced items
      await SyncQueue.cleanup();

      const count = await SyncQueue.getPendingCount();
      setPendingCount(count);
    } finally {
      setIsSyncing(false);
      syncingRef.current = false;
    }
  }, [fetchFromServer]);

  // ── Initial load: cache first, then server ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1. Hydrate from IndexedDB immediately
      await loadFromCache();

      // 2. Update pending count
      const count = await SyncQueue.getPendingCount();
      if (!cancelled) setPendingCount(count);

      // 3. If online, fetch fresh data + sync
      if (navigator.onLine && userIdRef.current) {
        const ok = await fetchFromServer();
        if (ok && !cancelled) {
          await syncPending();
        }
      }

      if (!cancelled) setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── When coming back online: sync + refresh ──
  useEffect(() => {
    if (isOnline && !loading) {
      toast.success('Connexion rétablie — synchronisation en cours…');
      syncPending().then(() => fetchFromServer());
    }
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validate a delivery (works offline) ──
  const validateDelivery = useCallback(async (
    deliveryId: string,
    payload: PendingValidation['payload'],
  ) => {
    // 1. Optimistic update in state
    setDeliveries(prev => prev.map(d =>
      d.id === deliveryId
        ? {
            ...d,
            status: 'livre' as const,
            recipient_name: payload.recipient_name,
            recipient_signature: payload.recipient_signature,
            delivered_at: payload.delivered_at,
            nb_cartons_received: payload.nb_cartons_received,
            nb_sachets_received: payload.nb_sachets_received,
            nb_barques_received: payload.nb_barques_received,
            pendingSync: !navigator.onLine,
          }
        : d
    ));

    // 2. Update IndexedDB cache
    await OfflineStorage.updateDelivery(deliveryId, {
      status: 'livre' as const,
      recipient_name: payload.recipient_name,
      recipient_signature: payload.recipient_signature,
      delivered_at: payload.delivered_at,
      nb_cartons_received: payload.nb_cartons_received,
      nb_sachets_received: payload.nb_sachets_received,
      nb_barques_received: payload.nb_barques_received,
    });

    if (navigator.onLine) {
      // 3a. Try direct update
      const { error } = await supabase.from('deliveries').update(payload).eq('id', deliveryId);
      if (error) {
        // Failed — enqueue for later
        await SyncQueue.enqueue(deliveryId, payload);
        const count = await SyncQueue.getPendingCount();
        setPendingCount(count);
        toast.warning('Erreur réseau — sauvegardé pour synchronisation');
      } else {
        toast.success('Livraison confirmée ✓');
        // Remove pendingSync flag
        setDeliveries(prev => prev.map(d =>
          d.id === deliveryId ? { ...d, pendingSync: false } : d
        ));
      }
    } else {
      // 3b. Queue for sync
      await SyncQueue.enqueue(deliveryId, payload);
      const count = await SyncQueue.getPendingCount();
      setPendingCount(count);
      toast.info('Sauvegardé hors-ligne — sera synchronisé au retour du réseau');
    }
  }, []);

  // ── Refetch (for realtime callbacks) ──
  const refetch = useCallback(() => {
    if (navigator.onLine) fetchFromServer();
  }, [fetchFromServer]);

  return {
    deliveries,
    pharmacyOrder,
    loading,
    isOnline,
    isSyncing,
    pendingCount,
    validateDelivery,
    syncPending,
    refetch,
  };
}
