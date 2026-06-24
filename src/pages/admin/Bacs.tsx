import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Box, Loader2, Search, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

interface BacRow {
  pharmacy_id: string;
  pharmacy_name: string;
  site_id: string | null;
  site_name: string;
  pending_bacs: number;
  updated_at: string | null;
}

export default function BacsPage() {
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';
  const [rows, setRows] = useState<BacRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [{ data: pharmacies }, { data: balances }, { data: sitesData }] = await Promise.all([
        supabase.from('pharmacies').select('id, name, site_id'),
        supabase.from('pharmacy_bacs_balance').select('pharmacy_id, pending_bacs, updated_at'),
        supabase.from('sites').select('id, name'),
      ]);

      const siteMap = new Map((sitesData || []).map((s: any) => [s.id, s.name]));
      setSites((sitesData || []).map((s: any) => ({ id: s.id, name: s.name })));

      const balMap = new Map(
        (balances || []).map((b: any) => [b.pharmacy_id, b])
      );

      const result: BacRow[] = (pharmacies || []).map((p: any) => {
        const bal: any = balMap.get(p.id);
        return {
          pharmacy_id: p.id,
          pharmacy_name: p.name,
          site_id: p.site_id,
          site_name: p.site_id ? (siteMap.get(p.site_id) || '—') : '—',
          pending_bacs: bal?.pending_bacs ?? 0,
          updated_at: bal?.updated_at ?? null,
        };
      });

      result.sort((a, b) => b.pending_bacs - a.pending_bacs);
      setRows(result);
    } catch {
      toast.error('Erreur lors du chargement des bacs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = rows.filter((r) => {
    const matchSearch = r.pharmacy_name.toLowerCase().includes(search.toLowerCase());
    const matchSite = siteFilter === 'all' || r.site_id === siteFilter;
    return matchSearch && matchSite;
  });

  const totalPending = filtered.reduce((acc, r) => acc + r.pending_bacs, 0);

  const handleDownloadPdf = () => {
    const toRecover = filtered
      .filter((r) => r.pending_bacs > 0)
      .sort((a, b) => b.pending_bacs - a.pending_bacs);

    if (toRecover.length === 0) {
      toast.error('Aucun bac à récupérer');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const green: [number, number, number] = [21, 131, 82];

    doc.setFillColor(...green);
    doc.rect(0, 0, pageWidth, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('DPCI Delivery — Bacs à récupérer', 14, 13);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Édité le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
      14,
      21
    );

    let y = 40;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Pharmacie', 14, y);
    if (isSuperAdmin) doc.text('Site', 110, y);
    doc.text('Bacs', pageWidth - 30, y);
    doc.setDrawColor(...green);
    doc.line(14, y + 2, pageWidth - 14, y + 2);
    y += 9;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    let total = 0;
    toRecover.forEach((r) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(String(r.pharmacy_name).slice(0, 55), 14, y);
      if (isSuperAdmin) doc.text(String(r.site_name).slice(0, 25), 110, y);
      doc.text(String(r.pending_bacs), pageWidth - 30, y);
      total += r.pending_bacs;
      y += 8;
    });

    doc.setDrawColor(...green);
    doc.line(14, y, pageWidth - 14, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total : ${total} bac(s) dans ${toRecover.length} pharmacie(s)`, 14, y);

    doc.save(`bacs-a-recuperer-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <DashboardLayout requiredRole="admin" allowSuperAdmin>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Box className="w-7 h-7 text-primary" /> Bacs
            </h1>
            <p className="text-muted-foreground mt-1">Suivi des bacs en attente de récupération par pharmacie</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleDownloadPdf} variant="outline" className="gap-2">
              <Download className="w-4 h-4" /> Télécharger PDF
            </Button>
            <div className="bg-card rounded-xl border px-5 py-3">
              <p className="text-2xl font-bold">{totalPending}</p>
              <p className="text-xs text-muted-foreground">Bacs à récupérer</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Rechercher une pharmacie..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          {isSuperAdmin && (
            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Tous les sites" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les sites</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="bg-card rounded-xl border shadow-sm overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Box className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Aucune pharmacie trouvée</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pharmacie</TableHead>
                  {isSuperAdmin && <TableHead className="hidden md:table-cell">Site</TableHead>}
                  <TableHead className="text-center">Bacs à récupérer</TableHead>
                  <TableHead className="hidden md:table-cell">Dernière mise à jour</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.pharmacy_id}>
                    <TableCell className="font-medium">{r.pharmacy_name}</TableCell>
                    {isSuperAdmin && <TableCell className="hidden md:table-cell text-muted-foreground">{r.site_name}</TableCell>}
                    <TableCell className="text-center">
                      <Badge variant={r.pending_bacs > 0 ? 'default' : 'secondary'}>{r.pending_bacs}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {r.updated_at ? new Date(r.updated_at).toLocaleDateString('fr-FR') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
