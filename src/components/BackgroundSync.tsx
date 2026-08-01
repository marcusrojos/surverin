import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { SyncQueue } from '@/services/syncQueue';

/**
 * App-wide automatic synchronization of offline delivery validations.
 * Runs regardless of the current route so pending data is pushed as soon as
 * connectivity is back — even if the driver is not on the deliveries screen.
 */
export function BackgroundSync() {
  const runningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled || runningRef.current || !navigator.onLine) return;
      const count = await SyncQueue.getPendingCount();
      if (count === 0) return;
      runningRef.current = true;
      try {
        const { synced } = await SyncQueue.syncAll();
        if (synced > 0) {
          toast.success(`${synced} livraison${synced > 1 ? 's' : ''} synchronisée${synced > 1 ? 's' : ''}`);
        }
      } catch (err) {
        console.error('[BackgroundSync] error:', err);
      } finally {
        runningRef.current = false;
      }
    };

    const onVisibility = () => { if (document.visibilityState === 'visible') run(); };

    run();
    window.addEventListener('online', run);
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(run, 45_000);

    return () => {
      cancelled = true;
      window.removeEventListener('online', run);
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, []);

  return null;
}
