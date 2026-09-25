/**
 * Browser Push Notification helper for web uploads (Reel, Story, Post, Video).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  try {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
  } catch (e) {
    console.warn('Notification permission error:', e);
  }
  return false;
}

export async function sendBrowserPushNotification(
  title: string,
  body: string,
  icon = '/favicon.ico'
) {
  if (!('Notification' in window)) return;
  try {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon,
        badge: icon,
      });
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification(title, {
          body,
          icon,
          badge: icon,
        });
      }
    }
  } catch (err) {
    console.warn('Browser push notification error:', err);
  }
}
