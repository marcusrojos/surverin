import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { generateReceiptPDF } from '@/lib/generate-receipt-pdf';
import { GEOFENCE_RADIUS } from '@/lib/geolocation';
import { Package, CheckCircle, FileText, Loader2, KeyRound } from 'lucide-react';
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
    // If delivery has a photo-based PDF (offline), download it directly
    if ((d as any).receipt_pdf_url) {
      const link = document.createElement('a');
      link.href = (d as any).receipt_pdf_url;
      link.download = `bon-livraison-${d.reference}.pdf`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
            {deliveries.map(d => (
              <Card key={d.id} className="card-hover">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-medium">{d.reference}</p>
                      <p className="text-xs text-muted-foreground mt-1">{d.nb_cartons}C · {d.nb_sachets}S · {d.nb_barques}B</p>
                      <p className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString('fr-FR')}</p>
                      {d.status === 'en_attente' && d.verification_code && (
                        <div className="flex items-center gap-1.5 mt-2 bg-primary/10 rounded-md px-2 py-1.5 w-fit">
                          <KeyRound className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-medium text-primary">Code de vérification :</span>
                          <span className="font-mono font-bold text-sm text-primary tracking-widest">{d.verification_code}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={d.status} />
                      {d.status === 'livre' && (
                        <Button variant="ghost" size="icon" onClick={() => handleReceipt(d)} title="Bon de livraison">
                          <FileText className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
