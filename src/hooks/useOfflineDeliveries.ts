import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { OfflineStorage, AxisPharmacy } from '@/services/offlineStorage';
import { SyncQueue, PendingValidation } from '@/services/syncQueue';
import { AppNotifications } from '@/services/notifications';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';

type Delivery = Database['public']['Tables']['deliveries']['Row'];
type Pharmacy = Database['public']['Tables']['pharmacies']['Row'];

export type EnrichedDelivery = Delivery & { pharmacy?: Pharmacy; pendingSync?: boolean };

interface UseOfflineDeliveriesOptions {
  userId: string | undefined;
}

const SYNC_RETRY_INTERVAL = 30_000; // Retry sync every 30s if pending items exist

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
  const deliveriesRef = useRef(deliveries);
  deliveriesRef.current = deliveries;

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
    if (!userIdRef.current || !navigator.onLine) return false;
    try {
      const [delRes, pharRes, axisRes] = await Promise.all([
        supabase.from('deliveries').select('*').eq('driver_id', userIdRef.current).order('created_at', { ascending: false }),
        supabase.from('pharmacies').select('*'),
        supabase.from('axis_pharmacies').select('*').order('position', { ascending: true }),
      ]);

      const dels = delRes.data || [];
      const phars = pharRes.data || [];
      const axisData = (axisRes.data || []).map(a => ({ pharmacy_id: a.pharmacy_id, position: a.position }));

      // Detect new deliveries for notification
      const oldPendingIds = new Set(deliveriesRef.current.filter(d => d.status === 'en_attente').map(d => d.id));
      const newPending = dels.filter(d => d.status === 'en_attente' && !oldPendingIds.has(d.id));
      if (newPending.length > 0 && deliveriesRef.current.length > 0) {
        AppNotifications.newDeliveries(newPending.length);
      }

      // Persist to IndexedDB for offline access
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
      // Network error — keep existing cached data, don't clear state
      return false;
    }
  }, [enrichDeliveries, buildOrderMap]);

  // Stable refs for event listeners (avoid stale closures)
  const fetchFromServerRef = useRef(fetchFromServer);
  fetchFromServerRef.current = fetchFromServer;

  // ── Sync pending validations ──
  const syncPending = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    
    const count = await SyncQueue.getPendingCount();
    if (count === 0) {
      setPendingCount(0);
      return;
    }

    syncingRef.current = true;
    setIsSyncing(true);

    try {
      const { synced, failed } = await SyncQueue.syncAll();
      if (synced > 0) {
        toast.success(`${synced} livraison${synced > 1 ? 's' : ''} synchronisée${synced > 1 ? 's' : ''}`);
        AppNotifications.syncSuccess(synced);
      }
      if (failed > 0) {
        toast.error(`${failed} livraison${failed > 1 ? 's' : ''} en échec de synchronisation`);
        AppNotifications.syncError(failed);
      }

      // Refresh data from server after sync to get authoritative state
      if (synced > 0) {
        await fetchFromServerRef.current();
      }

      await SyncQueue.cleanup();

      const remaining = await SyncQueue.getPendingCount();
      setPendingCount(remaining);
    } finally {
      setIsSyncing(false);
      syncingRef.current = false;
    }
  }, []);

  const syncPendingRef = useRef(syncPending);
  syncPendingRef.current = syncPending;

  // ── Online/offline listener ──
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      toast.success('Connexion rétablie — synchronisation en cours…');
      AppNotifications.online();
      // Auto-sync + refresh on reconnect — no manual refresh needed
      syncPendingRef.current().then(() => fetchFromServerRef.current());
    };
    const onOffline = () => {
      setIsOnline(false);
      toast.warning('Mode hors-ligne activé');
      AppNotifications.offline();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ── Periodic sync retry: catches cases where online event fires but sync fails ──
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!navigator.onLine) return;
      const count = await SyncQueue.getPendingCount();
      setPendingCount(count);
      if (count > 0) {
        syncPendingRef.current();
      }
    }, SYNC_RETRY_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // ── Initial load: cache first, then server ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Request notification permission early
      AppNotifications.requestPermission();

      // 1. Hydrate from IndexedDB immediately (works offline)
      await loadFromCache();

      // 2. Update pending count from queue
      const count = await SyncQueue.getPendingCount();
      if (!cancelled) setPendingCount(count);

      // 3. If online, sync pending + fetch fresh data
      if (navigator.onLine && userIdRef.current) {
        await syncPendingRef.current();
        await fetchFromServerRef.current();
      }

      if (!cancelled) setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validate a delivery (works 100% offline) ──
  const validateDelivery = useCallback(async (
    deliveryId: string,
    payload: PendingValidation['payload'],
  ) => {
    // 1. Optimistic update in React state — immediate UI feedback
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
            pendingSync: true, // Always mark as pending initially
          }
        : d
    ));

    // 2. Update IndexedDB cache — survives app close/reopen
    await OfflineStorage.updateDelivery(deliveryId, {
      status: 'livre' as const,
      recipient_name: payload.recipient_name,
      recipient_signature: payload.recipient_signature,
      delivered_at: payload.delivered_at,
      nb_cartons_received: payload.nb_cartons_received,
      nb_sachets_received: payload.nb_sachets_received,
      nb_barques_received: payload.nb_barques_received,
    });

    // 3. Always enqueue first for safety (idempotent sync handles duplicates)
    await SyncQueue.enqueue(deliveryId, payload);
    const count = await SyncQueue.getPendingCount();
    setPendingCount(count);

    if (navigator.onLine) {
      // 4. If online, attempt immediate sync
      toast.info('Envoi en cours…');
      // Small delay to ensure queue entry is persisted
      setTimeout(() => syncPendingRef.current(), 100);
    } else {
      toast.info('Sauvegardé hors-ligne — sera synchronisé automatiquement');
    }
  }, []);

  // ── Refetch (for realtime callbacks) ──
  const refetch = useCallback(() => {
    if (navigator.onLine) fetchFromServerRef.current();
  }, []);

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
