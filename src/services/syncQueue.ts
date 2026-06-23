import localforage from 'localforage';
import { supabase } from '@/integrations/supabase/client';
import { generatePhotoPDF } from '@/lib/generate-receipt-pdf';

// ── Stores ──
const syncStore = localforage.createInstance({ name: 'dpci', storeName: 'sync_queue' });
const photoStore = localforage.createInstance({ name: 'dpci', storeName: 'sync_photos' });
const logStore = localforage.createInstance({ name: 'dpci', storeName: 'sync_logs' });

export type SyncStatus = 'pending' | 'synced' | 'error';

export interface PendingValidation {
  id: string;
  delivery_id: string | null;
  pharmacy_id: string;
  parcours_id: string;
  driver_id: string;
  payload: {
    status: 'livre';
    recipient_name: string;
    recipient_signature: string | null;
    delivered_at: string;
    nb_cartons_received?: number | null;
    nb_sachets_received?: number | null;
    nb_barques_received?: number | null;
    driver_latitude?: number | null;
    driver_longitude?: number | null;
    verification_code?: string;
    // Photo is stored separately in photoStore to avoid serialization issues
    has_offline_photo?: boolean;
  };
  reference: string;
  created_at: string;
  sync_status: SyncStatus;
  retry_count: number;
  last_error?: string;
}

export interface SyncLogEntry {
  id: string;
  delivery_id: string;
  reference: string;
  action: 'synced' | 'error' | 'skipped_duplicate';
  message: string;
  timestamp: string;
}

const MAX_RETRIES = 10;

type QueueMetadata = {
  pharmacy_id: string;
  parcours_id: string;
  driver_id: string;
};

