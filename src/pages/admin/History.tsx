import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { History as HistoryIcon, Loader2, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_label: string | null;
  actor_name: string | null;
  site_id: string | null;
  created_at: string;
}

const ENTITY_LABELS: Record<string, string> = {
  profiles: 'Utilisateur',
  pharmacies: 'Pharmacie',
  parcours: 'Parcours',
  axes: 'Axe',
  sites: 'Site',
  user_roles: 'Rôle',
};

const ACTION_META: Record<string, { label: string; className: string }> = {
  creation: { label: 'Création', className: 'bg-green-100 text-green-700 hover:bg-green-100' },
  modification: { label: 'Modification', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  suppression: { label: 'Suppression', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  desactivation: { label: 'Désactivation', className: 'bg-orange-100 text-orange-700 hover:bg-orange-100' },
  reactivation: { label: 'Réactivation', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
};

export default function HistoryPage() {
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState('all');
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [{ data, error }, { data: sitesData }] = await Promise.all([
        supabase
          .from('audit_logs')
          .select('id, action, entity_type, entity_label, actor_name, site_id, created_at')
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase.from('sites').select('id, name'),
      ]);
      if (error) throw error;
      setSites((sitesData || []).map((s: any) => ({ id: s.id, name: s.name })));
      setRows((data || []) as AuditRow[]);
    } catch {
      toast.error("Erreur lors du chargement de l'historique");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (r.entity_label || '').toLowerCase().includes(q) ||
      (r.actor_name || '').toLowerCase().includes(q) ||
      (ENTITY_LABELS[r.entity_type] || r.entity_type).toLowerCase().includes(q);
    const matchesAction = actionFilter === 'all' || r.action === actionFilter;
    const matchesEntity = entityFilter === 'all' || r.entity_type === entityFilter;
    const matchesSite = siteFilter === 'all' || r.site_id === siteFilter;
    return matchesSearch && matchesAction && matchesEntity && matchesSite;
  });

  return (
    <DashboardLayout requiredRole="admin" allowSuperAdmin>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <HistoryIcon className="w-7 h-7 text-primary" /> Historique
            </h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Journal inviolable des créations, modifications, suppressions, désactivations et réactivations
            </p>
          </div>
          <div className="bg-card rounded-xl border px-5 py-3">
            <p className="text-2xl font-bold">{filtered.length}</p>
            <p className="text-xs text-muted-foreground">Événements</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Rechercher (élément, auteur)..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les actions</SelectItem>
              {Object.entries(ACTION_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isSuperAdmin && (
            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Tous les sites" /></SelectTrigger>
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
              <HistoryIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Aucun événement</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & heure</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Élément</TableHead>
                  <TableHead>Auteur</TableHead>
                  {isSuperAdmin && <TableHead className="hidden md:table-cell">Site</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const meta = ACTION_META[r.action] || { label: r.action, className: '' };
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString('fr-FR', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell><Badge className={meta.className}>{meta.label}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{ENTITY_LABELS[r.entity_type] || r.entity_type}</TableCell>
                      <TableCell className="font-medium">{r.entity_label || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{r.actor_name || 'Système'}</TableCell>
                      {isSuperAdmin && (
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {r.site_id ? (siteMap.get(r.site_id) || '—') : '—'}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
