import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { Database } from '@/integrations/supabase/types';

type DeliveryRow = Database['public']['Tables']['deliveries']['Row'];

interface UseRealtimeDeliveriesOptions {
  userId: string | undefined;
  onNewDelivery?: (delivery: DeliveryRow) => void;
  onDeliveryUpdate?: (delivery: DeliveryRow) => void;
  onDeliveryDelete?: (oldDelivery: DeliveryRow) => void;
}

export function useRealtimeDeliveries({ userId, onNewDelivery, onDeliveryUpdate, onDeliveryDelete }: UseRealtimeDeliveriesOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel(`deliveries-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deliveries', filter: `driver_id=eq.${userId}` },
        (payload: RealtimePostgresChangesPayload<DeliveryRow>) => {
          const newDelivery = payload.new as DeliveryRow;
          toast.success('🚚 Nouvelle livraison assignée !', { description: `Référence: ${newDelivery.reference}`, duration: 5000 });
          onNewDelivery?.(newDelivery);
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'deliveries', filter: `driver_id=eq.${userId}` },
        (payload: RealtimePostgresChangesPayload<DeliveryRow>) => {
          onDeliveryUpdate?.(payload.new as DeliveryRow);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'deliveries' },
        (payload: RealtimePostgresChangesPayload<DeliveryRow>) => {
          const oldDelivery = payload.old as DeliveryRow;
          if (oldDelivery.driver_id === userId) {
            toast.info('Une livraison a été retirée de votre liste');
            onDeliveryDelete?.(oldDelivery);
          }
        })
      .subscribe();

    channelRef.current = channel;
    return () => { if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; } };
  }, [userId, onNewDelivery, onDeliveryUpdate, onDeliveryDelete]);
}
