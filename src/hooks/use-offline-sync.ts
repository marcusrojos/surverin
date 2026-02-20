import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PendingDelivery {
  id: string;
  deliveryId: string;
  reference: string;
  recipientName: string;
  recipientSignature: string | null;
  deliveredAt: string;
  timestamp: number;
  nb_cartons_received?: number;
  nb_sachets_received?: number;
  nb_barques_received?: number;
}

const STORAGE_KEY = 'dpci_pending_deliveries';

function getPendingFromStorage(): PendingDelivery[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePendingToStorage(pending: PendingDelivery[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingDeliveries, setPendingDeliveries] = useState<PendingDelivery[]>(getPendingFromStorage);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); toast.success('Connexion rétablie — synchronisation en cours…'); };
    const handleOffline = () => { setIsOnline(false); toast.warning('Mode hors-ligne activé'); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  const syncPending = useCallback(async () => {
    const pending = getPendingFromStorage();
    if (pending.length === 0 || syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    const remaining: PendingDelivery[] = [];
    for (const item of pending) {
      try {
        const { error } = await supabase.from('deliveries').update({
          status: 'livre' as const,
          recipient_name: item.recipientName,
          recipient_signature: item.recipientSignature,
          delivered_at: item.deliveredAt,
          nb_cartons_received: item.nb_cartons_received ?? null,
          nb_sachets_received: item.nb_sachets_received ?? null,
          nb_barques_received: item.nb_barques_received ?? null,
        }).eq('id', item.deliveryId);
        if (error) { remaining.push(item); }
      } catch { remaining.push(item); }
    }
    savePendingToStorage(remaining);
    setPendingDeliveries(remaining);
    setIsSyncing(false);
    syncingRef.current = false;
    const synced = pending.length - remaining.length;
    if (synced > 0) toast.success(`${synced} livraison${synced > 1 ? 's' : ''} synchronisée${synced > 1 ? 's' : ''}`);
    if (remaining.length > 0) toast.error(`${remaining.length} livraison${remaining.length > 1 ? 's' : ''} en échec`);
  }, []);

  useEffect(() => { if (isOnline) syncPending(); }, [isOnline, syncPending]);

  const queueDelivery = useCallback((delivery: Omit<PendingDelivery, 'id' | 'timestamp'>) => {
    const entry: PendingDelivery = { ...delivery, id: crypto.randomUUID(), timestamp: Date.now() };
    const updated = [...getPendingFromStorage(), entry];
    savePendingToStorage(updated);
    setPendingDeliveries(updated);
    return entry;
  }, []);

  return { isOnline, isSyncing, pendingDeliveries, queueDelivery, syncPending };
}
