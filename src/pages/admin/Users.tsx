import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Search, Trash2, Key, Loader2 } from 'lucide-react';

interface UserProfile {
  user_id: string;
  full_name: string;
  email: string;
  username: string | null;
  role: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [pharmacies, setPharmacies] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ fullName: '', email: '', password: '', username: '', role: 'livreur' as string, pharmacyId: '' });

  const fetchData = useCallback(async () => {
    const [profilesRes, rolesRes, pharRes] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name, email, username'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('pharmacies').select('id, name').order('name'),
    ]);

    const roleMap = new Map((rolesRes.data || []).map(r => [r.user_id, r.role]));
    setUsers((profilesRes.data || []).map(p => ({
      ...p,
      role: roleMap.get(p.user_id) || 'unknown',
    })));
    setPharmacies(pharRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim() || !form.password.trim()) return;
    setSaving(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: form.email.trim(),
          password: form.password.trim(),
          fullName: form.fullName.trim(),
          username: form.username.trim() || null,
          role: form.role,
          pharmacyId: form.role === 'pharmacie' ? form.pharmacyId : null,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || 'Erreur lors de la création');
      } else {
        toast.success('Utilisateur créé');
        setCreateOpen(false);
        setForm({ fullName: '', email: '', password: '', username: '', role: 'livreur', pharmacyId: '' });
        fetchData();
      }
    } catch {
      toast.error('Erreur réseau');
    }
    setSaving(false);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    const { data, error } = await supabase.functions.invoke('delete-user', { body: { userId } });
    if (error || data?.error) toast.error(data?.error || 'Erreur');
    else { toast.success('Supprimé'); fetchData(); }
  };

  const handlePasswordUpdate = async () => {
    if (!newPassword.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('update-password', {
      body: { userId: selectedUserId, newPassword: newPassword.trim() },
    });
    if (error || data?.error) toast.error(data?.error || 'Erreur');
    else { toast.success('Mot de passe mis à jour'); setPasswordOpen(false); setNewPassword(''); }
    setSaving(false);
  };

  const roleLabel = (r: string) => r === 'admin' ? 'Admin' : r === 'livreur' ? 'Livreur' : r === 'pharmacie' ? 'Pharmacie' : r;
  const roleColor = (r: string) => r === 'admin' ? 'destructive' : r === 'livreur' ? 'default' : 'secondary';

  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold">Utilisateurs</h1>
          <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-2" />Ajouter</Button>
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
                    <TableHead>Nom</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Aucun utilisateur</TableCell></TableRow>
                  ) : filtered.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium">{u.full_name}</TableCell>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell><Badge variant={roleColor(u.role) as any}>{roleLabel(u.role)}</Badge></TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedUserId(u.user_id); setPasswordOpen(true); }} title="Changer le mot de passe">
                          <Key className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(u.user_id)} className="text-destructive hover:text-destructive">
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

        {/* Create user dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nouvel utilisateur</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>Nom complet</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Nom d'utilisateur (optionnel)</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
              <div className="space-y-2"><Label>Mot de passe</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
              <div className="space-y-2">
                <Label>Rôle</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrateur</SelectItem>
                    <SelectItem value="livreur">Livreur</SelectItem>
                    <SelectItem value="pharmacie">Pharmacie</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.role === 'pharmacie' && (
                <div className="space-y-2">
                  <Label>Pharmacie à associer</Label>
                  <Select value={form.pharmacyId} onValueChange={(v) => setForm({ ...form, pharmacyId: v })}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>{pharmacies.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Créer</Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Password dialog */}
        <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Changer le mot de passe</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Nouveau mot de passe</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
              <Button onClick={handlePasswordUpdate} className="w-full" disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Mettre à jour</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