// ── Helpers ──

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function getAllItems(): Promise<PendingValidation[]> {
  const items: PendingValidation[] = [];
  await syncStore.iterate<PendingValidation, void>((value) => {
    items.push(value);
  });
  return items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

async function addLog(entry: Omit<SyncLogEntry, 'id' | 'timestamp'>): Promise<void> {
  const log: SyncLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  await logStore.setItem(log.id, log);
  console.log(`[SyncQueue] ${entry.action}: ${entry.message} (delivery: ${entry.delivery_id})`);
}

function getSyncKey(item: Pick<PendingValidation, 'delivery_id' | 'pharmacy_id' | 'parcours_id'>): string {
  return item.delivery_id ?? `${item.parcours_id}:${item.pharmacy_id}`;
}

async function storePhoto(entryId: string, offlinePhoto?: string | null): Promise<void> {
  if (!offlinePhoto) return;
  await photoStore.setItem(entryId, offlinePhoto);
  console.log(`[SyncQueue] Photo stored for queue ${entryId} (${Math.round(offlinePhoto.length / 1024)}KB)`);
}

async function resolveTargetDelivery(item: PendingValidation): Promise<{
  deliveryId: string;
  existingStatus: string | null;
  existingDeliveredAt: string | null;
}> {
  if (item.delivery_id) {
    const { data, error } = await supabase
      .from('deliveries')
      .select('id, status, delivered_at')
      .eq('id', item.delivery_id)
      .maybeSingle();

    if (error) throw error;

    if (data?.id) {
      return {
        deliveryId: data.id,
        existingStatus: data.status,
        existingDeliveredAt: data.delivered_at,
      };
    }
  }

  const { data: existingByRoute, error: lookupError } = await supabase
    .from('deliveries')
    .select('id, status, delivered_at')
    .eq('parcours_id', item.parcours_id)
    .eq('pharmacy_id', item.pharmacy_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existingByRoute?.id) {
    item.delivery_id = existingByRoute.id;
    await syncStore.setItem(item.id, item);
    return {
      deliveryId: existingByRoute.id,
      existingStatus: existingByRoute.status,
      existingDeliveredAt: existingByRoute.delivered_at,
    };
  }

  const { data: pharmacyForSite } = await supabase
    .from('pharmacies')
    .select('site_id')
    .eq('id', item.pharmacy_id)
    .maybeSingle();

  const { data: created, error: createError } = await supabase
    .from('deliveries')
    .insert({
      parcours_id: item.parcours_id,
      pharmacy_id: item.pharmacy_id,
      driver_id: item.driver_id,
      reference: item.reference,
      status: 'en_attente',
      site_id: (pharmacyForSite as any)?.site_id ?? null,
    })
    .select('id, status, delivered_at')
    .single();

  if (createError) throw createError;

  item.delivery_id = created.id;
  await syncStore.setItem(item.id, item);

  return {
    deliveryId: created.id,
    existingStatus: created.status,
    existingDeliveredAt: created.delivered_at,
  };
}

export const SyncQueue = {
  /**
   * Add a validation to the queue.
   * Photo is stored separately in its own IndexedDB store to keep the queue lightweight.
   */
  async enqueue(
    deliveryId: string | null,
    reference: string,
    payload: PendingValidation['payload'],
    offlinePhoto?: string | null,
    metadata?: QueueMetadata,
  ): Promise<PendingValidation> {
    if (!metadata) {
      throw new Error('Queue metadata is required for offline delivery sync');
    }

    const all = await getAllItems();
    const syncKey = deliveryId ?? `${metadata.parcours_id}:${metadata.pharmacy_id}`;
    const existing = all.find(e => e.sync_status === 'pending' && getSyncKey(e) === syncKey);

    const payloadWithFlag = {
      ...payload,
      has_offline_photo: !!offlinePhoto,
    };

    if (existing) {
      const existingTime = new Date(existing.payload.delivered_at).getTime();
      const newTime = new Date(payload.delivered_at).getTime();
      if (newTime >= existingTime) {
        existing.delivery_id = deliveryId ?? existing.delivery_id;
        existing.reference = reference;
        existing.pharmacy_id = metadata.pharmacy_id;
        existing.parcours_id = metadata.parcours_id;
        existing.driver_id = metadata.driver_id;
        existing.payload = payloadWithFlag;
        existing.retry_count = 0;
        existing.last_error = undefined;
        await syncStore.setItem(existing.id, existing);
        await storePhoto(existing.id, offlinePhoto);
      }
      return existing;
    }

    const entry: PendingValidation = {
      id: crypto.randomUUID(),
      delivery_id: deliveryId,
      pharmacy_id: metadata.pharmacy_id,
      parcours_id: metadata.parcours_id,
      driver_id: metadata.driver_id,
      reference,
      payload: payloadWithFlag,
      created_at: new Date().toISOString(),
      sync_status: 'pending',
      retry_count: 0,
    };

    await syncStore.setItem(entry.id, entry);
    await storePhoto(entry.id, offlinePhoto);
    console.log(`[SyncQueue] Enqueued delivery ${deliveryId ?? syncKey} (ref: ${reference})`);
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
    return new Set(pending.map(p => p.delivery_id).filter((id): id is string => !!id));
  },

  /** Check if a specific queue item has a stored photo */
  async hasPhoto(entryId: string): Promise<boolean> {
    const photo = await photoStore.getItem<string>(entryId);
    return !!photo;
  },

  /**
   * Sync all pending validations to Supabase — sequentially.
   * For each item with a photo:
   *   1. Resolve or create the server delivery record
   *   2. Convert photo → PDF (client-side via jsPDF)
   *   3. Upload PDF to Supabase Storage
   *   4. Update delivery record with status + receipt_pdf_url
   *   5. Only delete local data after confirmed success
   */
  async syncAll(): Promise<{ synced: number; failed: number }> {
    const pending = await this.getPending();
    if (pending.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      if (!navigator.onLine) {
        failed += pending.length - synced - failed;
        break;
      }

      try {
        const { deliveryId, existingStatus, existingDeliveredAt } = await resolveTargetDelivery(item);

        if (existingStatus === 'livre') {
          const serverTime = existingDeliveredAt ? new Date(existingDeliveredAt).getTime() : 0;
          const localTime = new Date(item.payload.delivered_at).getTime();

          if (serverTime >= localTime) {
            await syncStore.removeItem(item.id);
            await photoStore.removeItem(item.id);
            await addLog({
              delivery_id: deliveryId,
              reference: item.reference,
              action: 'skipped_duplicate',
              message: `Livraison déjà validée sur le serveur (serveur: ${existingDeliveredAt})`,
            });
            synced++;
            continue;
          }
        }

        const { has_offline_photo, ...restPayload } = item.payload;
        let receiptPdfUrl: string | null = null;

        if (has_offline_photo) {
          const photoBase64 = await photoStore.getItem<string>(item.id);

          if (!photoBase64) {
            throw new Error('Photo locale introuvable pour la synchronisation');
          }

          console.log(`[SyncQueue] Converting photo to PDF for ${deliveryId}...`);
          const pdfDataUrl = await generatePhotoPDF(photoBase64, item.reference, item.payload.delivered_at);
          const pdfBlob = dataUrlToBlob(pdfDataUrl);

          console.log(`[SyncQueue] PDF generated (${Math.round(pdfBlob.size / 1024)}KB), uploading...`);

          const fileName = `bon-livraison-${deliveryId}.pdf`;
          const { error: uploadError } = await supabase.storage
            .from('delivery-receipts')
            .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true });

          if (uploadError) {
            throw new Error(uploadError.message);
          }

          const { data: urlData } = supabase.storage
            .from('delivery-receipts')
            .getPublicUrl(fileName);
          receiptPdfUrl = urlData.publicUrl;
          console.log(`[SyncQueue] PDF uploaded successfully: ${receiptPdfUrl}`);
        }

        const updatePayload: Record<string, unknown> = {
          ...restPayload,
          driver_id: item.driver_id,
        };

        if (receiptPdfUrl) {
          updatePayload.receipt_pdf_url = receiptPdfUrl;
        }

        const { error } = await supabase
          .from('deliveries')
          .update(updatePayload)
          .eq('id', deliveryId);

        if (error) {
          throw error;
        }

        await syncStore.removeItem(item.id);
        await photoStore.removeItem(item.id);
        await addLog({
          delivery_id: deliveryId,
          reference: item.reference,
          action: 'synced',
          message: `Synchronisée avec succès${receiptPdfUrl ? ' (PDF uploadé)' : ''}`,
        });
        synced++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Erreur réseau';
        item.retry_count++;
        item.last_error = errMsg;
        item.sync_status = item.retry_count >= MAX_RETRIES ? 'error' : 'pending';
        await syncStore.setItem(item.id, item);
        await addLog({
          delivery_id: item.delivery_id ?? `${item.parcours_id}:${item.pharmacy_id}`,
          reference: item.reference,
          action: 'error',
          message: `Erreur réseau (tentative ${item.retry_count}/${MAX_RETRIES}): ${errMsg}`,
        });
        failed++;
      }
    }

    return { synced, failed };
  },

  /** Get sync logs (most recent first, max 100) */
  async getLogs(): Promise<SyncLogEntry[]> {
    const logs: SyncLogEntry[] = [];
    await logStore.iterate<SyncLogEntry, void>((value) => {
      logs.push(value);
    });
    return logs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 100);
  },

  /** Clear synced/error items and old logs */
  async cleanup(): Promise<void> {
    const all = await getAllItems();
    for (const item of all) {
      if (item.sync_status === 'synced' || item.sync_status === 'error') {
        await syncStore.removeItem(item.id);
        await photoStore.removeItem(item.id);
      }
    }
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const logs: SyncLogEntry[] = [];
    await logStore.iterate<SyncLogEntry, void>((value) => { logs.push(value); });
    for (const log of logs) {
      if (new Date(log.timestamp).getTime() < cutoff) {
        await logStore.removeItem(log.id);
      }
    }
  },
};