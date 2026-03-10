import localforage from 'localforage';
import { supabase } from '@/integrations/supabase/client';
import { generatePhotoPDF } from '@/lib/generate-receipt-pdf';

const syncStore = localforage.createInstance({ name: 'dpci', storeName: 'sync_queue' });

export type SyncStatus = 'pending' | 'synced' | 'error';

export interface PendingValidation {
  id: string;
  delivery_id: string;
  payload: {
    status: 'livre';
    recipient_name: string;
    recipient_signature: string | null;
    delivered_at: string;
    nb_cartons_received: number;
    nb_sachets_received: number;
    nb_barques_received: number;
    driver_latitude?: number;
    driver_longitude?: number;
    verification_code?: string;
    offline_photo?: string; // base64 photo taken offline
  };
  created_at: string;
  sync_status: SyncStatus;
  retry_count: number;
}

const MAX_RETRIES = 10;

async function getAllItems(): Promise<PendingValidation[]> {
  const items: PendingValidation[] = [];
  await syncStore.iterate<PendingValidation, void>((value) => {
    items.push(value);
  });
  return items;
}

export const SyncQueue = {
  /** Add a validation to the queue */
  async enqueue(deliveryId: string, payload: PendingValidation['payload']): Promise<PendingValidation> {
    // Check if there's already a pending entry for this delivery (avoid duplicates)
    const existing = await this.getPending();
    const duplicate = existing.find(e => e.delivery_id === deliveryId);
    if (duplicate) {
      // Update the existing entry with the latest payload
      duplicate.payload = payload;
      duplicate.retry_count = 0;
      duplicate.sync_status = 'pending';
      await syncStore.setItem(duplicate.id, duplicate);
      return duplicate;
    }

    const entry: PendingValidation = {
      id: crypto.randomUUID(),
      delivery_id: deliveryId,
      payload,
      created_at: new Date().toISOString(),
      sync_status: 'pending',
      retry_count: 0,
    };
    await syncStore.setItem(entry.id, entry);
    return entry;
  },

  /** Get all pending validations */
  async getPending(): Promise<PendingValidation[]> {
    const all = await getAllItems();
    return all.filter(i => i.sync_status === 'pending');
  },

  /** Get count of pending validations */
  async getPendingCount(): Promise<number> {
    return (await this.getPending()).length;
  },

  /** Get all items (for debugging) */
  async getAll(): Promise<PendingValidation[]> {
    return getAllItems();
  },

  /** Get delivery IDs that have pending validations */
  async getPendingDeliveryIds(): Promise<Set<string>> {
    const pending = await this.getPending();
    return new Set(pending.map(p => p.delivery_id));
  },

  /** Sync all pending validations to Supabase — one by one (progressive) */
  async syncAll(): Promise<{ synced: number; failed: number }> {
    const pending = await this.getPending();
    if (pending.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    // Process sequentially — one at a time to avoid overwhelming the network
    for (const item of pending) {
      // Abort if we went offline mid-sync
      if (!navigator.onLine) {
        failed += pending.length - synced - failed;
        break;
      }

      try {
        // Check if delivery was already marked as delivered (idempotency via delivery_id)
        const { data: existing } = await supabase
          .from('deliveries')
          .select('status')
          .eq('id', item.delivery_id)
          .single();

        if (existing && existing.status === 'livre') {
          // Already delivered — mark as synced, remove from queue
          item.sync_status = 'synced';
          await syncStore.removeItem(item.id);
          synced++;
          continue;
        }

        // Build the update payload (strip offline_photo — not a DB column)
        const { offline_photo, ...dbPayload } = item.payload;

        const { error } = await supabase
          .from('deliveries')
          .update(dbPayload)
          .eq('id', item.delivery_id);

        if (error) {
          console.error(`[SyncQueue] Failed to sync ${item.delivery_id}:`, error.message);
          item.retry_count++;
          item.sync_status = item.retry_count >= MAX_RETRIES ? 'error' : 'pending';
          await syncStore.setItem(item.id, item);
          failed++;
        } else {
          // Success — remove from local storage immediately
          await syncStore.removeItem(item.id);
          synced++;
        }
      } catch (err) {
        console.error(`[SyncQueue] Network error for ${item.delivery_id}:`, err);
        item.retry_count++;
        item.sync_status = item.retry_count >= MAX_RETRIES ? 'error' : 'pending';
        await syncStore.setItem(item.id, item);
        failed++;
      }
    }

    return { synced, failed };
  },

  /** Clear synced items older than 24h */
  async cleanup(): Promise<void> {
    const all = await getAllItems();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const item of all) {
      if (item.sync_status === 'synced' && new Date(item.created_at).getTime() < cutoff) {
        await syncStore.removeItem(item.id);
      }
    }
  },
};
