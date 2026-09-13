import { useEffect, useState, useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { apiMonitor } from '@/lib/api-monitor';

import { Package, Building2, Users, Truck, Clock, CheckCircle, TrendingUp, MapPin, CalendarDays, BarChart3 } from 'lucide-react';
import { format, subDays, startOfDay, isToday, isYesterday } from 'date-fns';
import { fr } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface Stats {
  totalDeliveries: number;
  pending: number;
  delivered: number;
  pharmacies: number;
  pharmaciesWithGps: number;
  drivers: number;
  users: number;
  todayDeliveries: number;
  todayDelivered: number;
  deliveryRate: number;
  totalBacsPending: number;
  totalBacsRecovered: number;
}

interface RecentDelivery {
  id: string;
  reference: string;
  status: string;
  created_at: string;
  delivered_at: string | null;
  pharmacy_name: string;
  driver_name: string | null;
}

interface DailyData {
  day: string;
  créées: number;
  livrées: number;
}

const CACHE_KEY = 'dpci_admin_dashboard';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function cacheKeyFor(scopeKey: string) {
  return `${CACHE_KEY}_${scopeKey}`;
}

function getCachedData(scopeKey: string) {
  try {
    const raw = localStorage.getItem(cacheKeyFor(scopeKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL) return null;
    return parsed.data;
  } catch { return null; }
}

function setCachedData(scopeKey: string, data: any) {
  try {
    localStorage.setItem(cacheKeyFor(scopeKey), JSON.stringify({ data, timestamp: Date.now() }));
  } catch {}
}


export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalDeliveries: 0, pending: 0, delivered: 0, pharmacies: 0, pharmaciesWithGps: 0,
    drivers: 0, users: 0, todayDeliveries: 0, todayDelivered: 0, deliveryRate: 0,
    totalBacsPending: 0, totalBacsRecovered: 0,
  });
  const [recentDeliveries, setRecentDeliveries] = useState<RecentDelivery[]>([]);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [topPharmacies, setTopPharmacies] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef<string | null>(null);

  const { role, siteId, siteName } = useAuth();
  const isSuperAdmin = role === 'super_admin';
  const scopeKey = isSuperAdmin ? 'all' : (siteId || 'none');

  const fetchStats = useCallback(async (forceRefresh = false) => {
    // Use cache if available and not forcing refresh
    if (!forceRefresh) {
      const cached = getCachedData(scopeKey);
      if (cached) {
        setStats(cached.stats);
        setRecentDeliveries(cached.recentDeliveries);
        setDailyData(cached.dailyData);
        setTopPharmacies(cached.topPharmacies);
        setLoading(false);
        return;
      }
    }

    // Restrict everything to the admin's own site (super admins see all sites)
    const restrictToSite = !isSuperAdmin && !!siteId;
    const scoped = (q: any) => (restrictToSite ? q.eq('site_id', siteId) : q);

    try {
      const todayStart = startOfDay(new Date()).toISOString();
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();

      const [
        totalRes, pendingRes, deliveredRes,
        pharmaciesListRes,
        todayCreatedRes, todayDeliveredRes,
        recentRes, last7daysRes, profilesRes,
      ] = await Promise.all([
        scoped(supabase.from('deliveries').select('id', { count: 'exact', head: true })),
        scoped(supabase.from('deliveries').select('id', { count: 'exact', head: true }).eq('status', 'en_attente')),
        scoped(supabase.from('deliveries').select('id', { count: 'exact', head: true }).eq('status', 'livre')),
        scoped(supabase.from('pharmacies').select('id, name, latitude')),
        scoped(supabase.from('deliveries').select('id', { count: 'exact', head: true }).gte('created_at', todayStart)),
        scoped(supabase.from('deliveries').select('id', { count: 'exact', head: true }).eq('status', 'livre').gte('delivered_at', todayStart)),
        scoped(supabase.from('deliveries').select('id, reference, status, created_at, delivered_at, pharmacy_id, driver_id').order('created_at', { ascending: false }).limit(5)),
        scoped(supabase.from('deliveries').select('created_at, delivered_at, status, pharmacy_id').gte('created_at', sevenDaysAgo)),
        scoped(supabase.from('profiles').select('user_id, full_name').eq('is_active', true)),
      ]);

      apiMonitor.record('/rest/v1/deliveries', 'GET', 200);

      const pharmacyRows = (pharmaciesListRes.data || []) as any[];
      const pharmacyIds = pharmacyRows.map((p) => p.id);
      const profileRows = (profilesRes.data || []) as any[];
      const profileIds = profileRows.map((p) => p.user_id);

      // Roles + bacs are scoped through the site's users / pharmacies
      const [rolesRes, bacsBalanceRes] = await Promise.all([
        profileIds.length
          ? supabase.from('user_roles').select('user_id, role').in('user_id', profileIds)
          : Promise.resolve({ data: [] as any[] }),
        pharmacyIds.length
          ? supabase.from('pharmacy_bacs_balance').select('pending_bacs, pharmacy_id').in('pharmacy_id', pharmacyIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const roleRows = ((rolesRes as any).data || []) as any[];
      const driversCount = roleRows.filter((r) => r.role === 'livreur').length;
      const usersCount = roleRows.filter((r) => r.role === 'admin' || r.role === 'super_admin' || r.role === 'livreur').length;

      const total = totalRes.count || 0;
      const pendingCount = pendingRes.count || 0;
      const deliveredCount = deliveredRes.count || 0;
      const pharmaciesCount = pharmacyRows.length;
      const pharmaciesGpsCount = pharmacyRows.filter((p) => p.latitude !== null && p.latitude !== undefined).length;
      const todayCreated = todayCreatedRes.count || 0;
      const todayDelivered = todayDeliveredRes.count || 0;
      const deliveryRate = total > 0 ? Math.round((deliveredCount / total) * 100) : 0;

      // Bacs stats
      const bacsData = ((bacsBalanceRes as any).data || []) as any[];
      const totalBacsPending = bacsData.reduce((sum: number, b: any) => sum + (b.pending_bacs || 0), 0);

      // Sum bacs_recovered from delivered deliveries of the same scope
      const { data: bacsRecoveredData } = await scoped(
        supabase
          .from('deliveries')
          .select('bacs_recovered')
          .eq('status', 'livre')
          .gt('bacs_recovered', 0)
      );
      const totalBacsRecovered = (bacsRecoveredData || []).reduce((sum: number, d: any) => sum + (d.bacs_recovered || 0), 0);


      const newStats: Stats = {
        totalDeliveries: total,
        pending: pendingCount,
        delivered: deliveredCount,
        pharmacies: pharmaciesCount,
        pharmaciesWithGps: pharmaciesGpsCount,
        drivers: driversCount,
        users: usersCount,
        todayDeliveries: todayCreated,
        todayDelivered: todayDelivered,
        deliveryRate,
        totalBacsPending,
        totalBacsRecovered,
      };
      setStats(newStats);

      // Recent deliveries - pharmacy names come from the scoped pharmacy list
      const recentDels = (recentRes.data || []) as any[];
      const pharMap = new Map<string, string>(pharmacyRows.map((p) => [p.id, p.name]));
      const profileMap = new Map(profileRows.map((p) => [p.user_id, p.full_name]));


      const recent: RecentDelivery[] = recentDels.map(d => ({
        id: d.id,
        reference: d.reference,
        status: d.status,
        created_at: d.created_at,
        delivered_at: d.delivered_at,
        pharmacy_name: pharMap.get(d.pharmacy_id) || '—',
        driver_name: d.driver_id ? profileMap.get(d.driver_id) || null : null,
      }));
      setRecentDeliveries(recent);

      // Daily chart from last 7 days data only
      const last7 = (last7daysRes.data || []) as any[];
      const days: DailyData[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dayStr = format(date, 'yyyy-MM-dd');
        const label = isToday(date) ? "Auj." : isYesterday(date) ? "Hier" : format(date, 'EEE', { locale: fr });
        const created = last7.filter(d => format(new Date(d.created_at), 'yyyy-MM-dd') === dayStr).length;
        const deliveredDay = last7.filter(d => d.delivered_at && format(new Date(d.delivered_at), 'yyyy-MM-dd') === dayStr).length;
        days.push({ day: label, créées: created, livrées: deliveredDay });
      }
      setDailyData(days);

      // Top pharmacies from last 7 days (same scope)
      const pharmaCounts = new Map<string, number>();
      last7.forEach(d => {
        const name = pharMap.get(d.pharmacy_id) || 'Inconnue';
        pharmaCounts.set(name, (pharmaCounts.get(name) || 0) + 1);
      });

      const sorted = Array.from(pharmaCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
      setTopPharmacies(sorted);

      // Cache results
      setCachedData(scopeKey, { stats: newStats, recentDeliveries: recent, dailyData: days, topPharmacies: sorted });
    } catch {
      // Use cached data as fallback
      const cached = getCachedData(scopeKey);
      if (cached) {
        setStats(cached.stats);
        setRecentDeliveries(cached.recentDeliveries);
        setDailyData(cached.dailyData);
        setTopPharmacies(cached.topPharmacies);
      }
    } finally {
      setLoading(false);
    }
  }, [scopeKey, siteId, isSuperAdmin]);

  useEffect(() => {
    // Wait until the site of a regular admin is known so figures stay consistent
    if (!isSuperAdmin && !siteId) return;
    if (fetchedRef.current === scopeKey) return;
    fetchedRef.current = scopeKey;
    fetchStats();
  }, [fetchStats, scopeKey, siteId, isSuperAdmin]);


  const summaryCards = [
    { label: 'Total livraisons', value: stats.totalDeliveries, icon: Package, color: 'text-primary' },
    { label: 'En attente', value: stats.pending, icon: Clock, color: 'text-warning' },
    { label: 'Livrées', value: stats.delivered, icon: CheckCircle, color: 'text-success' },
    { label: 'Pharmacies', value: stats.pharmacies, icon: Building2, color: 'text-info' },
    { label: 'Livreurs', value: stats.drivers, icon: Truck, color: 'text-primary' },
    { label: 'Bacs en attente', value: stats.totalBacsPending, icon: Package, color: 'text-warning' },
    { label: 'Bacs récupérés', value: stats.totalBacsRecovered, icon: CheckCircle, color: 'text-success' },
  ];

  const PIE_COLORS = ['hsl(152, 72%, 30%)', 'hsl(38, 92%, 50%)'];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isToday(d)) return `Aujourd'hui ${format(d, 'HH:mm')}`;
    if (isYesterday(d)) return `Hier ${format(d, 'HH:mm')}`;
    return format(d, 'dd MMM HH:mm', { locale: fr });
  };

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-muted-foreground">Vue d'ensemble de l'activité</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {summaryCards.map((c) => (
            <Card key={c.label} className="card-hover">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
                <c.icon className={`w-4 h-4 ${c.color}`} />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-bold">{loading ? '...' : c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Today + Delivery Rate */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                Aujourd'hui
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{loading ? '...' : stats.todayDeliveries}</span>
                <span className="text-sm text-muted-foreground">livraisons créées</span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-semibold text-success">{loading ? '...' : stats.todayDelivered}</span>
                <span className="text-sm text-muted-foreground">livrées</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-success" />
                Taux de livraison
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-3xl font-bold">...</p>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Livrées', value: stats.delivered },
                            { name: 'En attente', value: stats.pending },
                          ]}
                          innerRadius={22}
                          outerRadius={36}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          <Cell fill={PIE_COLORS[0]} />
                          <Cell fill={PIE_COLORS[1]} />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{stats.deliveryRate}%</p>
                    <p className="text-xs text-muted-foreground">{stats.delivered}/{stats.totalDeliveries}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MapPin className="w-4 h-4 text-info" />
                Couverture GPS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{loading ? '...' : stats.pharmaciesWithGps}</span>
                <span className="text-sm text-muted-foreground">/ {stats.pharmacies} pharmacies</span>
              </div>
              {!loading && stats.pharmacies > 0 && (
                <div className="mt-2">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-info rounded-full transition-all"
                      style={{ width: `${Math.round((stats.pharmaciesWithGps / stats.pharmacies) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {Math.round((stats.pharmaciesWithGps / stats.pharmacies) * 100)}% géolocalisées
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chart + Top pharmacies */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Activité des 7 derniers jours
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground">Chargement...</div>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyData}>
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={30} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                      />
                      <Bar dataKey="créées" fill="hsl(190, 70%, 40%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="livrées" fill="hsl(152, 72%, 30%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="w-4 h-4 text-info" />
                Top pharmacies
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground text-sm">Chargement...</p>
              ) : topPharmacies.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucune donnée</p>
              ) : (
                <div className="space-y-3">
                  {topPharmacies.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${topPharmacies[0] ? (p.count / topPharmacies[0].count) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{p.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent deliveries */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Dernières livraisons
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">Chargement...</p>
            ) : recentDeliveries.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucune livraison</p>
            ) : (
              <div className="space-y-3">
                {recentDeliveries.map(d => (
                  <div key={d.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{d.reference}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          d.status === 'livre'
                            ? 'bg-success/10 text-success'
                            : 'bg-warning/10 text-warning'
                        }`}>
                          {d.status === 'livre' ? 'Livrée' : 'En attente'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {d.pharmacy_name}{d.driver_name ? ` · ${d.driver_name}` : ''}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(d.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
