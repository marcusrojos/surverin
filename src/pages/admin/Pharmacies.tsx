import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Search, Trash2, Edit, Loader2 } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type Pharmacy = Database['public']['Tables']['pharmacies']['Row'];

export default function AdminPharmacies() {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', address: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from('pharmacies').select('*').order('name');
    setPharmacies(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openEdit = (p: Pharmacy) => {
    setEditingId(p.id);
    setForm({ name: p.name, address: p.address || '', phone: p.phone || '', email: p.email || '' });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm({ name: '', address: '', phone: '', email: '' });
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);

    if (editingId) {
      const { error } = await supabase.from('pharmacies').update({
        name: form.name.trim(),
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
      }).eq('id', editingId);
      if (error) toast.error('Erreur'); else toast.success('Pharmacie mise à jour');
    } else {
      const { data: code } = await supabase.rpc('generate_client_code');
      const { error } = await supabase.from('pharmacies').insert({
        name: form.name.trim(),
        client_code: code || `PH-${Date.now()}`,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
      });
      if (error) toast.error('Erreur'); else toast.success('Pharmacie créée');
    }
    setDialogOpen(false);
    setSaving(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette pharmacie ?')) return;
    const { error } = await supabase.from('pharmacies').delete().eq('id', id);
    if (error) toast.error('Erreur'); else { toast.success('Supprimée'); fetchData(); }
  };

  const filtered = pharmacies.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.client_code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold">Pharmacies</h1>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Ajouter</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code client</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Adresse</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucune pharmacie</TableCell></TableRow>
                  ) : filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono">{p.client_code}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.address || '—'}</TableCell>
                      <TableCell className="text-sm">{p.phone || '—'}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? 'Modifier' : 'Nouvelle'} pharmacie</DialogTitle></DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2"><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Adresse</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="space-y-2"><Label>Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{editingId ? 'Mettre à jour' : 'Créer'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
