import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { generateReceiptPDF, downloadPdfFromUrl } from '@/lib/generate-receipt-pdf';
import { GEOFENCE_RADIUS } from '@/lib/geolocation';
import { Package, CheckCircle, FileText, Loader2, KeyRound, Barcode, Clock } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type Delivery = Database['public']['Tables']['deliveries']['Row'];
type Pharmacy = Database['public']['Tables']['pharmacies']['Row'];

export default function PharmacyDashboard() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<(Delivery & { pharmacy?: Pharmacy })[]>([]);
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data: pharData } = await supabase.from('pharmacies').select('*').eq('user_id', user.id).maybeSingle();
    setPharmacy(pharData);

    if (pharData) {
      const { data: delData } = await supabase.from('deliveries').select('*').eq('pharmacy_id', pharData.id).order('created_at', { ascending: false });
      setDeliveries((delData || []).map(d => ({ ...d, pharmacy: pharData })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleReceipt = async (d: Delivery & { pharmacy?: Pharmacy }) => {
    if (!d.pharmacy) return;
    try {
    // If delivery has a photo-based PDF (offline), download it directly
    if ((d as any).receipt_pdf_url) {
      await downloadPdfFromUrl(
        (d as any).receipt_pdf_url,
        `bon-livraison-${d.reference}.pdf`
      );
      return;
    }
    await generateReceiptPDF({
      reference: d.reference,
      pharmacyName: d.pharmacy.name,
      pharmacyAddress: d.pharmacy.address,
      pharmacyClientCode: d.pharmacy.client_code,
      recipientName: d.recipient_name || 'N/A',
      recipientSignature: d.recipient_signature,
      deliveredAt: d.delivered_at || d.updated_at,
      createdAt: d.created_at,
      verificationCode: d.verification_code,
      nb_cartons: d.nb_cartons,
      nb_sachets: d.nb_sachets,
      nb_barques: d.nb_barques,
      nb_cartons_received: d.nb_cartons_received,
      nb_sachets_received: d.nb_sachets_received,
      nb_barques_received: d.nb_barques_received,
      packages: Array.isArray(d.packages) ? d.packages as { type: string; reference: string }[] : [],
      pharmacyLatitude: d.pharmacy.latitude,
      pharmacyLongitude: d.pharmacy.longitude,
      driverLatitude: d.driver_latitude,
      driverLongitude: d.driver_longitude,
      geofenceRadius: GEOFENCE_RADIUS,
      isOffline: !d.driver_latitude && !d.driver_longitude,
    });
    } catch (err) {
      console.error('[PharmacyDashboard] Bon de livraison :', err);
      toast.error((err as Error)?.message || 'Génération du bon de livraison impossible');
    }
  };

  const pending = deliveries.filter(d => d.status === 'en_attente');
  const delivered = deliveries.filter(d => d.status === 'livre');

  return (
    <DashboardLayout requiredRole="pharmacie">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Mes livraisons</h1>
          {pharmacy && <p className="text-muted-foreground text-sm">{pharmacy.name} — {pharmacy.client_code}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <Package className="w-6 h-6 mx-auto mb-1 text-warning" />
              <p className="text-2xl font-bold">{pending.length}</p>
              <p className="text-xs text-muted-foreground">En attente</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <CheckCircle className="w-6 h-6 mx-auto mb-1 text-success" />
              <p className="text-2xl font-bold">{delivered.length}</p>
              <p className="text-xs text-muted-foreground">Reçues</p>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : deliveries.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Aucune livraison</p>
        ) : (
          <div className="space-y-3">
            {/* Pending deliveries first */}
            {pending.length > 0 && (
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">En attente ({pending.length})</p>
            )}
            {pending.map(d => (
              <DeliveryCard key={d.id} d={d} onReceipt={handleReceipt} />
            ))}

            {delivered.length > 0 && (
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4">Reçues ({delivered.length})</p>
            )}
            {delivered.map(d => (
              <DeliveryCard key={d.id} d={d} onReceipt={handleReceipt} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function DeliveryCard({ d, onReceipt }: { d: Delivery & { pharmacy?: Pharmacy }; onReceipt: (d: Delivery & { pharmacy?: Pharmacy }) => void }) {
  const packages = Array.isArray(d.packages) ? (d.packages as { barcode: string; type: string }[]) : [];

  return (
    <Card className="card-hover">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono font-medium text-sm truncate">{d.reference}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(d.created_at).toLocaleDateString('fr-FR')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={d.status} />
            {d.status === 'livre' && (
              <Button variant="ghost" size="icon" onClick={() => onReceipt(d)} title="Bon de livraison">
                <FileText className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Colis summary */}
        <div className="flex flex-wrap gap-2">
          {d.nb_cartons > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs">
              <Package className="w-3 h-3" /> {d.nb_cartons} carton{d.nb_cartons > 1 ? 's' : ''}
            </span>
          )}
          {d.nb_sachets > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs">
              {d.nb_sachets} sachet{d.nb_sachets > 1 ? 's' : ''}
            </span>
          )}
          {d.nb_barques > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs">
              {d.nb_barques} barque{d.nb_barques > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Barcodes list */}
        {packages.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Codes-barres</p>
            <div className="flex flex-wrap gap-1">
              {packages.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">
                  <Barcode className="w-2.5 h-2.5" />
                  {p.barcode}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Verification code - only for pending deliveries */}
        {d.status === 'en_attente' && d.verification_code && (
          <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
            <KeyRound className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-[10px] text-primary font-medium">Code de vérification</p>
              <p className="font-mono font-bold text-lg text-primary tracking-[0.3em]">{d.verification_code}</p>
            </div>
          </div>
        )}

        {/* Delivery info when delivered */}
        {d.status === 'livre' && d.delivered_at && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />
            Reçue le {new Date(d.delivered_at).toLocaleDateString('fr-FR')} à {new Date(d.delivered_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            {d.recipient_name && <> — par {d.recipient_name}</>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
