import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useSiteFilter, SiteFilterSelect } from '@/components/admin/SiteFilter';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, GripVertical, Route, ArrowUp, ArrowDown } from 'lucide-react';

interface Pharmacy {
  id: string;
  name: string;
  client_code: string;
  address: string | null;
}

interface Axis {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  site_id: string | null;
  pharmacies: { id: string; pharmacy_id: string; position: number; pharmacy: Pharmacy }[];
}

export default function AdminAxes() {
  const { siteId } = useAuth();
  const [axes, setAxes] = useState<Axis[]>([]);
  const [allPharmacies, setAllPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingAxis, setEditingAxis] = useState<Axis | null>(null);
  const [deletingAxisId, setDeletingAxisId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [selectedPharmacies, setSelectedPharmacies] = useState<string[]>([]);
  const { isSuperAdmin, sites, siteFilter, setSiteFilter } = useSiteFilter();

  const fetchData = async () => {
    setLoading(true);
    const [axesRes, pharmaRes] = await Promise.all([
      supabase.from('axes').select('*').order('name'),
      supabase.from('pharmacies').select('id, name, client_code, address').order('name'),
    ]);

    if (pharmaRes.data) setAllPharmacies(pharmaRes.data);

    if (axesRes.data) {
      // Fetch axis_pharmacies for all axes
      const axisIds = axesRes.data.map(a => a.id);
      let axisPharmacies: any[] = [];
      if (axisIds.length > 0) {
        const { data } = await supabase
          .from('axis_pharmacies')
          .select('*')
          .in('axis_id', axisIds)
          .order('position');
        axisPharmacies = data || [];
      }

      const pharmaMap = new Map((pharmaRes.data || []).map(p => [p.id, p]));

      const enriched: Axis[] = axesRes.data.map(axis => ({
        ...axis,
        pharmacies: axisPharmacies
          .filter(ap => ap.axis_id === axis.id)
          .map(ap => ({ ...ap, pharmacy: pharmaMap.get(ap.pharmacy_id)! }))
          .filter(ap => ap.pharmacy),
      }));

      setAxes(enriched);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openCreate = () => {
    setEditingAxis(null);
    setFormName('');
    setFormDescription('');
    setSelectedPharmacies([]);
    setDialogOpen(true);
  };

  const openEdit = (axis: Axis) => {
    setEditingAxis(axis);
    setFormName(axis.name);
    setFormDescription(axis.description || '');
    setSelectedPharmacies(axis.pharmacies.map(p => p.pharmacy_id));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error("Le nom de l'axe est requis");
      return;
    }

    try {
      if (editingAxis) {
        // Update axis
        const { error } = await supabase.from('axes').update({
          name: formName.trim(),
          description: formDescription.trim() || null,
        }).eq('id', editingAxis.id);
        if (error) throw error;

        // Replace pharmacies: delete all, re-insert
        await supabase.from('axis_pharmacies').delete().eq('axis_id', editingAxis.id);

        if (selectedPharmacies.length > 0) {
          const rows = selectedPharmacies.map((pid, i) => ({
            axis_id: editingAxis.id,
            pharmacy_id: pid,
            position: i,
          }));
          const { error: insertErr } = await supabase.from('axis_pharmacies').insert(rows);
          if (insertErr) throw insertErr;
        }

        toast.success('Axe modifié');
      } else {
        // Create axis
        const { data, error } = await supabase.from('axes').insert({
          name: formName.trim(),
          description: formDescription.trim() || null,
          site_id: siteId,
        } as any).select().single();
        if (error) throw error;

        if (selectedPharmacies.length > 0) {
          const rows = selectedPharmacies.map((pid, i) => ({
            axis_id: data.id,
            pharmacy_id: pid,
            position: i,
          }));
          const { error: insertErr } = await supabase.from('axis_pharmacies').insert(rows);
          if (insertErr) throw insertErr;
        }

        toast.success('Axe créé');
      }

      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    }
  };

  const handleDelete = async () => {
    if (!deletingAxisId) return;
    const { error } = await supabase.from('axes').delete().eq('id', deletingAxisId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Axe supprimé');
      fetchData();
    }
    setDeleteDialogOpen(false);
    setDeletingAxisId(null);
  };

  const togglePharmacy = (pharmacyId: string) => {
    setSelectedPharmacies(prev =>
      prev.includes(pharmacyId)
        ? prev.filter(id => id !== pharmacyId)
        : [...prev, pharmacyId]
    );
  };

  const movePharmacy = (index: number, direction: 'up' | 'down') => {
    const newList = [...selectedPharmacies];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newList.length) return;
    [newList[index], newList[swapIndex]] = [newList[swapIndex], newList[index]];
    setSelectedPharmacies(newList);
  };

  const pharmaMap = new Map(allPharmacies.map(p => [p.id, p]));
  const filteredAxes = axes.filter(a => siteFilter === 'all' || a.site_id === siteFilter);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Gestion des axes</h1>
            <p className="text-muted-foreground">Définissez les parcours de livraison</p>
          </div>
          {!isSuperAdmin && (
            <Button onClick={openCreate} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Nouvel axe
            </Button>
          )}
        </div>

        {isSuperAdmin && (
          <SiteFilterSelect value={siteFilter} onChange={setSiteFilter} sites={sites} />
        )}

        {loading ? (
          <p className="text-muted-foreground">Chargement...</p>
        ) : filteredAxes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Route className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-muted-foreground">Aucun axe défini</p>
              <p className="text-sm text-muted-foreground">Créez un axe pour organiser vos parcours de livraison</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredAxes.map(axis => (
              <Card key={axis.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                  <div>
                    <CardTitle className="text-lg">{axis.name}</CardTitle>
                    {axis.description && (
                      <p className="text-sm text-muted-foreground mt-1">{axis.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => openEdit(axis)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => { setDeletingAxisId(axis.id); setDeleteDialogOpen(true); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {axis.pharmacies.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Aucune pharmacie assignée</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {axis.pharmacies.map((ap, i) => (
                        <Badge key={ap.id} variant="secondary" className="text-sm">
                          {i + 1}. {ap.pharmacy.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAxis ? "Modifier l'axe" : 'Nouvel axe'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nom *</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Axe Nord" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Description optionnelle" rows={2} />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Pharmacies ({selectedPharmacies.length} sélectionnées)
              </label>

              {/* Selected pharmacies with ordering */}
              {selectedPharmacies.length > 0 && (
                <div className="border rounded-lg p-3 mb-3 space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">Ordre du parcours :</p>
                  {selectedPharmacies.map((pid, i) => {
                    const p = pharmaMap.get(pid);
                    if (!p) return null;
                    return (
                      <div key={pid} className="flex items-center gap-2 py-1">
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium w-6">{i + 1}.</span>
                        <span className="text-sm flex-1">{p.name}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => movePharmacy(i, 'up')} disabled={i === 0}>
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => movePharmacy(i, 'down')} disabled={i === selectedPharmacies.length - 1}>
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* All pharmacies checklist */}
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {allPharmacies.map(p => (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                    <Checkbox
                      checked={selectedPharmacies.includes(p.id)}
                      onCheckedChange={() => togglePharmacy(p.id)}
                    />
                    <span className="text-sm">{p.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{p.client_code}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleSave}>{editingAxis ? 'Enregistrer' : 'Créer'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet axe ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'axe et ses associations seront supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
