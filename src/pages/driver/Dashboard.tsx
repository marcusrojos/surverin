import { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InventoryFlow } from '@/components/driver/InventoryFlow';
import { toast } from 'sonner';
import { Package, Loader2, Route, ClipboardCheck, RefreshCw, WifiOff, ArrowDownFromLine, MapPin, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Parcours {
  id: string;
  name: string;
  status: string;
  created_at: string;
  axis: { name: string } | null;
  colis_count: number;
  pharmacies_count: number;
  force_confirmed: boolean;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  en_attente_inventaire: {
    label: "En attente d'inventaire",
    className: 'bg-warning/15 text-warning border border-warning/30',
  },
  en_cours: {
    label: 'En cours',
    className: 'bg-primary/15 text-primary border border-primary/30',
  },
  termine: {
    label: 'Terminé',
    className: 'bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30',
  },
};

export default function DriverDashboard() {
  const { user } = useAuth();
  const [parcoursList, setParcoursList] = useState<Parcours[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Pull-to-refresh
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const PULL_THRESHOLD = 80;
  const [inventoryParcours, setInventoryParcours] = useState<Parcours | null>(null);

  useEffect(() => {
    const onLine = () => setIsOnline(true);
    const offLine = () => setIsOnline(false);
    window.addEventListener('online', onLine);
    window.addEventListener('offline', offLine);
    return () => { window.removeEventListener('online', onLine); window.removeEventListener('offline', offLine); };
  }, []);

  const fetchParcours = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Fetch parcours assigned to this driver
      const { data: parcoursData, error } = await supabase
        .from('parcours')
        .select('id, name, status, created_at, axis_id')
        .eq('driver_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!parcoursData || parcoursData.length === 0) {
        setParcoursList([]);
        return;
      }

      // Fetch axes for names
      const axisIds = [...new Set(parcoursData.map(p => p.axis_id))];
      const { data: axesData } = await supabase
        .from('axes')
        .select('id, name')
        .in('id', axisIds);

      const axisMap = new Map((axesData || []).map(a => [a.id, a]));

      // Fetch pharmacy counts
      const parcoursIds = parcoursData.map(p => p.id);
      const { data: pharmaciesData } = await supabase
        .from('parcours_pharmacies')
        .select('parcours_id')
        .in('parcours_id', parcoursIds);

      const pharmCounts = new Map<string, number>();
      (pharmaciesData || []).forEach(pp => {
        pharmCounts.set(pp.parcours_id, (pharmCounts.get(pp.parcours_id) || 0) + 1);
      });

      // Fetch colis counts
      const { data: colisData } = await supabase
        .from('parcours_colis')
        .select('parcours_id')
        .in('parcours_id', parcoursIds);

      const colisCounts = new Map<string, number>();
      (colisData || []).forEach(c => {
        colisCounts.set(c.parcours_id, (colisCounts.get(c.parcours_id) || 0) + 1);
      });

      const mapped: Parcours[] = parcoursData.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        created_at: p.created_at,
        axis: axisMap.get(p.axis_id) ? { name: axisMap.get(p.axis_id)!.name } : null,
        colis_count: colisCounts.get(p.id) || 0,
        pharmacies_count: pharmCounts.get(p.id) || 0,
      }));

      setParcoursList(mapped);
    } catch (err) {
      toast.error('Erreur lors du chargement des parcours');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchParcours();
  }, [fetchParcours]);

  // Pull-to-refresh handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollContainerRef.current && scrollContainerRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) setPullDistance(Math.min(delta * 0.5, 120));
  }, [isPulling]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(0);
      await fetchParcours();
      setIsRefreshing(false);
      toast.success('Données actualisées');
    } else {
      setPullDistance(0);
    }
    setIsPulling(false);
  }, [pullDistance, isRefreshing, fetchParcours]);

  const pendingInventory = parcoursList.filter(p => p.status === 'en_attente_inventaire');
  const others = parcoursList.filter(p => p.status !== 'en_attente_inventaire');

  return (
    <DashboardLayout requiredRole="livreur">
      <div
        ref={scrollContainerRef}
        className="space-y-4"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        {(pullDistance > 0 || isRefreshing) && (
          <div
            className="flex items-center justify-center transition-all duration-200"
            style={{ height: isRefreshing ? 48 : pullDistance }}
          >
            <div className={`flex items-center gap-2 text-sm text-muted-foreground ${pullDistance >= PULL_THRESHOLD ? 'text-primary' : ''}`}>
              {isRefreshing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Actualisation…</>
              ) : pullDistance >= PULL_THRESHOLD ? (
                <><ArrowDownFromLine className="w-4 h-4" /> Relâchez pour actualiser</>
              ) : (
                <><ArrowDownFromLine className="w-4 h-4" /> Tirez pour actualiser</>
              )}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold">Mes parcours</h1>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={async () => {
                setIsRefreshing(true);
                await fetchParcours();
                setIsRefreshing(false);
                toast.success('Données actualisées');
              }}
              disabled={isRefreshing || !isOnline}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            {!isOnline && (
              <div className="flex items-center gap-2 text-warning text-sm">
                <WifiOff className="w-4 h-4" />
                Hors-ligne
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <ClipboardCheck className="w-6 h-6 mx-auto mb-1 text-warning" />
              <p className="text-2xl font-bold">{pendingInventory.length}</p>
              <p className="text-xs text-muted-foreground">À inventorier</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <Route className="w-6 h-6 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">{parcoursList.length}</p>
              <p className="text-xs text-muted-foreground">Total parcours</p>
            </CardContent>
          </Card>
        </div>

        {/* Parcours list */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : parcoursList.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Route className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Aucun parcours assigné</p>
            <p className="text-xs mt-1">Vos parcours apparaîtront ici une fois créés par l'administrateur</p>
          </div>
        ) : (
          <div className="space-y-3">
            {parcoursList.map((parcours) => {
              const statusInfo = statusLabels[parcours.status] || statusLabels.en_attente_inventaire;
              const isPending = parcours.status === 'en_attente_inventaire';

              return (
                <Card
                  key={parcours.id}
                  className={cn(
                    'transition-all duration-200',
                    isPending ? 'card-hover border-warning/30' : 'opacity-80'
                  )}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        isPending ? 'bg-warning/15' : 'bg-muted'
                      )}>
                        <Route className={cn('w-5 h-5', isPending ? 'text-warning' : 'text-muted-foreground')} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">{parcours.name}</p>
                            {parcours.axis && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 shrink-0" />
                                {parcours.axis.name}
                              </p>
                            )}
                          </div>
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0', statusInfo.className)}>
                            {statusInfo.label}
                          </span>
                        </div>

                        {/* Meta */}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {parcours.colis_count} colis
                          </span>
                          <span>·</span>
                          <span>{parcours.pharmacies_count} pharmacie{parcours.pharmacies_count > 1 ? 's' : ''}</span>
                          <span>·</span>
                          <span>{format(new Date(parcours.created_at), 'dd MMM', { locale: fr })}</span>
                        </div>

                        {/* Action button */}
                        {isPending && (
                          <Button
                            size="sm"
                            className="mt-3 w-full sm:w-auto"
                            onClick={() => setInventoryParcours(parcours)}
                          >
                            <ClipboardCheck className="w-4 h-4 mr-1.5" />
                            Faire l'inventaire
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {inventoryParcours && user?.id && (
        <InventoryFlow
          open={!!inventoryParcours}
          onOpenChange={(open) => { if (!open) setInventoryParcours(null); }}
          parcoursId={inventoryParcours.id}
          parcoursName={inventoryParcours.name}
          driverId={user.id}
          onCompleted={() => {
            setInventoryParcours(null);
            fetchParcours();
          }}
        />
      )}
    </DashboardLayout>
  );
}
