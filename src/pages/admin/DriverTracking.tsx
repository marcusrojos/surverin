import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Loader2, Truck, Package, CheckCircle } from 'lucide-react';

interface DriverWithDeliveries {
  user_id: string;
  full_name: string;
  email: string;
  total: number;
  pending: number;
  delivered: number;
}

export default function AdminDriverTracking() {
  const [drivers, setDrivers] = useState<DriverWithDeliveries[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: driverRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'livreur');
    if (!driverRoles?.length) { setLoading(false); return; }

    const driverIds = driverRoles.map(r => r.user_id);
    const [profilesRes, deliveriesRes] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name, email').in('user_id', driverIds),
      supabase.from('deliveries').select('driver_id, status').in('driver_id', driverIds),
    ]);

    const deliveryMap = new Map<string, { total: number; pending: number; delivered: number }>();
    (deliveriesRes.data || []).forEach(d => {
      if (!d.driver_id) return;
      const curr = deliveryMap.get(d.driver_id) || { total: 0, pending: 0, delivered: 0 };
      curr.total++;
      if (d.status === 'en_attente') curr.pending++;
      else curr.delivered++;
      deliveryMap.set(d.driver_id, curr);
    });

    setDrivers((profilesRes.data || []).map(p => ({
      ...p,
      ...(deliveryMap.get(p.user_id) || { total: 0, pending: 0, delivered: 0 }),
    })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Suivi des chauffeurs</h1>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : drivers.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">Aucun livreur enregistré</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {drivers.map(d => (
              <Card key={d.user_id} className="card-hover">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Truck className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{d.full_name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{d.email}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-accent/50">
                      <Package className="w-4 h-4 mx-auto mb-1 text-primary" />
                      <p className="text-lg font-bold">{d.total}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="p-2 rounded-lg bg-warning/10">
                      <p className="text-lg font-bold text-warning">{d.pending}</p>
                      <p className="text-xs text-muted-foreground">En attente</p>
                    </div>
                    <div className="p-2 rounded-lg bg-success/10">
                      <CheckCircle className="w-4 h-4 mx-auto mb-1 text-success" />
                      <p className="text-lg font-bold text-success">{d.delivered}</p>
                      <p className="text-xs text-muted-foreground">Livrées</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
