import { Capacitor } from '@capacitor/core';

interface NotifyPhoneOptions {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  isCall?: boolean;
  isOngoing?: boolean;
  progress?: number;
}

export function notifyPhone(options: NotifyPhoneOptions) {
  const { title, body, tag = 'default', url, isCall, isOngoing, progress } = options;

  // 1. Direct Native Android Java Interface (Always active in our APK build)
  const android = (window as unknown as { AndroidNotification?: {
    isNativeApp?: () => boolean;
    showNotification?: (t: string, b: string, tag: string, u: string) => void;
    showCallNotification?: (t: string, b: string, tag: string, ongoing: boolean) => void;
    showUploadNotification?: (p: number, t: string, b: string) => void;
    dismissNotification?: (tag: string) => void;
  } }).AndroidNotification;

  if (android) {
    try {
      if (progress !== undefined) {
        android.showUploadNotification?.(progress, title, body);
        return;
      }
      if (isCall) {
        android.showCallNotification?.(title, body, tag, !!isOngoing);
        return;
      }
      android.showNotification?.(title, body, tag, url || '/');
      return;
    } catch (e) {
      console.warn('Native AndroidNotification failed', e);
    }
  }

  // 2. Capacitor LocalNotifications plugin
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
      LocalNotifications.schedule({
        notifications: [{
          id: Math.abs(tag.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)) % 100000 + 1,
          title,
          body,
          extra: { url },
        }]
      }).catch(() => {});
    }).catch(() => {});
    return;
  }

  // 3. Web Notification API (Browser / PWA / Android Chrome)
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      const showViaServiceWorker = () => {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready
            .then(reg => {
              reg.showNotification(title, {
                body,
                tag,
                icon: '/images/logo/logo-icon.svg',
                badge: '/images/logo/logo-icon.svg',
                data: { url: url || '/' },
                vibrate: isCall ? [500, 250, 500, 250, 500] : [200, 100, 200],
              } as NotificationOptions);
            })
            .catch(() => {
              try {
                new Notification(title, { body, tag, icon: '/images/logo/logo-icon.svg' });
              } catch { /* noop */ }
            });
          return true;
        }
        return false;
      };

      if (!showViaServiceWorker()) {
        try {
          new Notification(title, { body, tag, icon: '/images/logo/logo-icon.svg' });
        } catch { /* noop */ }
      }
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }
}

export function dismissPhoneNotification(tag: string) {
  const android = (window as unknown as { AndroidNotification?: { dismissNotification?: (t: string) => void } }).AndroidNotification;
  if (android?.dismissNotification) {
    try {
      android.dismissNotification(tag);
    } catch { /* noop */ }
  }

  // Also close web notification if service worker has it
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      reg.getNotifications({ tag }).then(notifications => {
        notifications.forEach(n => n.close());
      }).catch(() => {});
    }).catch(() => {});
  }
}
