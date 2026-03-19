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
  delivery_id: string;
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

export const SyncQueue = {
  /**
   * Add a validation to the queue.
   * Photo is stored separately in its own IndexedDB store to keep the queue lightweight.
   */
  async enqueue(
    deliveryId: string,
    reference: string,
    payload: PendingValidation['payload'],
    offlinePhoto?: string | null
  ): Promise<PendingValidation> {
    // Store photo separately if provided
    if (offlinePhoto) {
      await photoStore.setItem(deliveryId, offlinePhoto);
      console.log(`[SyncQueue] Photo stored for delivery ${deliveryId} (${Math.round(offlinePhoto.length / 1024)}KB)`);
    }

    const all = await getAllItems();
    const existing = all.find(e => e.delivery_id === deliveryId && e.sync_status === 'pending');

    const payloadWithFlag = {
      ...payload,
      has_offline_photo: !!offlinePhoto,
    };

    if (existing) {
      const existingTime = new Date(existing.payload.delivered_at).getTime();
      const newTime = new Date(payload.delivered_at).getTime();
      if (newTime >= existingTime) {
        existing.payload = payloadWithFlag;
        existing.reference = reference;
        existing.retry_count = 0;
        existing.last_error = undefined;
        await syncStore.setItem(existing.id, existing);
      }
      return existing;
    }

    const entry: PendingValidation = {
      id: crypto.randomUUID(),
      delivery_id: deliveryId,
      reference,
      payload: payloadWithFlag,
      created_at: new Date().toISOString(),
      sync_status: 'pending',
      retry_count: 0,
    };
    await syncStore.setItem(entry.id, entry);
    console.log(`[SyncQueue] Enqueued delivery ${deliveryId} (ref: ${reference})`);
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

  /** Check if a specific delivery has a stored photo */
  async hasPhoto(deliveryId: string): Promise<boolean> {
    const photo = await photoStore.getItem<string>(deliveryId);
    return !!photo;
  },

  /**
   * Sync all pending validations to Supabase — sequentially.
   * For each item with a photo:
   *   1. Convert photo → PDF (client-side via jsPDF)
   *   2. Upload PDF to Supabase Storage
   *   3. Update delivery record with status + receipt_pdf_url
   *   4. Only delete local data after confirmed success
   */
  async syncAll(): Promise<{ synced: number; failed: number }> {
    const pending = await this.getPending();
    if (pending.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      // Abort if we went offline mid-sync
      if (!navigator.onLine) {
        failed += pending.length - synced - failed;
        break;
      }

      try {
        // ── Idempotency check ──
        const { data: existing } = await supabase
          .from('deliveries')
          .select('status, delivered_at')
          .eq('id', item.delivery_id)
          .single();

        if (existing && existing.status === 'livre') {
          const serverTime = existing.delivered_at ? new Date(existing.delivered_at).getTime() : 0;
          const localTime = new Date(item.payload.delivered_at).getTime();

          if (serverTime >= localTime) {
            // Already synced — clean up local data
            await syncStore.removeItem(item.id);
            await photoStore.removeItem(item.delivery_id);
            await addLog({
              delivery_id: item.delivery_id,
              reference: item.reference,
              action: 'skipped_duplicate',
              message: `Livraison déjà validée sur le serveur (serveur: ${existing.delivered_at})`,
            });
            synced++;
            continue;
          }
        }

        // ── Process offline photo → PDF ──
        const { has_offline_photo, ...restPayload } = item.payload;
        let receiptPdfUrl: string | null = null;

        if (has_offline_photo) {
          const photoBase64 = await photoStore.getItem<string>(item.delivery_id);
          
          if (photoBase64) {
            try {
              console.log(`[SyncQueue] Converting photo to PDF for ${item.delivery_id}...`);
              
              // Generate PDF from photo (jsPDF)
              const pdfDataUrl = await generatePhotoPDF(photoBase64, item.reference, item.payload.delivered_at);
              const pdfBlob = dataUrlToBlob(pdfDataUrl);
              
              console.log(`[SyncQueue] PDF generated (${Math.round(pdfBlob.size / 1024)}KB), uploading...`);

              // Upload PDF to Supabase Storage
              const fileName = `bon-livraison-${item.delivery_id}.pdf`;
              const { error: uploadError } = await supabase.storage
                .from('delivery-receipts')
                .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true });

              if (!uploadError) {
                const { data: urlData } = supabase.storage
                  .from('delivery-receipts')
                  .getPublicUrl(fileName);
                receiptPdfUrl = urlData.publicUrl;
                console.log(`[SyncQueue] PDF uploaded successfully: ${receiptPdfUrl}`);
              } else {
                console.error(`[SyncQueue] PDF upload failed for ${item.delivery_id}:`, uploadError.message);
                // Don't block — continue without PDF URL, retry will handle it
              }
            } catch (pdfErr) {
              console.error(`[SyncQueue] PDF generation/upload failed for ${item.delivery_id}:`, pdfErr);
              // Don't block the delivery update if PDF fails
            }
          } else {
            console.warn(`[SyncQueue] Photo not found in store for ${item.delivery_id}`);
          }
        }

        // ── Update delivery in database ──
        const updatePayload: Record<string, unknown> = { ...restPayload };
        if (receiptPdfUrl) {
          updatePayload.receipt_pdf_url = receiptPdfUrl;
        }

        const { error } = await supabase
          .from('deliveries')
          .update(updatePayload)
          .eq('id', item.delivery_id);

        if (error) {
          item.retry_count++;
          item.last_error = error.message;
          item.sync_status = item.retry_count >= MAX_RETRIES ? 'error' : 'pending';
          await syncStore.setItem(item.id, item);
          await addLog({
            delivery_id: item.delivery_id,
            reference: item.reference,
            action: 'error',
            message: `Échec sync (tentative ${item.retry_count}/${MAX_RETRIES}): ${error.message}`,
          });
          failed++;
        } else {
          // ✅ Success — remove from queue AND remove stored photo
          await syncStore.removeItem(item.id);
          await photoStore.removeItem(item.delivery_id);
          await addLog({
            delivery_id: item.delivery_id,
            reference: item.reference,
            action: 'synced',
            message: `Synchronisée avec succès${receiptPdfUrl ? ' (PDF uploadé)' : ''}`,
          });
          synced++;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Erreur réseau';
        item.retry_count++;
        item.last_error = errMsg;
        item.sync_status = item.retry_count >= MAX_RETRIES ? 'error' : 'pending';
        await syncStore.setItem(item.id, item);
        await addLog({
          delivery_id: item.delivery_id,
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
        await photoStore.removeItem(item.delivery_id);
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
