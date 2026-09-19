import { Capacitor } from '@capacitor/core';

export interface NotifyPhoneAction {
  action: string;
  title: string;
  icon?: string;
}

export interface NotifyPhoneOptions {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  icon?: string | null;
  image?: string | null;
  badge?: string | null;
  isCall?: boolean;
  isOngoing?: boolean;
  progress?: number;
  actions?: NotifyPhoneAction[];
}

export function notifyPhone(options: NotifyPhoneOptions) {
  const {
    title,
    body,
    tag = 'default',
    url,
    icon,
    image,
    badge,
    isCall,
    isOngoing,
    progress,
    actions,
  } = options;

  const resolvedIcon = icon || '/images/logo/logo-icon.svg';
  const resolvedBadge = badge || '/images/logo/logo-icon.svg';

  // 1. Direct Native Android Java Interface (Always active in our APK build)
  const android = (window as unknown as { AndroidNotification?: {
    isNativeApp?: () => boolean;
    showNotification?: (t: string, b: string, tag: string, u: string, icon?: string) => void;
    showCallNotification?: (t: string, b: string, tag: string, ongoing: boolean, icon?: string) => void;
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
        android.showCallNotification?.(title, body, tag, !!isOngoing, resolvedIcon);
        return;
      }
      android.showNotification?.(title, body, tag, url || '/', resolvedIcon);
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
          smallIcon: 'ic_stat_name',
          largeIcon: resolvedIcon,
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
              const notifOpts: any = {
                body,
                tag,
                icon: resolvedIcon,
                badge: resolvedBadge,
                data: {
                  url: url || '/',
                  joinUrl: actions?.find(a => a.action === 'join_call' || a.action === 'receive_call') ? url : undefined,
                },
                vibrate: isCall ? [500, 250, 500, 250, 500, 250, 500] : [200, 100, 200],
              };
              if (image) {
                notifOpts.image = image;
              }
              if (actions && actions.length > 0) {
                notifOpts.actions = actions;
              }
              reg.showNotification(title, notifOpts);
            })
            .catch(() => {
              try {
                new Notification(title, {
                  body,
                  tag,
                  icon: resolvedIcon,
                });
              } catch { /* noop */ }
            });
          return true;
        }
        return false;
      };

      if (!showViaServiceWorker()) {
        try {
          new Notification(title, { body, tag, icon: resolvedIcon });
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
