import localforage from 'localforage';
import { supabase } from '@/integrations/supabase/client';

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
  };
  created_at: string;
  sync_status: SyncStatus;
  retry_count: number;
}

const MAX_RETRIES = 5;

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

  /** Sync all pending validations to Supabase */
  async syncAll(): Promise<{ synced: number; failed: number }> {
    const pending = await this.getPending();
    if (pending.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        // Check if delivery was already updated (idempotency)
        const { data: existing } = await supabase
          .from('deliveries')
          .select('status, updated_at')
          .eq('id', item.delivery_id)
          .single();

        if (existing) {
          // If already delivered and updated after our local change, skip (don't overwrite admin changes)
          if (existing.status === 'livre' && new Date(existing.updated_at) > new Date(item.created_at)) {
            item.sync_status = 'synced';
            await syncStore.setItem(item.id, item);
            synced++;
            continue;
          }
        }

        const { error } = await supabase
          .from('deliveries')
          .update(item.payload)
          .eq('id', item.delivery_id);

        if (error) {
          item.retry_count++;
          item.sync_status = item.retry_count >= MAX_RETRIES ? 'error' : 'pending';
          await syncStore.setItem(item.id, item);
          failed++;
        } else {
          item.sync_status = 'synced';
          await syncStore.setItem(item.id, item);
          synced++;
        }
      } catch {
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
