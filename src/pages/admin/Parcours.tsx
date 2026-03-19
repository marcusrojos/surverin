import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Route, Loader2, Search, Eye, Pencil, Trash2, ShieldCheck, Package, MapPin, Barcode,
  AlertTriangle, CheckCircle2, XCircle, Plus, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ParcoursRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  axis_id: string;
  driver_id: string;
  force_confirmed: boolean;
  force_confirmed_by: string | null;
  force_confirmed_at: string | null;
  force_confirmed_reason: string | null;
  axis_name: string;
  driver_name: string;
  colis_count: number;
  pharmacies_count: number;
  inventaire_status: string | null;
}

interface ParcoursPharmacy {
  id: string;
  pharmacy_id: string;
  position: number;
  pharmacy_name: string;
}

interface ParcoursColis {
  id: string;
  barcode: string;
  type: string;
  parcours_pharmacy_id: string;
  pharmacy_name: string;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  en_attente_inventaire: { label: "Attente inventaire", className: 'bg-warning/15 text-warning' },
  en_cours: { label: 'En cours', className: 'bg-primary/15 text-primary' },
  termine: { label: 'Terminé', className: 'bg-green-500/15 text-green-700 dark:text-green-400' },
};

export default function AdminParcours() {
  const { user } = useAuth();
  const [parcoursList, setParcoursList] = useState<ParcoursRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Detail dialog
  const [detailParcours, setDetailParcours] = useState<ParcoursRow | null>(null);
  const [detailPharmacies, setDetailPharmacies] = useState<ParcoursPharmacy[]>([]);
  const [detailColis, setDetailColis] = useState<ParcoursColis[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailInventaire, setDetailInventaire] = useState<any>(null);
  const [detailScans, setDetailScans] = useState<any[]>([]);

  // Edit dialog
  const [editParcours, setEditParcours] = useState<ParcoursRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Edit colis dialog
  const [editColisDialog, setEditColisDialog] = useState(false);
  const [editableColisList, setEditableColisList] = useState<ParcoursColis[]>([]);
  const [editColisSaving, setEditColisSaving] = useState(false);

  // Force confirm
  const [forceDialog, setForceDialog] = useState<ParcoursRow | null>(null);
  const [forceReason, setForceReason] = useState('');
  const [forceSaving, setForceSaving] = useState(false);

  // Delete
  const [deleteDialog, setDeleteDialog] = useState<ParcoursRow | null>(null);

  // Expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { fetchParcours(); }, []);

  const fetchParcours = async () => {
    setLoading(true);
    try {
      const { data: pData, error } = await supabase
        .from('parcours')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      if (!pData || pData.length === 0) { setParcoursList([]); setLoading(false); return; }

      const axisIds = [...new Set(pData.map((p: any) => p.axis_id))];
      const driverIds = [...new Set(pData.map((p: any) => p.driver_id))];
      const parcoursIds = pData.map((p: any) => p.id);

      const [axesRes, driversRes, pharmRes, colisRes, invRes] = await Promise.all([
        supabase.from('axes').select('id, name').in('id', axisIds),
        supabase.from('profiles').select('user_id, full_name').in('user_id', driverIds),
        supabase.from('parcours_pharmacies').select('parcours_id').in('parcours_id', parcoursIds),
        supabase.from('parcours_colis').select('parcours_id').in('parcours_id', parcoursIds),
        supabase.from('parcours_inventaire').select('parcours_id, status').in('parcours_id', parcoursIds).order('created_at', { ascending: false }),
      ]);

      const axisMap = new Map((axesRes.data || []).map((a: any) => [a.id, a.name]));
      const driverMap = new Map((driversRes.data || []).map((d: any) => [d.user_id, d.full_name]));

      const pharmCounts = new Map<string, number>();
      (pharmRes.data || []).forEach((pp: any) => pharmCounts.set(pp.parcours_id, (pharmCounts.get(pp.parcours_id) || 0) + 1));

      const colisCounts = new Map<string, number>();
      (colisRes.data || []).forEach((c: any) => colisCounts.set(c.parcours_id, (colisCounts.get(c.parcours_id) || 0) + 1));

      const invMap = new Map<string, string>();
      (invRes.data || []).forEach((i: any) => { if (!invMap.has(i.parcours_id)) invMap.set(i.parcours_id, i.status); });

      const mapped: ParcoursRow[] = pData.map((p: any) => ({
        ...p,
        axis_name: axisMap.get(p.axis_id) || 'Inconnu',
        driver_name: driverMap.get(p.driver_id) || 'Inconnu',
        colis_count: colisCounts.get(p.id) || 0,
        pharmacies_count: pharmCounts.get(p.id) || 0,
        inventaire_status: invMap.get(p.id) || null,
      }));

      setParcoursList(mapped);
    } catch { toast.error('Erreur lors du chargement'); }
    finally { setLoading(false); }
  };

  const fetchDetail = async (p: ParcoursRow) => {
    setDetailParcours(p);
    setDetailLoading(true);
    try {
      const [pharmRes, colisRes, invRes] = await Promise.all([
        supabase.from('parcours_pharmacies').select('id, pharmacy_id, position, pharmacy:pharmacies(name)').eq('parcours_id', p.id).order('position'),
        supabase.from('parcours_colis').select('id, barcode, type, parcours_pharmacy_id').eq('parcours_id', p.id),
        supabase.from('parcours_inventaire').select('*').eq('parcours_id', p.id).order('created_at', { ascending: false }).limit(1),
      ]);

      const pharmacies: ParcoursPharmacy[] = (pharmRes.data || []).map((pp: any) => ({
        id: pp.id,
        pharmacy_id: pp.pharmacy_id,
        position: pp.position,
        pharmacy_name: Array.isArray(pp.pharmacy) ? pp.pharmacy[0]?.name : pp.pharmacy?.name || 'Inconnu',
      }));

      const pharmNameMap = new Map(pharmacies.map(pp => [pp.id, pp.pharmacy_name]));

      const colis: ParcoursColis[] = (colisRes.data || []).map((c: any) => ({
        ...c,
        pharmacy_name: pharmNameMap.get(c.parcours_pharmacy_id) || 'Inconnu',
      }));

      setDetailPharmacies(pharmacies);
      setDetailColis(colis);

      if (invRes.data && invRes.data.length > 0) {
        setDetailInventaire(invRes.data[0]);
        const { data: scans } = await supabase
          .from('parcours_inventaire_scans')
          .select('*')
          .eq('inventaire_id', invRes.data[0].id);
        setDetailScans(scans || []);
      } else {
        setDetailInventaire(null);
        setDetailScans([]);
      }
    } catch { toast.error('Erreur de chargement des détails'); }
    finally { setDetailLoading(false); }
  };

  const handleEditSave = async () => {
    if (!editParcours || !editName.trim()) return;
    setEditSaving(true);
    try {
      const { error } = await supabase.from('parcours').update({ name: editName.trim() } as any).eq('id', editParcours.id);
      if (error) throw error;
      toast.success('Parcours modifié');
      setEditParcours(null);
      fetchParcours();
    } catch { toast.error('Erreur lors de la modification'); }
    finally { setEditSaving(false); }
  };

  const handleEditColis = async () => {
    if (!detailParcours) return;
    setEditColisSaving(true);
    try {
      // Delete all existing colis and re-insert
      await supabase.from('parcours_colis').delete().eq('parcours_id', detailParcours.id);

      const rows = editableColisList.map(c => ({
        parcours_id: detailParcours.id,
        parcours_pharmacy_id: c.parcours_pharmacy_id,
        type: c.type,
        barcode: c.barcode.trim(),
      }));

      if (rows.length > 0) {
        const { error } = await supabase.from('parcours_colis').insert(rows as any);
        if (error) throw error;
      }

      toast.success('Colis mis à jour');
      setEditColisDialog(false);
      fetchDetail(detailParcours);
      fetchParcours();
    } catch (err: any) { toast.error(err?.message || 'Erreur'); }
    finally { setEditColisSaving(false); }
  };

  const handleForceConfirm = async () => {
    if (!forceDialog || !forceReason.trim() || !user?.id) return;
    setForceSaving(true);
    try {
      const { error } = await supabase.from('parcours').update({
        status: 'en_cours',
        force_confirmed: true,
        force_confirmed_by: user.id,
        force_confirmed_at: new Date().toISOString(),
        force_confirmed_reason: forceReason.trim(),
      } as any).eq('id', forceDialog.id);
      if (error) throw error;
      toast.success('Parcours forcé — le chauffeur peut maintenant livrer');
      setForceDialog(null);
      setForceReason('');
      fetchParcours();
    } catch { toast.error('Erreur'); }
    finally { setForceSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    try {
      const { error } = await supabase.from('parcours').delete().eq('id', deleteDialog.id);
      if (error) throw error;
      toast.success('Parcours supprimé');
      setDeleteDialog(null);
      fetchParcours();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  const filtered = parcoursList.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(q) || p.axis_name.toLowerCase().includes(q) || p.driver_name.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Parcours</h1>
          <p className="text-muted-foreground mt-1">Gérez et contrôlez tous les parcours de livraison</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Rechercher par nom, axe ou chauffeur..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="en_attente_inventaire">Attente inventaire</SelectItem>
              <SelectItem value="en_cours">En cours</SelectItem>
              <SelectItem value="termine">Terminé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border shadow-sm overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Route className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Aucun parcours trouvé</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parcours</TableHead>
                  <TableHead className="hidden sm:table-cell">Axe</TableHead>
                  <TableHead className="hidden md:table-cell">Chauffeur</TableHead>
                  <TableHead>Colis</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => {
                  const si = statusLabels[p.status] || statusLabels.en_attente_inventaire;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(p.created_at), 'dd MMM yyyy', { locale: fr })}</p>
                          {p.force_confirmed && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-warning mt-0.5">
                              <ShieldCheck className="w-3 h-3" /> Forcé
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">{p.axis_name}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{p.driver_name}</TableCell>
                      <TableCell>
                        <span className="text-sm">{p.colis_count}</span>
                        <span className="text-xs text-muted-foreground ml-1">/ {p.pharmacies_count}ph</span>
                      </TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold', si.className)}>
                          {si.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => fetchDetail(p)} title="Détails">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setEditParcours(p); setEditName(p.name); }} title="Modifier">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          {p.status === 'en_attente_inventaire' && (
                            <Button variant="ghost" size="icon" onClick={() => { setForceDialog(p); setForceReason(''); }} title="Forcer la confirmation" className="text-warning hover:text-warning">
                              <ShieldCheck className="w-4 h-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => setDeleteDialog(p)} title="Supprimer" className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* ===== DETAIL DIALOG ===== */}
      <Dialog open={!!detailParcours} onOpenChange={open => { if (!open) setDetailParcours(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Route className="w-5 h-5 text-primary" />
              {detailParcours?.name}
            </DialogTitle>
            <DialogDescription>Détail du parcours, pharmacies, colis et inventaire</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : detailParcours && (
            <div className="space-y-5">
              {/* Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><p className="text-xs text-muted-foreground">Axe</p><p className="text-sm font-medium">{detailParcours.axis_name}</p></div>
                <div><p className="text-xs text-muted-foreground">Chauffeur</p><p className="text-sm font-medium">{detailParcours.driver_name}</p></div>
                <div><p className="text-xs text-muted-foreground">Pharmacies</p><p className="text-sm font-medium">{detailPharmacies.length}</p></div>
                <div><p className="text-xs text-muted-foreground">Colis</p><p className="text-sm font-medium">{detailColis.length}</p></div>
              </div>

              {/* Force confirm badge */}
              {detailParcours.force_confirmed && (
                <Card className="border-warning bg-warning/5">
                  <CardContent className="py-3 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-warning">
                      <ShieldCheck className="w-4 h-4" /> Confirmation forcée
                    </div>
                    <p className="text-xs text-muted-foreground">Motif : {detailParcours.force_confirmed_reason}</p>
                    {detailParcours.force_confirmed_at && (
                      <p className="text-xs text-muted-foreground">
                        Le {format(new Date(detailParcours.force_confirmed_at), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Inventaire summary */}
              {detailInventaire && (
                <Card className={cn('border-2', detailInventaire.status === 'valide' ? 'border-green-500/30' : 'border-warning/30')}>
                  <CardContent className="py-3 space-y-2">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      {detailInventaire.status === 'valide' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4 text-warning" />}
                      Inventaire {detailInventaire.status === 'valide' ? 'validé' : detailInventaire.status === 'ignore' ? 'ignoré' : 'en cours'}
                    </p>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div><p className="font-bold text-lg">{detailInventaire.total_expected}</p><p className="text-muted-foreground">Attendus</p></div>
                      <div><p className="font-bold text-lg">{detailInventaire.total_scanned}</p><p className="text-muted-foreground">Scannés</p></div>
                      <div><p className="font-bold text-lg text-destructive">{detailInventaire.total_missing}</p><p className="text-muted-foreground">Manquants</p></div>
                      <div><p className="font-bold text-lg text-warning">{detailInventaire.total_extra}</p><p className="text-muted-foreground">En trop</p></div>
                    </div>

                    {/* Scan details */}
                    {detailScans.length > 0 && (
                      <div className="space-y-1 max-h-[20vh] overflow-y-auto mt-2">
                        {detailScans.map((s: any) => (
                          <div key={s.id} className={cn('flex items-center gap-2 py-1 px-2 rounded text-xs',
                            s.status === 'matched' ? 'bg-green-500/5' : s.status === 'missing' ? 'bg-destructive/5' : 'bg-warning/5'
                          )}>
                            {s.status === 'matched' ? <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0" /> : s.status === 'missing' ? <XCircle className="w-3 h-3 text-destructive shrink-0" /> : <AlertTriangle className="w-3 h-3 text-warning shrink-0" />}
                            <span className="font-mono flex-1 truncate">{s.barcode}</span>
                            <span className="text-muted-foreground">{s.type || '—'}</span>
                            <span className="text-muted-foreground">{s.pharmacy_name || 'Non assigné'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Pharmacies */}
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1"><MapPin className="w-4 h-4 text-primary" /> Pharmacies ({detailPharmacies.length})</p>
                <div className="space-y-1">
                  {detailPharmacies.map((pp, i) => (
                    <div key={pp.id} className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-muted/50 text-sm">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                      <span className="flex-1 truncate">{pp.pharmacy_name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Colis */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold flex items-center gap-1"><Package className="w-4 h-4 text-primary" /> Colis ({detailColis.length})</p>
                  <Button variant="outline" size="sm" onClick={() => { setEditableColisList([...detailColis]); setEditColisDialog(true); }}>
                    <Pencil className="w-3 h-3 mr-1" /> Modifier
                  </Button>
                </div>
                <div className="space-y-1 max-h-[25vh] overflow-y-auto">
                  {detailColis.map(c => (
                    <div key={c.id} className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-muted/50 text-sm">
                      <Barcode className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-mono text-xs flex-1 truncate">{c.barcode}</span>
                      <span className="text-xs text-muted-foreground">{c.type}</span>
                      <span className="text-xs text-muted-foreground">{c.pharmacy_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== EDIT NAME DIALOG ===== */}
      <Dialog open={!!editParcours} onOpenChange={open => { if (!open) setEditParcours(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Modifier le parcours</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nom du parcours</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} maxLength={100} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditParcours(null)}>Annuler</Button>
            <Button onClick={handleEditSave} disabled={editSaving || !editName.trim()}>
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== EDIT COLIS DIALOG ===== */}
      <Dialog open={editColisDialog} onOpenChange={setEditColisDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier les colis</DialogTitle>
            <DialogDescription>Ajoutez, modifiez ou supprimez les colis du parcours</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {editableColisList.map((c, i) => (
              <div key={c.id || i} className="flex items-center gap-2">
                <Select value={c.type} onValueChange={v => {
                  const next = [...editableColisList];
                  next[i] = { ...next[i], type: v };
                  setEditableColisList(next);
                }}>
                  <SelectTrigger className="w-[100px] h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="carton">Carton</SelectItem>
                    <SelectItem value="sachet">Sachet</SelectItem>
                    <SelectItem value="bac">Bac</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={c.barcode}
                  onChange={e => {
                    const next = [...editableColisList];
                    next[i] = { ...next[i], barcode: e.target.value };
                    setEditableColisList(next);
                  }}
                  className="h-9 text-xs flex-1"
                  placeholder="Code-barres"
                  maxLength={100}
                />
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => setEditableColisList(prev => prev.filter((_, j) => j !== i))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => setEditableColisList(prev => [...prev, { id: `new-${Date.now()}`, barcode: '', type: 'carton', parcours_pharmacy_id: detailPharmacies[0]?.id || '', pharmacy_name: detailPharmacies[0]?.pharmacy_name || '' }])}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter un colis
          </Button>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditColisDialog(false)}>Annuler</Button>
            <Button onClick={handleEditColis} disabled={editColisSaving}>
              {editColisSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== FORCE CONFIRM DIALOG ===== */}
      <Dialog open={!!forceDialog} onOpenChange={open => { if (!open) setForceDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <ShieldCheck className="w-5 h-5" /> Forcer la confirmation
            </DialogTitle>
            <DialogDescription>
              Le chauffeur pourra accéder aux livraisons sans inventaire valide. Un motif est obligatoire et sera tracé.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="py-3">
                <p className="text-sm font-medium">{forceDialog?.name}</p>
                <p className="text-xs text-muted-foreground">{forceDialog?.axis_name} · {forceDialog?.driver_name}</p>
              </CardContent>
            </Card>
            <div className="space-y-1">
              <Label>Motif de la confirmation forcée <span className="text-destructive">*</span></Label>
              <Textarea
                value={forceReason}
                onChange={e => setForceReason(e.target.value)}
                placeholder="Expliquez pourquoi vous forcez la confirmation..."
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceDialog(null)}>Annuler</Button>
            <Button onClick={handleForceConfirm} disabled={forceSaving || !forceReason.trim()} className="bg-warning text-warning-foreground hover:bg-warning/90">
              {forceSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
              Forcer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DELETE DIALOG ===== */}
      <AlertDialog open={!!deleteDialog} onOpenChange={open => { if (!open) setDeleteDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le parcours</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer "{deleteDialog?.name}" ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
