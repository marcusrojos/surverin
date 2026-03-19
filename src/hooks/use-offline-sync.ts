import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { compressImage } from '@/lib/image-compress';
import { generatePhotoPDF } from '@/lib/generate-receipt-pdf';

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
  /** Base64 photo of the paper receipt (offline mode) */
  offlinePhoto?: string | null;
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

/**
 * Convert a base64 data-url to a Blob.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
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
        let receiptPdfUrl: string | null = null;

        // If there's an offline photo, compress it, generate PDF and upload
        if (item.offlinePhoto) {
          try {
            // 1. Compress the photo
            const photoBlob = dataUrlToBlob(item.offlinePhoto);
            const compressed = await compressImage(photoBlob, { maxSize: 1024 * 1024, quality: 0.7 });

            // 2. Generate PDF from compressed image
            const compressedDataUrl = compressed.dataUrl;
            const pdfDataUrl = await generatePhotoPDF(compressedDataUrl, item.reference, item.deliveredAt);

            // 3. Convert PDF data-url to blob
            const pdfBlob = dataUrlToBlob(pdfDataUrl);

            // 4. Upload PDF to Supabase Storage
            const fileName = `offline-${item.deliveryId}-${Date.now()}.pdf`;
            const { error: uploadError } = await supabase.storage
              .from('delivery-receipts')
              .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true });

            if (!uploadError) {
              const { data: urlData } = supabase.storage.from('delivery-receipts').getPublicUrl(fileName);
              receiptPdfUrl = urlData?.publicUrl || null;
            }
          } catch (photoErr) {
            console.error('[sync] Photo/PDF upload failed:', photoErr);
            // Continue with delivery update even if photo fails
          }
        }

        const updatePayload: Record<string, unknown> = {
          status: 'livre' as const,
          recipient_name: item.recipientName,
          recipient_signature: item.recipientSignature,
          delivered_at: item.deliveredAt,
          nb_cartons_received: item.nb_cartons_received ?? null,
          nb_sachets_received: item.nb_sachets_received ?? null,
          nb_barques_received: item.nb_barques_received ?? null,
        };

        if (receiptPdfUrl) {
          updatePayload.receipt_pdf_url = receiptPdfUrl;
        }

        const { error } = await supabase.from('deliveries').update(updatePayload).eq('id', item.deliveryId);
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
