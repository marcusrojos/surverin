import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Route, Loader2 } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type Axis = Database['public']['Tables']['axes']['Row'];
type AxisPharmacy = Database['public']['Tables']['axis_pharmacies']['Row'];
type Pharmacy = Database['public']['Tables']['pharmacies']['Row'];

export default function AdminAxes() {
  const [axes, setAxes] = useState<(Axis & { pharmacies: (AxisPharmacy & { pharmacy?: Pharmacy })[] })[]>([]);
  const [allPharmacies, setAllPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const [axesRes, apRes, pharRes] = await Promise.all([
      supabase.from('axes').select('*').order('name'),
      supabase.from('axis_pharmacies').select('*').order('position'),
      supabase.from('pharmacies').select('*').order('name'),
    ]);

    const pharMap = new Map((pharRes.data || []).map(p => [p.id, p]));
    setAllPharmacies(pharRes.data || []);

    const apByAxis = new Map<string, (AxisPharmacy & { pharmacy?: Pharmacy })[]>();
    (apRes.data || []).forEach(ap => {
      const list = apByAxis.get(ap.axis_id) || [];
      list.push({ ...ap, pharmacy: pharMap.get(ap.pharmacy_id) });
      apByAxis.set(ap.axis_id, list);
    });

    setAxes((axesRes.data || []).map(a => ({ ...a, pharmacies: apByAxis.get(a.id) || [] })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => { setEditingId(null); setForm({ name: '', description: '' }); setDialogOpen(true); };
  const openEdit = (a: Axis) => { setEditingId(a.id); setForm({ name: a.name, description: a.description || '' }); setDialogOpen(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);

    if (editingId) {
      const { error } = await supabase.from('axes').update({ name: form.name.trim(), description: form.description || null }).eq('id', editingId);
      if (error) toast.error('Erreur'); else toast.success('Axe mis à jour');
    } else {
      const { error } = await supabase.from('axes').insert({ name: form.name.trim(), description: form.description || null });
      if (error) toast.error('Erreur'); else toast.success('Axe créé');
    }
    setDialogOpen(false);
    setSaving(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cet axe ?')) return;
    await supabase.from('axis_pharmacies').delete().eq('axis_id', id);
    const { error } = await supabase.from('axes').delete().eq('id', id);
    if (error) toast.error('Erreur'); else { toast.success('Supprimé'); fetchData(); }
  };

  const handleAddPharmacy = async (axisId: string, pharmacyId: string) => {
    const axis = axes.find(a => a.id === axisId);
    const pos = axis ? axis.pharmacies.length : 0;
    const { error } = await supabase.from('axis_pharmacies').insert({ axis_id: axisId, pharmacy_id: pharmacyId, position: pos });
    if (error) toast.error('Erreur'); else fetchData();
  };

  const handleRemovePharmacy = async (apId: string) => {
    const { error } = await supabase.from('axis_pharmacies').delete().eq('id', apId);
    if (error) toast.error('Erreur'); else fetchData();
  };

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Axes de livraison</h1>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nouvel axe</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : axes.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">Aucun axe configuré</p>
        ) : (
          <div className="grid gap-4">
            {axes.map(a => (
              <Card key={a.id} className="card-hover">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Route className="w-5 h-5 text-primary" />
                      <CardTitle className="text-lg">{a.name}</CardTitle>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Edit className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                  {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Pharmacies ({a.pharmacies.length})</p>
                    {a.pharmacies.map((ap, i) => (
                      <div key={ap.id} className="flex items-center justify-between p-2 rounded bg-accent/30">
                        <span className="text-sm"><span className="font-mono text-xs text-muted-foreground mr-2">{i + 1}.</span>{ap.pharmacy?.name || '—'}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemovePharmacy(ap.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    ))}
                    <select
                      className="w-full text-sm border rounded px-2 py-1 bg-background"
                      value=""
                      onChange={(e) => { if (e.target.value) handleAddPharmacy(a.id, e.target.value); }}
                    >
                      <option value="">+ Ajouter une pharmacie…</option>
                      {allPharmacies
                        .filter(p => !a.pharmacies.some(ap => ap.pharmacy_id === p.id))
                        .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? 'Modifier' : 'Nouvel'} axe</DialogTitle></DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2"><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{editingId ? 'Mettre à jour' : 'Créer'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
