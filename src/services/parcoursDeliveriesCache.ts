import localforage from 'localforage';
import { supabase } from '@/integrations/supabase/client';

export interface PharmacyDelivery {
  pharmacyId: string;
  pharmacyName: string;
  pharmacyAddress: string | null;
  pharmacyLatitude: number | null;
  pharmacyLongitude: number | null;
  position: number;
  colis: { id: string; barcode: string; type: string }[];
  deliveryId: string | null;
  deliveryStatus: string | null;
  deliveryReference: string | null;
  deliveredAt: string | null;
  recipientName: string | null;
  hasVerificationCode: boolean;
  nb_cartons: number;
  nb_sachets: number;
  nb_barques: number;
  bacsToRecover: number;
}

const parcoursCacheStore = localforage.createInstance({ name: 'dpci', storeName: 'parcours_deliveries_cache' });

const cacheKey = (parcoursId: string) => `parcours_${parcoursId}`;

function buildMappedData(
  ppData: { id: string; pharmacy_id: string; position: number }[],
  pharmData: { id: string; name: string; address: string | null; latitude: number | null; longitude: number | null }[],
  colisData: { id: string; barcode: string; type: string; parcours_pharmacy_id: string }[],
  delivData: { id: string; pharmacy_id: string; status: string; reference: string; delivered_at: string | null; recipient_name: string | null; has_verification_code: boolean | null }[],
  bacsBalanceMap: Map<string, number>,
): PharmacyDelivery[] {
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
      hasVerificationCode: !!deliv?.has_verification_code,
      nb_cartons: colis.filter(c => c.type === 'carton').length,
      nb_sachets: colis.filter(c => c.type === 'sachet').length,
      nb_barques: colis.filter(c => c.type === 'bac' || c.type === 'barque').length,
      bacsToRecover: bacsBalanceMap.get(pp.pharmacy_id) || 0,
    };
  });
}

export async function saveCachedParcoursDeliveries(parcoursId: string, data: PharmacyDelivery[]): Promise<void> {
  await parcoursCacheStore.setItem(cacheKey(parcoursId), { data, cachedAt: Date.now() });
}

export async function loadCachedParcoursDeliveries(parcoursId: string): Promise<PharmacyDelivery[] | null> {
  const cached = await parcoursCacheStore.getItem<{ data: PharmacyDelivery[]; cachedAt: number }>(cacheKey(parcoursId));
  return cached?.data || null;
}

export async function fetchAndCacheParcoursDeliveries(parcoursId: string): Promise<PharmacyDelivery[]> {
  const { data: ppData, error: ppError } = await supabase
    .from('parcours_pharmacies')
    .select('id, pharmacy_id, position')
    .eq('parcours_id', parcoursId)
    .order('position', { ascending: true });

  if (ppError) throw ppError;
  if (!ppData || ppData.length === 0) {
    await saveCachedParcoursDeliveries(parcoursId, []);
    return [];
  }

  const pharmacyIds = ppData.map(pp => pp.pharmacy_id);
  const ppIds = ppData.map(pp => pp.id);

  const [pharmRes, colisRes, delivRes, bacsRes] = await Promise.all([
    supabase.from('pharmacies').select('id, name, address, latitude, longitude').in('id', pharmacyIds),
    supabase.from('parcours_colis').select('id, barcode, type, parcours_pharmacy_id').in('parcours_pharmacy_id', ppIds),
    supabase.from('deliveries').select('id, pharmacy_id, status, reference, delivered_at, recipient_name, has_verification_code').eq('parcours_id', parcoursId),
    supabase.from('pharmacy_bacs_balance').select('pharmacy_id, pending_bacs').in('pharmacy_id', pharmacyIds),
  ]);

  if (pharmRes.error) throw pharmRes.error;
  if (colisRes.error) throw colisRes.error;
  if (delivRes.error) throw delivRes.error;
  if (bacsRes.error) throw bacsRes.error;

  const bacsBalanceMap = new Map<string, number>();
  (bacsRes.data || []).forEach((b: any) => bacsBalanceMap.set(b.pharmacy_id, b.pending_bacs));

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
      has_verification_code: d.has_verification_code,
    })),
    bacsBalanceMap,
  );

  await saveCachedParcoursDeliveries(parcoursId, mapped);
  return mapped;
}