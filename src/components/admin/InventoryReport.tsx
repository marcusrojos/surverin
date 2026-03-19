import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { generateInventoryPDF } from '@/lib/generate-inventory-pdf';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Search, Loader2, FileDown, Eye, Package, CheckCircle2, AlertTriangle, XCircle, ShieldAlert,
} from 'lucide-react';

interface ParcoursWithDetails {
  id: string;
  name: string;
  status: string;
  created_at: string;
  driver_id: string;
  axis_id: string;
  force_confirmed: boolean;
  force_confirmed_by: string | null;
  force_confirmed_at: string | null;
  force_confirmed_reason: string | null;
  axisName: string;
  driverName: string;
  forceConfirmedByName: string | null;
  pharmacies: { name: string; position: number }[];
  colis: { barcode: string; type: string; pharmacyName: string }[];
  inventaire: {
    id: string;
    status: string;
    total_expected: number;
    total_scanned: number;
    total_missing: number;
    total_extra: number;
    completed_at: string | null;
    notes: string | null;
    scans: { barcode: string; status: string; type: string | null; pharmacy_name: string | null }[];
  } | null;
}

export function InventoryReport() {
  const [parcours, setParcours] = useState<ParcoursWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedParcours, setSelectedParcours] = useState<ParcoursWithDetails | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch all parcours
      const { data: parcoursData, error: pErr } = await supabase
        .from('parcours')
        .select('*')
        .order('created_at', { ascending: false });
      if (pErr) throw pErr;

      // Fetch related data in parallel
      const [
        { data: axes },
        { data: profiles },
        { data: parcoursPharmacies },
        { data: pharmacies },
        { data: parcoursColis },
        { data: inventaires },
      ] = await Promise.all([
        supabase.from('axes').select('id, name'),
        supabase.from('profiles').select('user_id, full_name'),
        supabase.from('parcours_pharmacies').select('*'),
        supabase.from('pharmacies').select('id, name'),
        supabase.from('parcours_colis').select('*'),
        supabase.from('parcours_inventaire').select('*'),
      ]);

      // Fetch scans for all inventaires
      const inventaireIds = (inventaires || []).map(i => i.id);
      let allScans: any[] = [];
      if (inventaireIds.length > 0) {
        const { data: scans } = await supabase
          .from('parcours_inventaire_scans')
          .select('*')
          .in('inventaire_id', inventaireIds);
        allScans = scans || [];
      }

      const mapped: ParcoursWithDetails[] = (parcoursData || []).map(p => {
        const axis = axes?.find(a => a.id === p.axis_id);
        const driver = profiles?.find(pr => pr.user_id === p.driver_id);
        const forceBy = p.force_confirmed_by ? profiles?.find(pr => pr.user_id === p.force_confirmed_by) : null;

        const pPharmacies = (parcoursPharmacies || [])
          .filter(pp => pp.parcours_id === p.id)
          .map(pp => ({
            name: pharmacies?.find(ph => ph.id === pp.pharmacy_id)?.name || 'Inconnue',
            position: pp.position,
          }));

        const pColis = (parcoursColis || [])
          .filter(c => c.parcours_id === p.id)
          .map(c => {
            const pp = (parcoursPharmacies || []).find(x => x.id === c.parcours_pharmacy_id);
            const phName = pp ? pharmacies?.find(ph => ph.id === pp.pharmacy_id)?.name || 'Inconnue' : 'Inconnue';
            return { barcode: c.barcode, type: c.type, pharmacyName: phName };
          });

        const inv = (inventaires || []).find(i => i.parcours_id === p.id);
        let inventaire = null;
        if (inv) {
          const scans = allScans.filter(s => s.inventaire_id === inv.id);
          inventaire = {
            id: inv.id,
            status: inv.status,
            total_expected: inv.total_expected,
            total_scanned: inv.total_scanned,
            total_missing: inv.total_missing,
            total_extra: inv.total_extra,
            completed_at: inv.completed_at,
            notes: inv.notes,
            scans,
          };
        }

        return {
          ...p,
          axisName: axis?.name || 'Inconnu',
          driverName: driver?.full_name || 'Inconnu',
          forceConfirmedByName: forceBy?.full_name || null,
          pharmacies: pPharmacies,
          colis: pColis,
          inventaire,
        };
      });

      setParcours(mapped);
    } catch (error) {
      toast.error('Erreur lors du chargement des inventaires');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async (p: ParcoursWithDetails) => {
    try {
      await generateInventoryPDF({
        parcoursName: p.name,
        axisName: p.axisName,
        driverName: p.driverName,
        createdAt: p.created_at,
        completedAt: p.inventaire?.completed_at || null,
        status: p.status,
        pharmacies: p.pharmacies,
        expectedColis: p.colis,
        scans: p.inventaire?.scans || [],
        totalExpected: p.inventaire?.total_expected || p.colis.length,
        totalScanned: p.inventaire?.total_scanned || 0,
        totalMissing: p.inventaire?.total_missing || 0,
        totalExtra: p.inventaire?.total_extra || 0,
        forceConfirmed: p.force_confirmed,
        forceConfirmedBy: p.forceConfirmedByName,
        forceConfirmedAt: p.force_confirmed_at,
        forceConfirmedReason: p.force_confirmed_reason,
        inventoryNotes: p.inventaire?.notes || null,
      });
      toast.success('PDF généré avec succès');
    } catch (error) {
      toast.error('Erreur lors de la génération du PDF');
    }
  };

  const filtered = parcours.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      p.axisName.toLowerCase().includes(q) ||
      p.driverName.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getInventoryBadge = (p: ParcoursWithDetails) => {
    if (p.force_confirmed) {
      return <Badge variant="outline" className="border-orange-400 text-orange-600"><ShieldAlert className="w-3 h-3 mr-1" />Forcé</Badge>;
    }
    if (!p.inventaire) {
      return <Badge variant="outline" className="text-muted-foreground">Non effectué</Badge>;
    }
    const isOk = p.inventaire.total_missing === 0 && p.inventaire.total_extra === 0;
    if (isOk) {
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100"><CheckCircle2 className="w-3 h-3 mr-1" />Conforme</Badge>;
    }
    return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Écarts</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par parcours, axe ou chauffeur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="en_attente_inventaire">En attente</SelectItem>
            <SelectItem value="en_cours">En cours</SelectItem>
            <SelectItem value="termine">Terminé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Aucun inventaire trouvé</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parcours</TableHead>
                <TableHead>Axe</TableHead>
                <TableHead className="hidden md:table-cell">Chauffeur</TableHead>
                <TableHead className="hidden md:table-cell">Colis</TableHead>
                <TableHead>Inventaire</TableHead>
                <TableHead className="hidden lg:table-cell">Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.axisName}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{p.driverName}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{p.colis.length}</TableCell>
                  <TableCell>{getInventoryBadge(p)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {format(new Date(p.created_at), 'dd MMM yyyy', { locale: fr })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Voir les détails"
                        onClick={() => { setSelectedParcours(p); setDetailOpen(true); }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Télécharger le PDF"
                        onClick={() => handleDownloadPDF(p)}
                      >
                        <FileDown className="w-4 h-4 text-primary" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedParcours && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Détail inventaire — {selectedParcours.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {/* General info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Informations générales</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Axe :</span> {selectedParcours.axisName}</p>
                    <p><span className="text-muted-foreground">Chauffeur :</span> {selectedParcours.driverName}</p>
                    <p><span className="text-muted-foreground">Date :</span> {format(new Date(selectedParcours.created_at), 'dd MMMM yyyy HH:mm', { locale: fr })}</p>
                    <p><span className="text-muted-foreground">Pharmacies :</span> {selectedParcours.pharmacies.sort((a, b) => a.position - b.position).map(ph => ph.name).join(', ')}</p>
                  </CardContent>
                </Card>

                {/* Colis list */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Colis attendus ({selectedParcours.colis.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedParcours.colis.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucun colis</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {selectedParcours.colis.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="text-xs">{c.type}</Badge>
                            <span className="font-mono">{c.barcode}</span>
                            <span className="text-muted-foreground">→ {c.pharmacyName}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Inventory result */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Résultat de l'inventaire</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!selectedParcours.inventaire ? (
                      <p className="text-sm text-muted-foreground">Inventaire non effectué</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                          <div className="bg-muted rounded-lg p-2 text-center">
                            <p className="text-muted-foreground text-xs">Attendus</p>
                            <p className="font-bold text-lg">{selectedParcours.inventaire.total_expected}</p>
                          </div>
                          <div className="bg-muted rounded-lg p-2 text-center">
                            <p className="text-muted-foreground text-xs">Scannés</p>
                            <p className="font-bold text-lg">{selectedParcours.inventaire.total_scanned}</p>
                          </div>
                          <div className="bg-red-50 rounded-lg p-2 text-center">
                            <p className="text-muted-foreground text-xs">Manquants</p>
                            <p className="font-bold text-lg text-red-600">{selectedParcours.inventaire.total_missing}</p>
                          </div>
                          <div className="bg-orange-50 rounded-lg p-2 text-center">
                            <p className="text-muted-foreground text-xs">En trop</p>
                            <p className="font-bold text-lg text-orange-600">{selectedParcours.inventaire.total_extra}</p>
                          </div>
                        </div>

                        {/* Scans detail */}
                        {selectedParcours.inventaire.scans.length > 0 && (
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {selectedParcours.inventaire.scans.map((s, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                {s.status === 'matched' && <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
                                {s.status === 'missing' && <XCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />}
                                {s.status === 'extra' && <AlertTriangle className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />}
                                <span className="font-mono">{s.barcode}</span>
                                {s.type && <Badge variant="outline" className="text-xs">{s.type}</Badge>}
                                {s.pharmacy_name && <span className="text-muted-foreground text-xs">→ {s.pharmacy_name}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Force confirmation */}
                {selectedParcours.force_confirmed && (
                  <Card className="border-orange-300">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
                        <ShieldAlert className="w-4 h-4" />
                        Confirmation forcée
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1">
                      {selectedParcours.forceConfirmedByName && (
                        <p><span className="text-muted-foreground">Par :</span> {selectedParcours.forceConfirmedByName}</p>
                      )}
                      {selectedParcours.force_confirmed_at && (
                        <p><span className="text-muted-foreground">Date :</span> {format(new Date(selectedParcours.force_confirmed_at), 'dd MMMM yyyy HH:mm', { locale: fr })}</p>
                      )}
                      {selectedParcours.force_confirmed_reason && (
                        <p><span className="text-muted-foreground">Motif :</span> {selectedParcours.force_confirmed_reason}</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Download button */}
                <Button onClick={() => handleDownloadPDF(selectedParcours)} className="w-full">
                  <FileDown className="w-4 h-4 mr-2" />
                  Télécharger le rapport PDF
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
