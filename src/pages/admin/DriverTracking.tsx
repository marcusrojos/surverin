import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useSiteFilter, SiteFilterSelect } from '@/components/admin/SiteFilter';
import { MapPin, Clock, Package, User, CalendarDays, Loader2, CheckCircle2, AlertTriangle, Route } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Driver {
  user_id: string;
  full_name: string;
  site_id: string | null;
}

interface DeliveryRecord {
  id: string;
  reference: string;
  status: string;
  created_at: string;
  delivered_at: string | null;
  pharmacy_id: string;
  pharmacy_name: string;
  pharmacy_address: string | null;
  recipient_name: string | null;
  nb_cartons: number;
  nb_sachets: number;
  nb_barques: number;
  expected_position: number | null;
  parcours_id: string | null;
}

interface AxisInfo {
  name: string;
  respected: boolean;
  details: string;
}

interface ParcoursGroup {
  parcours_id: string;
  parcours_name: string;
  axis_name: string;
  deliveries: DeliveryRecord[];
  compliance: AxisInfo | null;
}

export default function DriverTrackingPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const { isSuperAdmin, sites, siteFilter, setSiteFilter } = useSiteFilter();
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [parcoursGroups, setParcoursGroups] = useState<ParcoursGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    fetchDrivers();
  }, []);

  useEffect(() => {
    if (selectedDriver) {
      fetchDriverDeliveries();
    }
  }, [selectedDriver, selectedDate]);

  const fetchDrivers = async () => {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'livreur');

    if (!roles?.length) return;

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, site_id')
      .in('user_id', roles.map(r => r.user_id));

    setDrivers(profiles || []);
  };

  const computeCompliance = (deliveries: DeliveryRecord[], axisName: string): AxisInfo | null => {
    const delivered = deliveries
      .filter(r => r.status === 'livre' && r.delivered_at && r.expected_position !== null)
      .sort((a, b) => new Date(a.delivered_at!).getTime() - new Date(b.delivered_at!).getTime());

    if (delivered.length < 2) {
      return {
        name: axisName,
        respected: true,
        details: 'Pas assez de livraisons terminées pour évaluer le respect du parcours.',
      };
    }

    let respected = true;
    const violations: string[] = [];
    for (let i = 1; i < delivered.length; i++) {
      if (delivered[i].expected_position! < delivered[i - 1].expected_position!) {
        respected = false;
        violations.push(
          `${delivered[i].pharmacy_name} (pos. ${(delivered[i].expected_position ?? 0) + 1}) livré après ${delivered[i - 1].pharmacy_name} (pos. ${(delivered[i - 1].expected_position ?? 0) + 1})`
        );
      }
    }

    return {
      name: axisName,
      respected,
      details: respected
        ? `Les ${delivered.length} livraisons suivent l'ordre prévu de l'axe.`
        : `${violations.length} inversion(s) : ${violations.join(' ; ')}`,
    };
  };

  const fetchDriverDeliveries = async () => {
    setLoading(true);
    setParcoursGroups([]);
    try {
      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      const { data } = await supabase
        .from('deliveries')
        .select('id, reference, status, created_at, delivered_at, pharmacy_id, recipient_name, nb_cartons, nb_sachets, nb_barques, parcours_id')
        .eq('driver_id', selectedDriver)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('delivered_at', { ascending: true, nullsFirst: false });

      if (!data?.length) {
        setLoading(false);
        return;
      }

      // Group by parcours_id
      const grouped = new Map<string, typeof data>();
      for (const d of data) {
        const key = d.parcours_id || 'no-parcours';
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(d);
      }

      const parcoursIds = [...grouped.keys()].filter(k => k !== 'no-parcours');
      const pharmacyIds = [...new Set(data.map(d => d.pharmacy_id))];

      // Fetch parcours info, pharmacies, and axis_pharmacies in parallel
      const [parcoursRes, pharmaciesRes, axisPharmaciesRes] = await Promise.all([
        parcoursIds.length > 0
          ? supabase.from('parcours').select('id, name, axis_id').in('id', parcoursIds)
          : Promise.resolve({ data: [] as { id: string; name: string; axis_id: string }[] }),
        supabase.from('pharmacies').select('id, name, address').in('id', pharmacyIds),
        supabase.from('axis_pharmacies').select('pharmacy_id, position, axis_id'),
      ]);

      const parcoursMap = new Map((parcoursRes.data || []).map(p => [p.id, p]));
      const pharmacyMap = new Map((pharmaciesRes.data || []).map(p => [p.id, p]));

      // Build axis position maps per axis
      const axisPositionMap = new Map<string, Map<string, number>>();
      for (const ap of axisPharmaciesRes.data || []) {
        if (!axisPositionMap.has(ap.axis_id)) axisPositionMap.set(ap.axis_id, new Map());
        axisPositionMap.get(ap.axis_id)!.set(ap.pharmacy_id, ap.position);
      }

      // Fetch axis names
      const axisIds = [...new Set((parcoursRes.data || []).map(p => p.axis_id))];
      let axisNameMap = new Map<string, string>();
      if (axisIds.length > 0) {
        const { data: axesData } = await supabase.from('axes').select('id, name').in('id', axisIds);
        axisNameMap = new Map((axesData || []).map(a => [a.id, a.name]));
      }

      // Build groups
      const groups: ParcoursGroup[] = [];

      for (const [key, items] of grouped) {
        const parcoursInfo = key !== 'no-parcours' ? parcoursMap.get(key) : null;
        const axisId = parcoursInfo?.axis_id;
        const positions = axisId ? axisPositionMap.get(axisId) : null;
        const axisName = axisId ? axisNameMap.get(axisId) || '' : '';

        const records: DeliveryRecord[] = items.map(d => ({
          id: d.id,
          reference: d.reference,
          status: d.status,
          created_at: d.created_at,
          delivered_at: d.delivered_at,
          pharmacy_id: d.pharmacy_id,
          pharmacy_name: pharmacyMap.get(d.pharmacy_id)?.name || 'Inconnu',
          pharmacy_address: pharmacyMap.get(d.pharmacy_id)?.address || null,
          recipient_name: d.recipient_name,
          nb_cartons: d.nb_cartons,
          nb_sachets: d.nb_sachets,
          nb_barques: d.nb_barques,
          expected_position: positions?.get(d.pharmacy_id) ?? null,
          parcours_id: d.parcours_id,
        }));

        const compliance = axisName
          ? computeCompliance(records, axisName)
          : null;

        groups.push({
          parcours_id: key,
          parcours_name: parcoursInfo?.name || 'Sans parcours',
          axis_name: axisName,
          deliveries: records,
          compliance,
        });
      }

      setParcoursGroups(groups);
    } catch (error) {
      console.error('Error fetching driver deliveries:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalDeliveries = parcoursGroups.reduce((sum, g) => sum + g.deliveries.length, 0);
  const totalCompleted = parcoursGroups.reduce((sum, g) => sum + g.deliveries.filter(d => d.status === 'livre').length, 0);
  const totalPending = totalDeliveries - totalCompleted;
  const driverName = drivers.find(d => d.user_id === selectedDriver)?.full_name || '';

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Suivi des chauffeurs</h1>
          <p className="text-muted-foreground mt-1">
            Retracez le parcours et l'historique des livraisons de chaque chauffeur
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          {isSuperAdmin && (
            <div className="w-full sm:w-56">
              <SiteFilterSelect value={siteFilter} onChange={setSiteFilter} sites={sites} />
            </div>
          )}
          <div className="w-full sm:w-72">
            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un chauffeur" />
              </SelectTrigger>
              <SelectContent>
                {drivers
                  .filter(driver => siteFilter === 'all' || driver.site_id === siteFilter)
                  .map(driver => (
                  <SelectItem key={driver.user_id} value={driver.user_id}>
                    {driver.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {!selectedDriver && (
          <Card className="border-0 shadow-md">
            <CardContent className="py-12 text-center text-muted-foreground">
              <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Sélectionnez un chauffeur pour voir son parcours</p>
            </CardContent>
          </Card>
        )}

        {selectedDriver && loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {selectedDriver && !loading && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-0 shadow-md">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalDeliveries}</p>
                    <p className="text-xs text-muted-foreground">Total livraisons</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-md">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                    <Package className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalCompleted}</p>
                    <p className="text-xs text-muted-foreground">Livrées</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-md">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalPending}</p>
                    <p className="text-xs text-muted-foreground">En attente</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {totalDeliveries === 0 ? (
              <Card className="border-0 shadow-md">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Aucune livraison pour {driverName} le {format(new Date(selectedDate), 'dd MMMM yyyy', { locale: fr })}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-8">
                {parcoursGroups.map((group) => (
                  <div key={group.parcours_id} className="space-y-4">
                    {/* Parcours header */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <Route className="w-5 h-5 text-primary" />
                        {group.parcours_name}
                      </h2>
                      {group.axis_name && (
                        <Badge variant="outline" className="gap-1">
                          Axe : {group.axis_name}
                        </Badge>
                      )}
                      <Badge variant="secondary">
                        {group.deliveries.length} livraison(s)
                      </Badge>
                    </div>

                    {/* Compliance banner per parcours */}
                    {group.compliance && (
                      <div className={`rounded-xl p-4 text-center font-bold text-lg tracking-wide ${
                        group.compliance.respected
                          ? 'bg-success/15 text-success border-2 border-success/30'
                          : 'bg-destructive/15 text-destructive border-2 border-destructive/30'
                      }`}>
                        {group.compliance.respected ? '✅ PARCOURS RESPECTÉ' : '❌ PARCOURS NON RESPECTÉ'}
                      </div>
                    )}

                    {/* Compliance details */}
                    {group.compliance && (
                      <Card className={`border-0 shadow-md ${group.compliance.respected ? 'bg-success/5' : 'bg-destructive/5'}`}>
                        <CardContent className="p-4 flex items-start gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            group.compliance.respected ? 'bg-success/10' : 'bg-destructive/10'
                          }`}>
                            {group.compliance.respected ? (
                              <CheckCircle2 className="w-5 h-5 text-success" />
                            ) : (
                              <AlertTriangle className="w-5 h-5 text-destructive" />
                            )}
                          </div>
                          <div className="space-y-1">
                            <h3 className="font-semibold text-foreground">
                              {group.compliance.respected ? 'Ordre respecté' : 'Ordre non respecté'}
                            </h3>
                            <p className="text-sm text-muted-foreground">{group.compliance.details}</p>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Timeline */}
                    <Card className="border-0 shadow-md">
                      <CardHeader>
                        <CardTitle className="text-base">
                          Livraisons — {group.parcours_name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="relative">
                          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                          <div className="space-y-6">
                            {group.deliveries.map((delivery, index) => {
                              const isOutOfOrder = group.compliance && !group.compliance.respected && delivery.expected_position !== null && delivery.status === 'livre' && delivery.delivered_at && (() => {
                                const delivered = group.deliveries
                                  .filter(r => r.status === 'livre' && r.delivered_at && r.expected_position !== null)
                                  .sort((a, b) => new Date(a.delivered_at!).getTime() - new Date(b.delivered_at!).getTime());
                                const idx = delivered.findIndex(d => d.id === delivery.id);
                                if (idx <= 0) return false;
                                return delivery.expected_position! < delivered[idx - 1].expected_position!;
                              })();

                              return (
                                <div key={delivery.id} className="relative pl-12">
                                  <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 ${
                                    delivery.status === 'livre'
                                      ? 'bg-success border-success'
                                      : 'bg-warning border-warning'
                                  }`} style={{ top: '6px' }} />

                                  <div className="absolute left-0 -top-1 w-9 text-center">
                                    <span className="text-[10px] font-bold text-muted-foreground">
                                      #{index + 1}
                                    </span>
                                  </div>

                                  <div className={`rounded-lg p-4 space-y-2 ${isOutOfOrder ? 'bg-destructive/10 ring-1 ring-destructive/20' : 'bg-muted/40'}`}>
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                      <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-foreground">{delivery.reference}</h3>
                                        {delivery.expected_position !== null && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                                            Axe pos. {delivery.expected_position + 1}
                                          </span>
                                        )}
                                        {isOutOfOrder && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-semibold flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />
                                            Hors ordre
                                          </span>
                                        )}
                                      </div>
                                      <Badge variant={delivery.status === 'livre' ? 'default' : 'secondary'}>
                                        {delivery.status === 'livre' ? 'Livré' : 'En attente'}
                                      </Badge>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                      <div className="flex items-center gap-2 text-muted-foreground">
                                        <MapPin className="w-4 h-4 shrink-0" />
                                        <span>{delivery.pharmacy_name}{delivery.pharmacy_address ? ` — ${delivery.pharmacy_address}` : ''}</span>
                                      </div>

                                      <div className="flex items-center gap-2 text-muted-foreground">
                                        <Clock className="w-4 h-4 shrink-0" />
                                        <span>
                                          Créé à {format(new Date(delivery.created_at), 'HH:mm', { locale: fr })}
                                          {delivery.delivered_at && (
                                            <> · Livré à <span className="font-medium text-success">{format(new Date(delivery.delivered_at), 'HH:mm', { locale: fr })}</span></>
                                          )}
                                        </span>
                                      </div>

                                      {delivery.recipient_name && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                          <User className="w-4 h-4 shrink-0" />
                                          <span>Reçu par : {delivery.recipient_name}</span>
                                        </div>
                                      )}

                                      <div className="flex items-center gap-2 text-muted-foreground">
                                        <Package className="w-4 h-4 shrink-0" />
                                        <span>
                                          {[
                                            delivery.nb_cartons > 0 && `${delivery.nb_cartons} carton(s)`,
                                            delivery.nb_sachets > 0 && `${delivery.nb_sachets} sachet(s)`,
                                            delivery.nb_barques > 0 && `${delivery.nb_barques} bac(s)`,
                                          ].filter(Boolean).join(', ') || 'Aucun colis'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
