import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Loader2, Network, Building2, Users, ClipboardList, Package, FileDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import jsPDF from 'jspdf';

interface SiteRow {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  pharmacies: number;
  parcours: number;
  admins: number;
  deliveries: number;
}

const siteSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  address: z.string().optional(),
  phone: z.string().optional(),
});

export default function SitesPage() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<SiteRow | null>(null);
  const [formData, setFormData] = useState({ name: '', address: '', phone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const fetchSites = useCallback(async () => {
    try {
      const [{ data: sitesData }, { data: pharmacies }, { data: parcours }, { data: deliveries }, { data: profiles }, { data: roles }] =
        await Promise.all([
          supabase.from('sites').select('*').order('name'),
          supabase.from('pharmacies').select('id, site_id'),
          supabase.from('parcours').select('id, site_id'),
          supabase.from('deliveries').select('id, site_id'),
          supabase.from('profiles').select('user_id, site_id'),
          supabase.from('user_roles').select('user_id, role'),
        ]);

      const adminUserIds = new Set(
        (roles || []).filter((r: any) => r.role === 'admin').map((r: any) => r.user_id)
      );
      const profileSite = new Map((profiles || []).map((p: any) => [p.user_id, p.site_id]));

      const rows: SiteRow[] = (sitesData || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        phone: s.phone,
        is_active: s.is_active,
        created_at: s.created_at,
        pharmacies: (pharmacies || []).filter((p: any) => p.site_id === s.id).length,
        parcours: (parcours || []).filter((p: any) => p.site_id === s.id).length,
        deliveries: (deliveries || []).filter((d: any) => d.site_id === s.id).length,
        admins: [...adminUserIds].filter((uid) => profileSite.get(uid) === s.id).length,
      }));

      setSites(rows);
    } catch {
      toast.error('Erreur lors du chargement des sites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  const openDialog = (site?: SiteRow) => {
    setErrors({});
    if (site) {
      setSelected(site);
      setFormData({ name: site.name, address: site.address || '', phone: site.phone || '' });
    } else {
      setSelected(null);
      setFormData({ name: '', address: '', phone: '' });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    setErrors({});
    const validation = siteSchema.safeParse(formData);
    if (!validation.success) {
      const fe: Record<string, string> = {};
      validation.error.errors.forEach((e) => { fe[e.path[0] as string] = e.message; });
      setErrors(fe);
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        address: formData.address.trim() || null,
        phone: formData.phone.trim() || null,
      };
      if (selected) {
        const { error } = await supabase.from('sites').update(payload).eq('id', selected.id);
        if (error) throw error;
        toast.success('Site modifié');
      } else {
        const { error } = await supabase.from('sites').insert(payload);
        if (error) throw error;
        toast.success('Site créé');
      }
      setIsDialogOpen(false);
      fetchSites();
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (site: SiteRow) => {
    try {
      const { error } = await supabase.from('sites').update({ is_active: !site.is_active }).eq('id', site.id);
      if (error) throw error;
      setSites((prev) => prev.map((s) => (s.id === site.id ? { ...s, is_active: !s.is_active } : s)));
    } catch {
      toast.error('Erreur lors de la modification du statut');
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    try {
      const { error } = await supabase.from('sites').delete().eq('id', selected.id);
      if (error) throw error;
      toast.success('Site supprimé');
      setIsDeleteOpen(false);
      fetchSites();
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de la suppression');
    }
  };

  const totals = sites.reduce(
    (acc, s) => ({
      pharmacies: acc.pharmacies + s.pharmacies,
      parcours: acc.parcours + s.parcours,
      deliveries: acc.deliveries + s.deliveries,
      admins: acc.admins + s.admins,
    }),
    { pharmacies: 0, parcours: 0, deliveries: 0, admins: 0 }
  );

  return (
    <DashboardLayout requiredRole="super_admin">
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Network className="w-7 h-7 text-primary" /> Sites
            </h1>
            <p className="text-muted-foreground mt-1">Vue d'ensemble et gestion de tous les sites</p>
          </div>
          <Button onClick={() => openDialog()} className="shadow-primary">
            <Plus className="w-4 h-4 mr-2" /> Nouveau site
          </Button>
        </div>

        {/* Overview totals */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Sites', value: sites.length, icon: Network },
            { label: 'Pharmacies', value: totals.pharmacies, icon: Building2 },
            { label: 'Parcours', value: totals.parcours, icon: ClipboardList },
            { label: 'Livraisons', value: totals.deliveries, icon: Package },
          ].map((c) => (
            <div key={c.label} className="bg-card rounded-xl border p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <c.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : sites.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Network className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Aucun site</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sites.map((site) => (
              <div key={site.id} className={`bg-card rounded-xl border p-5 space-y-4 ${!site.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-lg">{site.name}</h3>
                    {site.address && <p className="text-sm text-muted-foreground">{site.address}</p>}
                    {site.phone && <p className="text-sm text-muted-foreground">{site.phone}</p>}
                  </div>
                  <Badge variant={site.is_active ? 'default' : 'secondary'}>
                    {site.is_active ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /> {site.pharmacies} pharmacies</span>
                  <span className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-muted-foreground" /> {site.parcours} parcours</span>
                  <span className="flex items-center gap-2"><Package className="w-4 h-4 text-muted-foreground" /> {site.deliveries} livraisons</span>
                  <span className="flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" /> {site.admins} admins</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Switch checked={site.is_active} onCheckedChange={() => handleToggle(site)} />
                    <span className="text-xs text-muted-foreground">Actif</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openDialog(site)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => { setSelected(site); setIsDeleteOpen(true); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selected ? 'Modifier le site' : 'Nouveau site'}</DialogTitle>
              <DialogDescription>Renseignez les informations du site</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom *</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Site de Dakar" className={errors.name ? 'border-destructive' : ''} />
                {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Adresse</Label>
                <Input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Adresse du site" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+221 ..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ce site ?</AlertDialogTitle>
              <AlertDialogDescription>
                Le site « {selected?.name} » sera supprimé. Les données associées (pharmacies, parcours, etc.) ne seront plus rattachées à aucun site.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
