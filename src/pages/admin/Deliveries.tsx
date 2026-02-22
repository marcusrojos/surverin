import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { toast } from 'sonner';
import { Plus, Search, Trash2, FileText, Loader2 } from 'lucide-react';
import { generateReceiptPDF } from '@/lib/generate-receipt-pdf';
import { Database } from '@/integrations/supabase/types';

type Delivery = Database['public']['Tables']['deliveries']['Row'];
type Pharmacy = Database['public']['Tables']['pharmacies']['Row'];

export default function AdminDeliveries() {
  const [deliveries, setDeliveries] = useState<(Delivery & { pharmacy?: Pharmacy })[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [drivers, setDrivers] = useState<{ user_id: string; full_name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  // New delivery form
  const [newRef, setNewRef] = useState('');
  const [newPharmacy, setNewPharmacy] = useState('');
  const [newDriver, setNewDriver] = useState('');
  const [newCartons, setNewCartons] = useState(0);
  const [newSachets, setNewSachets] = useState(0);
  const [newBarques, setNewBarques] = useState(0);
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    const [delRes, pharRes, driverRolesRes] = await Promise.all([
      supabase.from('deliveries').select('*').order('created_at', { ascending: false }),
      supabase.from('pharmacies').select('*').order('name'),
      supabase.from('user_roles').select('user_id').eq('role', 'livreur'),
    ]);

    const pharmacyMap = new Map((pharRes.data || []).map(p => [p.id, p]));
    setPharmacies(pharRes.data || []);

    const driverIds = (driverRolesRes.data || []).map(r => r.user_id);
    if (driverIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, email').in('user_id', driverIds);
      setDrivers(profiles || []);
    }

    setDeliveries((delRes.data || []).map(d => ({ ...d, pharmacy: pharmacyMap.get(d.pharmacy_id) })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRef.trim() || !newPharmacy) return;
    setCreating(true);

    const { data: codeData } = await supabase.rpc('generate_verification_code');

    const { error } = await supabase.from('deliveries').insert({
      reference: newRef.trim(),
      pharmacy_id: newPharmacy,
      driver_id: newDriver || null,
      nb_cartons: newCartons,
      nb_sachets: newSachets,
      nb_barques: newBarques,
      verification_code: codeData || undefined,
    });

    if (error) {
      toast.error('Erreur lors de la création');
    } else {
      toast.success('Livraison créée');
      setDialogOpen(false);
      setNewRef(''); setNewPharmacy(''); setNewDriver(''); setNewCartons(0); setNewSachets(0); setNewBarques(0);
      fetchData();
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette livraison ?')) return;
    const { error } = await supabase.from('deliveries').delete().eq('id', id);
    if (error) toast.error('Erreur');
    else { toast.success('Supprimée'); fetchData(); }
  };

  const handleReceipt = async (delivery: Delivery & { pharmacy?: Pharmacy }) => {
    if (!delivery.pharmacy) return;
    let driverProfile: { full_name: string; email: string } | null = null;
    if (delivery.driver_id) {
      const { data } = await supabase.from('profiles').select('full_name, email').eq('user_id', delivery.driver_id).maybeSingle();
      driverProfile = data;
    }
    await generateReceiptPDF({
      reference: delivery.reference,
      pharmacyName: delivery.pharmacy.name,
      pharmacyAddress: delivery.pharmacy.address,
      pharmacyClientCode: delivery.pharmacy.client_code,
      pharmacyPhone: delivery.pharmacy.phone,
      pharmacyEmail: delivery.pharmacy.email,
      recipientName: delivery.recipient_name || 'N/A',
      recipientSignature: delivery.recipient_signature,
      deliveredAt: delivery.delivered_at || delivery.updated_at,
      createdAt: delivery.created_at,
      driverName: driverProfile?.full_name,
      driverEmail: driverProfile?.email,
      verificationCode: delivery.verification_code,
      nb_cartons: delivery.nb_cartons,
      nb_sachets: delivery.nb_sachets,
      nb_barques: delivery.nb_barques,
      nb_cartons_received: delivery.nb_cartons_received,
      nb_sachets_received: delivery.nb_sachets_received,
      nb_barques_received: delivery.nb_barques_received,
      packages: Array.isArray(delivery.packages) ? delivery.packages as { type: string; reference: string }[] : [],
    });
  };

  const filtered = deliveries.filter(d =>
    d.reference.toLowerCase().includes(search.toLowerCase()) ||
    d.pharmacy?.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold">Livraisons</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Nouvelle livraison</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md w-[calc(100%-2rem)] mx-auto">
              <DialogHeader><DialogTitle>Nouvelle livraison</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2"><Label>Référence</Label><Input value={newRef} onChange={(e) => setNewRef(e.target.value)} required /></div>
                <div className="space-y-2">
                  <Label>Pharmacie</Label>
                  <Select value={newPharmacy} onValueChange={setNewPharmacy}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>{pharmacies.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Livreur (optionnel)</Label>
                  <Select value={newDriver} onValueChange={setNewDriver}>
                    <SelectTrigger><SelectValue placeholder="Non assigné" /></SelectTrigger>
                    <SelectContent>{drivers.map(d => <SelectItem key={d.user_id} value={d.user_id}>{d.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Cartons</Label><Input type="number" min={0} value={newCartons} onChange={(e) => setNewCartons(Number(e.target.value))} /></div>
                  <div className="space-y-1"><Label className="text-xs">Sachets</Label><Input type="number" min={0} value={newSachets} onChange={(e) => setNewSachets(Number(e.target.value))} /></div>
                  <div className="space-y-1"><Label className="text-xs">Barques</Label><Input type="number" min={0} value={newBarques} onChange={(e) => setNewBarques(Number(e.target.value))} /></div>
                </div>
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Créer
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Rechercher par référence ou pharmacie…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Pharmacie</TableHead>
                    <TableHead>Colis</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucune livraison</TableCell></TableRow>
                  ) : filtered.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono font-medium">{d.reference}</TableCell>
                      <TableCell>{d.pharmacy?.name || '—'}</TableCell>
                      <TableCell className="text-xs">{d.nb_cartons}C {d.nb_sachets}S {d.nb_barques}B</TableCell>
                      <TableCell><StatusBadge status={d.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell className="text-right space-x-1">
                        {d.status === 'livre' && (
                          <Button variant="ghost" size="icon" onClick={() => handleReceipt(d)} title="Bon de réception">
                            <FileText className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
