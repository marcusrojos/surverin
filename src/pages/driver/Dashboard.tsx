import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useRealtimeDeliveries } from '@/hooks/use-realtime-deliveries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { SignaturePad } from '@/components/ui/signature-pad';
import { toast } from 'sonner';
import { Package, CheckCircle, WifiOff, Loader2, Truck } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type Delivery = Database['public']['Tables']['deliveries']['Row'];
type Pharmacy = Database['public']['Tables']['pharmacies']['Row'];

export default function DriverDashboard() {
  const { user } = useAuth();
  const { isOnline, pendingDeliveries, queueDelivery, syncPending } = useOfflineSync();
  const [deliveries, setDeliveries] = useState<(Delivery & { pharmacy?: Pharmacy })[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliverDialog, setDeliverDialog] = useState<Delivery | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [cartonsReceived, setCartonsReceived] = useState(0);
  const [sachetsReceived, setSachetsReceived] = useState(0);
  const [barquesReceived, setBarquesReceived] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const fetchDeliveries = useCallback(async () => {
    if (!user) return;
    const [delRes, pharRes] = await Promise.all([
      supabase.from('deliveries').select('*').eq('driver_id', user.id).order('created_at', { ascending: false }),
      supabase.from('pharmacies').select('*'),
    ]);
    const pharMap = new Map((pharRes.data || []).map(p => [p.id, p]));
    setDeliveries((delRes.data || []).map(d => ({ ...d, pharmacy: pharMap.get(d.pharmacy_id) })));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  useRealtimeDeliveries({
    userId: user?.id,
    onNewDelivery: () => fetchDeliveries(),
    onDeliveryUpdate: () => fetchDeliveries(),
    onDeliveryDelete: () => fetchDeliveries(),
  });

  const openDeliver = (d: Delivery) => {
    setDeliverDialog(d);
    setRecipientName('');
    setSignature(null);
    setCartonsReceived(d.nb_cartons);
    setSachetsReceived(d.nb_sachets);
    setBarquesReceived(d.nb_barques);
  };

  const handleDeliver = async () => {
    if (!deliverDialog || !recipientName.trim()) return;
    setSubmitting(true);
    const now = new Date().toISOString();

    if (isOnline) {
      const { error } = await supabase.from('deliveries').update({
        status: 'livre' as const,
        recipient_name: recipientName.trim(),
        recipient_signature: signature,
        delivered_at: now,
        nb_cartons_received: cartonsReceived,
        nb_sachets_received: sachetsReceived,
        nb_barques_received: barquesReceived,
      }).eq('id', deliverDialog.id);

      if (error) {
        toast.error('Erreur — sauvegarde hors-ligne');
        queueDelivery({
          deliveryId: deliverDialog.id,
          reference: deliverDialog.reference,
          recipientName: recipientName.trim(),
          recipientSignature: signature,
          deliveredAt: now,
          nb_cartons_received: cartonsReceived,
          nb_sachets_received: sachetsReceived,
          nb_barques_received: barquesReceived,
        });
      } else {
        toast.success('Livraison confirmée ✓');
      }
    } else {
      queueDelivery({
        deliveryId: deliverDialog.id,
        reference: deliverDialog.reference,
        recipientName: recipientName.trim(),
        recipientSignature: signature,
        deliveredAt: now,
        nb_cartons_received: cartonsReceived,
        nb_sachets_received: sachetsReceived,
        nb_barques_received: barquesReceived,
      });
      toast.info('Sauvegardé hors-ligne — sera synchronisé');
    }

    setDeliverDialog(null);
    setSubmitting(false);
    fetchDeliveries();
  };

  const pending = deliveries.filter(d => d.status === 'en_attente');
  const delivered = deliveries.filter(d => d.status === 'livre');

  return (
    <DashboardLayout requiredRole="livreur">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold">Mes livraisons</h1>
          {!isOnline && (
            <div className="flex items-center gap-2 text-warning text-sm">
              <WifiOff className="w-4 h-4" />
              Hors-ligne ({pendingDeliveries.length} en attente)
            </div>
          )}
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
              <p className="text-xs text-muted-foreground">Livrées</p>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-3">
            {pending.length > 0 && <h2 className="font-semibold text-lg">À livrer</h2>}
            {pending.map(d => (
              <Card key={d.id} className="card-hover">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-medium">{d.reference}</p>
                      <p className="text-sm text-muted-foreground">{d.pharmacy?.name || '—'}</p>
                      <p className="text-xs text-muted-foreground mt-1">{d.nb_cartons}C · {d.nb_sachets}S · {d.nb_barques}B</p>
                      {d.verification_code && <p className="text-xs font-mono mt-1">Code: {d.verification_code}</p>}
                    </div>
                    <Button size="sm" onClick={() => openDeliver(d)}>
                      <Truck className="w-4 h-4 mr-1" />Livrer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {delivered.length > 0 && <h2 className="font-semibold text-lg mt-6">Livrées</h2>}
            {delivered.map(d => (
              <Card key={d.id} className="opacity-70">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-medium">{d.reference}</p>
                      <p className="text-sm text-muted-foreground">{d.pharmacy?.name}</p>
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!deliverDialog} onOpenChange={(open) => { if (!open) setDeliverDialog(null); }}>
          <DialogContent className="max-w-md w-[calc(100%-2rem)] mx-auto">
            <DialogHeader><DialogTitle>Confirmer la livraison</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Réf: <span className="font-mono font-medium text-foreground">{deliverDialog?.reference}</span></p>
              <div className="space-y-2"><Label>Nom du réceptionnaire</Label><Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Nom et prénom" /></div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="space-y-1"><Label className="text-xs">Cartons reçus</Label><Input type="number" min={0} value={cartonsReceived} onChange={(e) => setCartonsReceived(Number(e.target.value))} /></div>
                <div className="space-y-1"><Label className="text-xs">Sachets reçus</Label><Input type="number" min={0} value={sachetsReceived} onChange={(e) => setSachetsReceived(Number(e.target.value))} /></div>
                <div className="space-y-1"><Label className="text-xs">Barques reçues</Label><Input type="number" min={0} value={barquesReceived} onChange={(e) => setBarquesReceived(Number(e.target.value))} /></div>
              </div>
              <div className="space-y-2">
                <Label>Signature</Label>
                <SignaturePad onSignatureChange={setSignature} />
              </div>
              <Button onClick={handleDeliver} className="w-full" disabled={submitting || !recipientName.trim()}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Confirmer la livraison
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
