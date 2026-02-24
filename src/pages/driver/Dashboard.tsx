import { useEffect, useState, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useRealtimeDeliveries } from '@/hooks/use-realtime-deliveries';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { SignaturePad } from '@/components/ui/signature-pad';
import { toast } from 'sonner';
import { Package, CheckCircle, WifiOff, Loader2, Truck, Filter, CalendarDays } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'en_attente' | 'livre'>('all');
  const [dateFilter, setDateFilter] = useState('');

  // Pharmacy order from axes
  const [pharmacyOrder, setPharmacyOrder] = useState<Map<string, number>>(new Map());

  const fetchDeliveries = useCallback(async () => {
    if (!user) return;
    const [delRes, pharRes, axisRes] = await Promise.all([
      supabase.from('deliveries').select('*').eq('driver_id', user.id).order('created_at', { ascending: false }),
      supabase.from('pharmacies').select('*'),
      supabase.from('axis_pharmacies').select('*').order('position', { ascending: true }),
    ]);
    const pharMap = new Map((pharRes.data || []).map(p => [p.id, p]));

    // Build pharmacy order map (lowest position wins across all axes)
    const orderMap = new Map<string, number>();
    (axisRes.data || []).forEach(ap => {
      const existing = orderMap.get(ap.pharmacy_id);
      if (existing === undefined || ap.position < existing) {
        orderMap.set(ap.pharmacy_id, ap.position);
      }
    });
    setPharmacyOrder(orderMap);

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

  // Filtered + grouped deliveries
  const groupedByDate = useMemo(() => {
    let filtered = deliveries;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(d => d.status === statusFilter);
    }
    if (dateFilter) {
      filtered = filtered.filter(d => {
        const dDate = format(new Date(d.created_at), 'yyyy-MM-dd');
        return dDate === dateFilter;
      });
    }

    // Sort by pharmacy order within each group
    const sorted = [...filtered].sort((a, b) => {
      const posA = pharmacyOrder.get(a.pharmacy_id) ?? 9999;
      const posB = pharmacyOrder.get(b.pharmacy_id) ?? 9999;
      return posA - posB;
    });

    // Group by date
    const groups = new Map<string, typeof sorted>();
    sorted.forEach(d => {
      const key = format(new Date(d.created_at), 'yyyy-MM-dd');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    });

    // Sort groups by date descending
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [deliveries, statusFilter, dateFilter, pharmacyOrder]);

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
          deliveryId: deliverDialog.id, reference: deliverDialog.reference,
          recipientName: recipientName.trim(), recipientSignature: signature, deliveredAt: now,
          nb_cartons_received: cartonsReceived, nb_sachets_received: sachetsReceived, nb_barques_received: barquesReceived,
        });
      } else {
        toast.success('Livraison confirmée ✓');
      }
    } else {
      queueDelivery({
        deliveryId: deliverDialog.id, reference: deliverDialog.reference,
        recipientName: recipientName.trim(), recipientSignature: signature, deliveredAt: now,
        nb_cartons_received: cartonsReceived, nb_sachets_received: sachetsReceived, nb_barques_received: barquesReceived,
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

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtres</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Statut</Label>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="en_attente">En attente</SelectItem>
                    <SelectItem value="livre">Livrées</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
              </div>
            </div>
            {(statusFilter !== 'all' || dateFilter) && (
              <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => { setStatusFilter('all'); setDateFilter(''); }}>
                Réinitialiser les filtres
              </Button>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : groupedByDate.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Aucune livraison trouvée</p>
        ) : (
          <div className="space-y-5">
            {groupedByDate.map(([dateKey, items]) => (
              <div key={dateKey} className="space-y-2">
                <div className="flex items-center gap-2 sticky top-0 bg-background py-1 z-10">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-sm">
                    {format(new Date(dateKey), 'EEEE dd MMMM yyyy', { locale: fr })}
                  </h2>
                  <span className="text-xs text-muted-foreground">({items.length})</span>
                </div>
                {items.map(d => (
                  <Card key={d.id} className={d.status === 'livre' ? 'opacity-70' : 'card-hover'}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-mono font-medium text-sm">{d.reference}</p>
                            <StatusBadge status={d.status} />
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{d.pharmacy?.name || '—'}</p>
                          <p className="text-xs text-muted-foreground mt-1">{d.nb_cartons}C · {d.nb_sachets}S · {d.nb_barques}B</p>
                          {d.verification_code && d.status === 'en_attente' && (
                            <p className="text-xs font-mono mt-1">Code: {d.verification_code}</p>
                          )}
                        </div>
                        {d.status === 'en_attente' && (
                          <Button size="sm" onClick={() => openDeliver(d)} className="shrink-0">
                            <Truck className="w-4 h-4 mr-1" />Livrer
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))}
          </div>
        )}

        <Dialog open={!!deliverDialog} onOpenChange={(open) => { if (!open) setDeliverDialog(null); }}>
          <DialogContent className="max-w-md w-[calc(100%-2rem)] mx-auto max-h-[90vh] overflow-y-auto">
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
