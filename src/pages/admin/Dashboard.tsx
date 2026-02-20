import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Package, Building2, Users, Truck, Clock, CheckCircle } from 'lucide-react';

interface Stats {
  totalDeliveries: number;
  pending: number;
  delivered: number;
  pharmacies: number;
  drivers: number;
  users: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ totalDeliveries: 0, pending: 0, delivered: 0, pharmacies: 0, drivers: 0, users: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [deliveriesRes, pharmaciesRes, driversRes, usersRes] = await Promise.all([
        supabase.from('deliveries').select('status'),
        supabase.from('pharmacies').select('id', { count: 'exact', head: true }),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('role', 'livreur'),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }),
      ]);

      const deliveries = deliveriesRes.data || [];
      setStats({
        totalDeliveries: deliveries.length,
        pending: deliveries.filter(d => d.status === 'en_attente').length,
        delivered: deliveries.filter(d => d.status === 'livre').length,
        pharmacies: pharmaciesRes.count || 0,
        drivers: driversRes.count || 0,
        users: usersRes.count || 0,
      });
      setLoading(false);
    };
    fetchStats();
  }, []);

  const cards = [
    { label: 'Total livraisons', value: stats.totalDeliveries, icon: Package, color: 'text-primary' },
    { label: 'En attente', value: stats.pending, icon: Clock, color: 'text-warning' },
    { label: 'Livrées', value: stats.delivered, icon: CheckCircle, color: 'text-success' },
    { label: 'Pharmacies', value: stats.pharmacies, icon: Building2, color: 'text-info' },
    { label: 'Livreurs', value: stats.drivers, icon: Truck, color: 'text-primary' },
    { label: 'Utilisateurs', value: stats.users, icon: Users, color: 'text-muted-foreground' },
  ];

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-muted-foreground">Vue d'ensemble de l'activité</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {cards.map((c) => (
            <Card key={c.label} className="card-hover">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{loading ? '...' : c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
