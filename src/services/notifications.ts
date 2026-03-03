/**
 * Notification service using the browser Notification API.
 * Shows native notifications only when the app is not focused.
 * Avoids spamming: debounces and groups related events.
 */

const ICON_URL = '/pwa-icon-192.png';

type NotifType = 'offline' | 'online' | 'new_delivery' | 'sync_success' | 'sync_error';

// Debounce map to avoid duplicate notifs
const lastShown = new Map<NotifType, number>();
const MIN_INTERVAL_MS = 10_000; // 10 seconds minimum between same type

function shouldShow(type: NotifType): boolean {
  // Don't notify if the page is focused (user already sees toasts)
  if (document.hasFocus()) return false;

  const last = lastShown.get(type) || 0;
  if (Date.now() - last < MIN_INTERVAL_MS) return false;

  return true;
}

async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

async function show(title: string, body: string, type: NotifType) {
  if (!shouldShow(type)) return;
  const ok = await requestPermission();
  if (!ok) return;

  lastShown.set(type, Date.now());

  try {
    new Notification(title, {
      body,
      icon: ICON_URL,
      tag: type, // replaces previous notif of same tag
      silent: type === 'online', // online reconnect is silent
    });
  } catch {
    // Notification constructor may fail on some mobile browsers
  }
}

export const AppNotifications = {
  /** Ask permission proactively (call once on app start) */
  requestPermission,

  offline() {
    show('Mode hors-ligne', 'Les données sont sauvegardées localement.', 'offline');
  },

  online() {
    show('Connexion rétablie', 'Synchronisation en cours…', 'online');
  },

  newDeliveries(count: number) {
    if (count <= 0) return;
    show(
      'Nouvelles livraisons',
      `${count} nouvelle${count > 1 ? 's' : ''} livraison${count > 1 ? 's' : ''} attribuée${count > 1 ? 's' : ''}.`,
      'new_delivery',
    );
  },

  syncSuccess(count: number) {
    if (count <= 0) return;
    show(
      'Synchronisation terminée',
      `${count} livraison${count > 1 ? 's' : ''} synchronisée${count > 1 ? 's' : ''}.`,
      'sync_success',
    );
  },

  syncError(count: number) {
    if (count <= 0) return;
    show(
      'Erreur de synchronisation',
      `${count} livraison${count > 1 ? 's' : ''} en échec. Nouvelle tentative au prochain retour réseau.`,
      'sync_error',
    );
  },
};
