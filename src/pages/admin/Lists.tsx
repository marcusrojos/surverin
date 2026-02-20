import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { generateReceiptPDF } from '@/lib/generate-receipt-pdf';
import { toast } from 'sonner';
import { FileText, Download, Loader2 } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type Delivery = Database['public']['Tables']['deliveries']['Row'];
type Pharmacy = Database['public']['Tables']['pharmacies']['Row'];

export default function AdminLists() {
  const [deliveries, setDeliveries] = useState<(Delivery & { pharmacy?: Pharmacy })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const fetchData = useCallback(async () => {
    const [delRes, pharRes] = await Promise.all([
      supabase.from('deliveries').select('*').order('created_at', { ascending: false }),
      supabase.from('pharmacies').select('*'),
    ]);
    const pharMap = new Map((pharRes.data || []).map(p => [p.id, p]));
    setDeliveries((delRes.data || []).map(d => ({ ...d, pharmacy: pharMap.get(d.pharmacy_id) })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = deliveries.filter(d => filterStatus === 'all' || d.status === filterStatus);

  const handleReceiptAll = async () => {
    const delivered = filtered.filter(d => d.status === 'livre');
    if (delivered.length === 0) { toast.info('Aucune livraison livrée à exporter'); return; }
    toast.info(`Génération de ${delivered.length} bon(s)…`);
    for (const d of delivered) {
      if (!d.pharmacy) continue;
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
      });
    }
    toast.success('Bons générés');
  };

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold">Listes & PDF</h1>
          <Button onClick={handleReceiptAll} variant="outline">
            <Download className="w-4 h-4 mr-2" />Exporter les bons
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Label>Filtre :</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="en_attente">En attente</SelectItem>
              <SelectItem value="livre">Livrées</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Pharmacie</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Aucune livraison</TableCell></TableRow>
                  ) : filtered.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono">{d.reference}</TableCell>
                      <TableCell>{d.pharmacy?.name || '—'}</TableCell>
                      <TableCell><StatusBadge status={d.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString('fr-FR')}</TableCell>
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
