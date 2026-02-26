import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
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

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalDeliveries: 0, pending: 0, delivered: 0, pharmacies: 0, pharmaciesWithGps: 0,
    drivers: 0, users: 0, todayDeliveries: 0, todayDelivered: 0, deliveryRate: 0,
  });
  const [recentDeliveries, setRecentDeliveries] = useState<RecentDelivery[]>([]);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [topPharmacies, setTopPharmacies] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [deliveriesRes, pharmaciesRes, driversRes, usersRes, profilesRes] = await Promise.all([
        supabase.from('deliveries').select('*'),
        supabase.from('pharmacies').select('id, name, latitude, longitude'),
        supabase.from('user_roles').select('id, user_id', { count: 'exact' }).eq('role', 'livreur'),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('user_id, full_name'),
      ]);

      const deliveries = deliveriesRes.data || [];
      const pharmacies = pharmaciesRes.data || [];
      const profiles = profilesRes.data || [];
      const todayStart = startOfDay(new Date()).toISOString();

      const todayDeliveries = deliveries.filter(d => d.created_at >= todayStart);
      const todayDelivered = todayDeliveries.filter(d => d.status === 'livre');
      const totalDelivered = deliveries.filter(d => d.status === 'livre').length;
      const deliveryRate = deliveries.length > 0 ? Math.round((totalDelivered / deliveries.length) * 100) : 0;

      setStats({
        totalDeliveries: deliveries.length,
        pending: deliveries.filter(d => d.status === 'en_attente').length,
        delivered: totalDelivered,
        pharmacies: pharmacies.length,
        pharmaciesWithGps: pharmacies.filter(p => p.latitude && p.longitude).length,
        drivers: driversRes.count || 0,
        users: usersRes.count || 0,
        todayDeliveries: todayDeliveries.length,
        todayDelivered: todayDelivered.length,
        deliveryRate,
      });

      // Recent deliveries (last 5)
      const pharMap = new Map(pharmacies.map(p => [p.id, p.name]));
      const profileMap = new Map(profiles.map(p => [p.user_id, p.full_name]));
      const recent = deliveries.slice(0, 5).map(d => ({
        id: d.id,
        reference: d.reference,
        status: d.status,
        created_at: d.created_at,
        delivered_at: d.delivered_at,
        pharmacy_name: pharMap.get(d.pharmacy_id) || '—',
        driver_name: d.driver_id ? profileMap.get(d.driver_id) || null : null,
      }));
      setRecentDeliveries(recent);

      // Daily chart data (last 7 days)
      const days: DailyData[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dayStr = format(date, 'yyyy-MM-dd');
        const label = isToday(date) ? "Auj." : isYesterday(date) ? "Hier" : format(date, 'EEE', { locale: fr });
        const created = deliveries.filter(d => format(new Date(d.created_at), 'yyyy-MM-dd') === dayStr).length;
        const delivered = deliveries.filter(d => d.delivered_at && format(new Date(d.delivered_at), 'yyyy-MM-dd') === dayStr).length;
        days.push({ day: label, créées: created, livrées: delivered });
      }
      setDailyData(days);

      // Top pharmacies by delivery count
      const pharmaCounts = new Map<string, number>();
      deliveries.forEach(d => {
        const name = pharMap.get(d.pharmacy_id) || 'Inconnue';
        pharmaCounts.set(name, (pharmaCounts.get(name) || 0) + 1);
      });
      const sorted = Array.from(pharmaCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
      setTopPharmacies(sorted);

      setLoading(false);
    };
    fetchStats();
  }, []);

  const summaryCards = [
    { label: 'Total livraisons', value: stats.totalDeliveries, icon: Package, color: 'text-primary' },
    { label: 'En attente', value: stats.pending, icon: Clock, color: 'text-warning' },
    { label: 'Livrées', value: stats.delivered, icon: CheckCircle, color: 'text-success' },
    { label: 'Pharmacies', value: stats.pharmacies, icon: Building2, color: 'text-info' },
    { label: 'Livreurs', value: stats.drivers, icon: Truck, color: 'text-primary' },
    { label: 'Utilisateurs', value: stats.users, icon: Users, color: 'text-muted-foreground' },
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
