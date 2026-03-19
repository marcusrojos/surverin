import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { SyncQueue, type PendingValidation } from '@/services/syncQueue';

export type { PendingValidation };

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingDeliveries, setPendingDeliveries] = useState<PendingValidation[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  // Load pending items from IndexedDB on mount
  const refreshPending = useCallback(async () => {
    const items = await SyncQueue.getPending();
    setPendingDeliveries(items);
  }, []);

  useEffect(() => { refreshPending(); }, [refreshPending]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Connexion rétablie — synchronisation en cours…');
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Mode hors-ligne activé');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncPending = useCallback(async () => {
    if (syncingRef.current) return;
    const count = await SyncQueue.getPendingCount();
    if (count === 0) return;

    syncingRef.current = true;
    setIsSyncing(true);

    try {
      const { synced, failed } = await SyncQueue.syncAll();
      if (synced > 0) {
        toast.success(`${synced} livraison${synced > 1 ? 's' : ''} synchronisée${synced > 1 ? 's' : ''}`);
      }
      if (failed > 0) {
        toast.error(`${failed} livraison${failed > 1 ? 's' : ''} en échec — nouvelle tentative automatique`);
      }
    } catch (err) {
      console.error('[useOfflineSync] syncAll error:', err);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      await refreshPending();
    }
  }, [refreshPending]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) syncPending();
  }, [isOnline, syncPending]);

  // Periodic retry every 60s while online and items are pending
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(async () => {
      const count = await SyncQueue.getPendingCount();
      if (count > 0 && !syncingRef.current) {
        syncPending();
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [isOnline, syncPending]);

  const queueDelivery = useCallback(async (
    deliveryId: string,
    reference: string,
    payload: PendingValidation['payload']
  ) => {
    const entry = await SyncQueue.enqueue(deliveryId, reference, payload);
    await refreshPending();
    return entry;
  }, [refreshPending]);

  return { isOnline, isSyncing, pendingDeliveries, queueDelivery, syncPending };
}
