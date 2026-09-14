import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  AlertTriangle, CheckCircle2, XCircle, Plus, Building2, User,
} from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { BarcodeScanButton } from '@/components/ui/barcode-scan-button';
import { supabase } from '@/integrations/supabase/client';
import { useSiteFilter, SiteFilterSelect } from '@/components/admin/SiteFilter';
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
  site_id: string | null;
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
  pharmacy_id: string;
}


interface AxisPharmacyOption {
  pharmacy_id: string;
  pharmacy_name: string;
  position: number;
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
  const { isSuperAdmin, sites, siteFilter, setSiteFilter } = useSiteFilter();

  // Detail dialog
  const [detailParcours, setDetailParcours] = useState<ParcoursRow | null>(null);
  const [detailPharmacies, setDetailPharmacies] = useState<ParcoursPharmacy[]>([]);
  const [detailColis, setDetailColis] = useState<ParcoursColis[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailInventaire, setDetailInventaire] = useState<any>(null);
  const [detailScans, setDetailScans] = useState<any[]>([]);

  // Edit dialog (full: name + pharmacies + colis)
  const [editParcours, setEditParcours] = useState<ParcoursRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  // Pharmacies editing (all pharmacies of the site are selectable, axis ones first)
  const [editAxisPharmacies, setEditAxisPharmacies] = useState<AxisPharmacyOption[]>([]);
  const [editSelectedPharmacyIds, setEditSelectedPharmacyIds] = useState<Set<string>>(new Set());
  const [editCurrentPharmacyIds, setEditCurrentPharmacyIds] = useState<Set<string>>(new Set());
  const [editPharmacySearch, setEditPharmacySearch] = useState('');
  // Driver editing
  const [editDrivers, setEditDrivers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [editDriverId, setEditDriverId] = useState('');
  // Colis editing
  const [editColisList, setEditColisList] = useState<ParcoursColis[]>([]);
  // Parcours pharmacies map (pharmacy_id -> parcours_pharmacy_id)
  const [editPharmIdMap, setEditPharmIdMap] = useState<Map<string, string>>(new Map());


  // Force confirm
  const [forceDialog, setForceDialog] = useState<ParcoursRow | null>(null);
  const [forceReason, setForceReason] = useState('');
  const [forceSaving, setForceSaving] = useState(false);

  // Delete
  const [deleteDialog, setDeleteDialog] = useState<ParcoursRow | null>(null);

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
      const pharmIdByPPId = new Map(pharmacies.map(pp => [pp.id, pp.pharmacy_id]));

      const colis: ParcoursColis[] = (colisRes.data || []).map((c: any) => ({
        ...c,
        pharmacy_name: pharmNameMap.get(c.parcours_pharmacy_id) || 'Inconnu',
        pharmacy_id: pharmIdByPPId.get(c.parcours_pharmacy_id) || '',
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

  // ===== EDIT: Open edit dialog with full data =====
  const openEditDialog = async (p: ParcoursRow) => {
    setEditParcours(p);
    setEditName(p.name);
    setEditDriverId(p.driver_id);
    setEditPharmacySearch('');
    setEditLoading(true);
    try {
      // Fetch current parcours pharmacies, colis, axis pharmacies, all pharmacies of the site and drivers
      let allPharmQuery = supabase.from('pharmacies').select('id, name, client_code, site_id').order('name');
      if (p.site_id) allPharmQuery = allPharmQuery.eq('site_id', p.site_id);

      const [ppRes, colisRes, axisPharmRes, allPharmRes, rolesRes] = await Promise.all([
        supabase.from('parcours_pharmacies').select('id, pharmacy_id, position, pharmacy:pharmacies(name)').eq('parcours_id', p.id).order('position'),
        supabase.from('parcours_colis').select('id, barcode, type, parcours_pharmacy_id').eq('parcours_id', p.id),
        supabase.from('axis_pharmacies').select('pharmacy_id, position, pharmacy:pharmacies(name)').eq('axis_id', p.axis_id).order('position'),
        allPharmQuery,
        supabase.from('user_roles').select('user_id').eq('role', 'livreur'),
      ]);

      // Current parcours pharmacies
      const currentPP = (ppRes.data || []).map((pp: any) => ({
        id: pp.id,
        pharmacy_id: pp.pharmacy_id,
        position: pp.position,
        pharmacy_name: Array.isArray(pp.pharmacy) ? pp.pharmacy[0]?.name : pp.pharmacy?.name || 'Inconnu',
      }));
      const currentIds = new Set<string>(currentPP.map((pp: any) => pp.pharmacy_id));
      setEditCurrentPharmacyIds(currentIds);
      setEditSelectedPharmacyIds(new Set(currentIds));

      // Map pharmacy_id -> parcours_pharmacy_id
      const idMap = new Map<string, string>(currentPP.map((pp: any) => [pp.pharmacy_id, pp.id]));
      setEditPharmIdMap(idMap);

      // Selectable pharmacies: axis pharmacies first (in axis order), then the other pharmacies of the site
      const axisPharms: AxisPharmacyOption[] = (axisPharmRes.data || []).map((ap: any) => ({
        pharmacy_id: ap.pharmacy_id,
        pharmacy_name: Array.isArray(ap.pharmacy) ? ap.pharmacy[0]?.name : ap.pharmacy?.name || 'Inconnu',
        position: ap.position,
      }));
      const known = new Set(axisPharms.map(ap => ap.pharmacy_id));
      const extraPharms: AxisPharmacyOption[] = (allPharmRes.data || [])
        .filter((ph: any) => !known.has(ph.id))
        .map((ph: any, i: number) => ({
          pharmacy_id: ph.id,
          pharmacy_name: ph.name,
          position: axisPharms.length + i,
        }));
      const options = [...axisPharms, ...extraPharms];
      setEditAxisPharmacies(options);

      // Drivers list (active only)
      const driverIds = (rolesRes.data || []).map((r: any) => r.user_id);
      if (driverIds.length > 0) {
        let driverQuery = supabase.from('profiles').select('user_id, full_name, site_id').in('user_id', driverIds).eq('is_active', true);
        if (p.site_id) driverQuery = driverQuery.eq('site_id', p.site_id);
        const { data: driversData } = await driverQuery;
        const list = (driversData || []).map((d: any) => ({ user_id: d.user_id, full_name: d.full_name }));
        // Always keep the currently assigned driver visible
        if (!list.some(d => d.user_id === p.driver_id)) {
          list.unshift({ user_id: p.driver_id, full_name: p.driver_name });
        }
        setEditDrivers(list);
      } else {
        setEditDrivers([{ user_id: p.driver_id, full_name: p.driver_name }]);
      }

      // Colis (keyed by pharmacy_id so pharmacies added later work too)
      const pharmNameMap = new Map<string, string>(currentPP.map((pp: any) => [pp.id, pp.pharmacy_name]));
      const pharmIdMapByPP = new Map<string, string>(currentPP.map((pp: any) => [pp.id, pp.pharmacy_id]));
      const colis: ParcoursColis[] = (colisRes.data || []).map((c: any) => ({
        ...c,
        pharmacy_name: pharmNameMap.get(c.parcours_pharmacy_id) || 'Inconnu',
        pharmacy_id: pharmIdMapByPP.get(c.parcours_pharmacy_id) || '',
      }));
      setEditColisList(colis);
    } catch { toast.error('Erreur de chargement'); }
    finally { setEditLoading(false); }
  };


  const handleEditSave = async () => {
    if (!editParcours || !editName.trim()) return;
    setEditSaving(true);
    try {
      // 1. Update name + assigned driver
      const driverChanged = !!editDriverId && editDriverId !== editParcours.driver_id;
      const { error } = await supabase
        .from('parcours')
        .update({ name: editName.trim(), ...(editDriverId ? { driver_id: editDriverId } : {}) } as any)
        .eq('id', editParcours.id);
      if (error) throw error;

      // 1b. Reassign pending deliveries of this parcours to the new driver
      if (driverChanged) {
        const { error: delErr } = await supabase
          .from('deliveries')
          .update({ driver_id: editDriverId } as any)
          .eq('parcours_id', editParcours.id)
          .eq('status', 'en_attente');
        if (delErr) throw delErr;
      }


      // 2. Handle pharmacy changes
      const addedPharmIds = [...editSelectedPharmacyIds].filter(id => !editCurrentPharmacyIds.has(id));
      const removedPharmIds = [...editCurrentPharmacyIds].filter(id => !editSelectedPharmacyIds.has(id));

      // Remove pharmacies (and their colis)
      if (removedPharmIds.length > 0) {
        const removedPPIds = removedPharmIds.map(pid => editPharmIdMap.get(pid)).filter(Boolean) as string[];
        if (removedPPIds.length > 0) {
          await supabase.from('parcours_colis').delete().in('parcours_pharmacy_id', removedPPIds);
          await supabase.from('parcours_pharmacies').delete().in('id', removedPPIds);
        }
      }

      // Add new pharmacies
      if (addedPharmIds.length > 0) {
        const maxPos = editAxisPharmacies.length;
        const newPPRows = addedPharmIds.map((pid, i) => ({
          parcours_id: editParcours.id,
          pharmacy_id: pid,
          position: maxPos + i,
        }));
        const { data: insertedPP } = await supabase.from('parcours_pharmacies').insert(newPPRows as any).select('id, pharmacy_id');
        // Update the map for new colis assignment
        (insertedPP || []).forEach((pp: any) => editPharmIdMap.set(pp.pharmacy_id, pp.id));
      }

      // 3. Handle colis changes - delete all and re-insert for remaining pharmacies
      await supabase.from('parcours_colis').delete().eq('parcours_id', editParcours.id);

      // Re-fetch the updated parcours_pharmacies to get correct IDs
      const { data: updatedPP } = await supabase.from('parcours_pharmacies').select('id, pharmacy_id').eq('parcours_id', editParcours.id);
      const freshPharmIdMap = new Map((updatedPP || []).map((pp: any) => [pp.pharmacy_id, pp.id]));

      // Build pharmacy_name -> pharmacy_id map from axis pharmacies
      const pharmNameToId = new Map(editAxisPharmacies.map(ap => [ap.pharmacy_name, ap.pharmacy_id]));

      const colisRows = editColisList
        .filter(c => {
          // Only keep colis for selected pharmacies
          const pharmId = pharmNameToId.get(c.pharmacy_name);
          return pharmId && editSelectedPharmacyIds.has(pharmId) && freshPharmIdMap.has(pharmId);
        })
        .map(c => {
          const pharmId = pharmNameToId.get(c.pharmacy_name)!;
          return {
            parcours_id: editParcours.id,
            parcours_pharmacy_id: freshPharmIdMap.get(pharmId)!,
            type: c.type,
            barcode: c.barcode.trim(),
          };
        })
        .filter(c => c.barcode);

      if (colisRows.length > 0) {
        const { error: colisError } = await supabase.from('parcours_colis').insert(colisRows as any);
        if (colisError) throw colisError;
      }

      // 4. Keep deliveries in sync with the updated pharmacies / colis
      const ppIdToPharmId = new Map<string, string>();
      freshPharmIdMap.forEach((ppId, pharmId) => ppIdToPharmId.set(ppId as string, pharmId as string));

      const countsByPharmacy = new Map<string, { cartons: number; sachets: number; bacs: number; packages: { barcode: string; type: string }[] }>();
      colisRows.forEach(c => {
        const pharmId = ppIdToPharmId.get(c.parcours_pharmacy_id);
        if (!pharmId) return;
        const entry = countsByPharmacy.get(pharmId) || { cartons: 0, sachets: 0, bacs: 0, packages: [] };
        if (c.type === 'carton') entry.cartons++;
        else if (c.type === 'sachet') entry.sachets++;
        else entry.bacs++;
        entry.packages.push({ barcode: c.barcode, type: c.type });
        countsByPharmacy.set(pharmId, entry);
      });

      const { data: existingDeliveries } = await supabase
        .from('deliveries')
        .select('id, pharmacy_id, status')
        .eq('parcours_id', editParcours.id);
      const existingByPharmacy = new Map((existingDeliveries || []).map((d: any) => [d.pharmacy_id, d]));

      // Remove pending deliveries of pharmacies no longer in the parcours
      const staleIds = (existingDeliveries || [])
        .filter((d: any) => !editSelectedPharmacyIds.has(d.pharmacy_id) && d.status === 'en_attente')
        .map((d: any) => d.id);
      if (staleIds.length > 0) {
        await supabase.from('deliveries').delete().in('id', staleIds);
      }

      // Update pending deliveries and create the missing ones
      const newDeliveryRows: any[] = [];
      for (const pharmId of editSelectedPharmacyIds) {
        const counts = countsByPharmacy.get(pharmId) || { cartons: 0, sachets: 0, bacs: 0, packages: [] };
        const existing: any = existingByPharmacy.get(pharmId);
        if (existing) {
          if (existing.status === 'en_attente') {
            await supabase.from('deliveries').update({
              nb_cartons: counts.cartons,
              nb_sachets: counts.sachets,
              nb_barques: counts.bacs,
              packages: counts.packages,
              ...(editDriverId ? { driver_id: editDriverId } : {}),
            } as any).eq('id', existing.id);
          }
        } else {
          const pharmName = editAxisPharmacies.find(ap => ap.pharmacy_id === pharmId)?.pharmacy_name || 'Pharmacie';
          newDeliveryRows.push({
            parcours_id: editParcours.id,
            pharmacy_id: pharmId,
            driver_id: editDriverId || editParcours.driver_id,
            reference: `${editName.trim()}-${pharmName}`.substring(0, 50),
            nb_cartons: counts.cartons,
            nb_sachets: counts.sachets,
            nb_barques: counts.bacs,
            packages: counts.packages,
            status: 'en_attente' as const,
            site_id: editParcours.site_id,
          });
        }
      }
      if (newDeliveryRows.length > 0) {
        const { error: newDelErr } = await supabase.from('deliveries').insert(newDeliveryRows as any);
        if (newDelErr) throw newDelErr;
      }

      toast.success('Parcours modifié — livraisons mises à jour');
      setEditParcours(null);
      fetchParcours();
    } catch (err: any) { toast.error(err?.message || 'Erreur lors de la modification'); }
    finally { setEditSaving(false); }
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

  const toggleEditPharmacy = (pharmacyId: string) => {
    setEditSelectedPharmacyIds(prev => {
      const next = new Set(prev);
      if (next.has(pharmacyId)) {
        next.delete(pharmacyId);
        // Remove colis for this pharmacy
        const pharmName = editAxisPharmacies.find(ap => ap.pharmacy_id === pharmacyId)?.pharmacy_name;
        if (pharmName) {
          setEditColisList(prev => prev.filter(c => c.pharmacy_name !== pharmName));
        }
      } else {
        next.add(pharmacyId);
      }
      return next;
    });
  };

  const addEditColis = (pharmacyId: string) => {
    const pharm = editAxisPharmacies.find(ap => ap.pharmacy_id === pharmacyId);
    const ppId = editPharmIdMap.get(pharmacyId) || `new-pp-${pharmacyId}`;
    setEditColisList(prev => [...prev, {
      id: `new-${Date.now()}-${Math.random()}`,
      barcode: '',
      type: 'carton',
      parcours_pharmacy_id: ppId,
      pharmacy_id: pharmacyId,
      pharmacy_name: pharm?.pharmacy_name || 'Inconnu',
    }]);
  };

  // Pharmacies of the edit dialog matching the search (keeps original numbering)
  const visibleEditPharmacies = editAxisPharmacies
    .map((ap, i) => ({ ap, i }))
    .filter(({ ap }) => {
      const q = editPharmacySearch.trim().toLowerCase();
      if (!q) return true;
      return ap.pharmacy_name.toLowerCase().includes(q);
    });

  const filtered = parcoursList.filter(p => {

    const q = searchQuery.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(q) || p.axis_name.toLowerCase().includes(q) || p.driver_name.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchesSite = siteFilter === 'all' || p.site_id === siteFilter;
    return matchesSearch && matchesStatus && matchesSite;
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
          {isSuperAdmin && (
            <SiteFilterSelect value={siteFilter} onChange={setSiteFilter} sites={sites} />
          )}
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
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(p)} title="Modifier">
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
                <p className="text-sm font-semibold mb-2 flex items-center gap-1"><Package className="w-4 h-4 text-primary" /> Colis ({detailColis.length})</p>
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

      {/* ===== EDIT DIALOG (Name + Pharmacies + Colis) ===== */}
      <Dialog open={!!editParcours} onOpenChange={open => { if (!open) setEditParcours(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              Modifier le parcours
            </DialogTitle>
            <DialogDescription>Modifiez le nom, les pharmacies et les colis de ce parcours</DialogDescription>
          </DialogHeader>

          {editLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : editParcours && (
            <div className="space-y-5">
              {/* Name */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Route className="w-3.5 h-3.5 text-primary" />
                  Nom du parcours
                </Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} maxLength={100} />
              </div>

              {/* Driver */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-primary" />
                  Chauffeur affecté
                </Label>
                <SearchableSelect
                  options={editDrivers.map(d => ({ value: d.user_id, label: d.full_name }))}
                  value={editDriverId}
                  onChange={setEditDriverId}
                  placeholder="Sélectionner un chauffeur"
                  searchPlaceholder="Rechercher un chauffeur…"
                />
              </div>


              {/* Pharmacies */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-primary" />
                  Pharmacies ({editSelectedPharmacyIds.size}/{editAxisPharmacies.length})
                </Label>
                <p className="text-xs text-muted-foreground">
                  Cochez pour ajouter une pharmacie au parcours (même hors de l'axe), décochez pour la retirer.
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={editPharmacySearch}
                    onChange={e => setEditPharmacySearch(e.target.value)}
                    placeholder="Rechercher une pharmacie..."
                    className="pl-9 h-9"
                  />
                </div>
                <div className="space-y-1 max-h-[25vh] overflow-y-auto border rounded-lg p-2">
                  {editAxisPharmacies.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Aucune pharmacie sur cet axe</p>
                  ) : visibleEditPharmacies.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Aucune pharmacie trouvée</p>
                  ) : visibleEditPharmacies.map(({ ap, i }) => (

                    <label
                      key={ap.pharmacy_id}
                      className={cn(
                        'flex items-center gap-3 py-2 px-3 rounded-lg cursor-pointer transition-colors',
                        editSelectedPharmacyIds.has(ap.pharmacy_id) ? 'bg-primary/5' : 'hover:bg-muted/50'
                      )}
                    >
                      <Checkbox
                        checked={editSelectedPharmacyIds.has(ap.pharmacy_id)}
                        onCheckedChange={() => toggleEditPharmacy(ap.pharmacy_id)}
                      />
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                      <span className="text-sm flex-1 truncate">{ap.pharmacy_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Colis per pharmacy */}
              <div className="space-y-3">
                <Label className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-primary" />
                  Colis ({editColisList.length})
                </Label>

                {editAxisPharmacies.filter(ap => editSelectedPharmacyIds.has(ap.pharmacy_id)).map(ap => {
                  const pharmColis = editColisList.filter(c => c.pharmacy_name === ap.pharmacy_name);
                  return (
                    <div key={ap.pharmacy_id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                          {ap.pharmacy_name}
                          <span className="text-xs text-muted-foreground ml-1">({pharmColis.length} colis)</span>
                        </p>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addEditColis(ap.pharmacy_id)}>
                          <Plus className="w-3 h-3 mr-1" /> Ajouter
                        </Button>
                      </div>
                      {pharmColis.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">Aucun colis — cliquez sur Ajouter</p>
                      ) : pharmColis.map(c => (
                        <div key={c.id} className="flex items-center gap-2">
                          <Select value={c.type} onValueChange={v => {
                            setEditColisList(prev => prev.map(x => x.id === c.id ? { ...x, type: v } : x));
                          }}>
                            <SelectTrigger className="w-[90px] h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="carton">Carton</SelectItem>
                              <SelectItem value="sachet">Sachet</SelectItem>
                              <SelectItem value="bac">Bac</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            value={c.barcode}
                            onChange={e => {
                              setEditColisList(prev => prev.map(x => x.id === c.id ? { ...x, barcode: e.target.value } : x));
                            }}
                            className="h-8 text-xs flex-1"
                            placeholder="Code-barres"
                          />
                          <BarcodeScanButton
                            className="h-8 w-8"
                            onScan={(code) => {
                              setEditColisList(prev => prev.map(x => x.id === c.id ? { ...x, barcode: code } : x));
                            }}
                          />

                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => {
                            setEditColisList(prev => prev.filter(x => x.id !== c.id));
                          }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditParcours(null)}>Annuler</Button>
            <Button onClick={handleEditSave} disabled={editSaving || !editName.trim() || editSelectedPharmacyIds.size === 0}>
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
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
