// Native (APK) push wiring.
//
// 1. The Android app hands us its Firebase registration token via the
//    `appFcmToken` event (or window.__arFcmToken / AndroidNotification.getFcmToken).
//    We store it in public.device_tokens so the send-call-push edge function can
//    reach this phone even when the app is closed.
// 2. Taps on a phone notification arrive as `appNotificationAction` with
//    { action: 'open' | 'answer' | 'join' | 'decline', url, kind, peerId, groupId }.
//    'open' navigates to the right screen; answer/join/decline are re-dispatched
//    as `appCallActionFromNotification` for the call contexts to act on.
import { useEffect } from 'react';
import { supabase } from '@/db/supabase';

type NotificationActionDetail = {
  action?: string;
  url?: string;
  kind?: string;
  peerId?: string;
  groupId?: string;
  callId?: string;
};

type AndroidBridge = { getFcmToken?: () => string };

function readBridgeToken(): string | undefined {
  const w = window as unknown as { __arFcmToken?: string; AndroidNotification?: AndroidBridge };
  if (w.__arFcmToken) return w.__arFcmToken;
  try {
    const token = w.AndroidNotification?.getFcmToken?.();
    return token || undefined;
  } catch {
    return undefined;
  }
}

async function saveToken(userId: string, token: string) {
  try {
    const { error } = await supabase.from('device_tokens').upsert({
      user_id: userId,
      token,
      platform: 'android',
      device_info: navigator.userAgent,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'token' });
    if (error) console.warn('device token save failed', error.message);
  } catch (e) {
    console.warn('device token save failed', e);
  }
}

export function useNativePush(userId: string | undefined) {
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    const existing = readBridgeToken();
    if (existing) void saveToken(userId, existing);

    const onToken = (event: Event) => {
      const token = (event as CustomEvent<{ token?: string }>).detail?.token;
      if (token) void saveToken(userId, token);
    };
    window.addEventListener('appFcmToken', onToken);
    return () => window.removeEventListener('appFcmToken', onToken);
  }, [userId]);

  // Notification taps / call buttons
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handled = new Set<string>();
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<NotificationActionDetail>).detail || {};
      const key = String((detail as { ts?: number }).ts ?? '');
      if (key) { if (handled.has(key)) return; handled.add(key); }
      const action = detail.action || 'open';

      if (action === 'answer' || action === 'join' || action === 'decline') {
        window.dispatchEvent(new CustomEvent('appCallActionFromNotification', { detail }));
        if (action !== 'decline' && detail.url && detail.url !== '/') {
          window.history.pushState({}, '', detail.url);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        return;
      }

      if (detail.url && detail.url.startsWith('/') && detail.url !== window.location.pathname) {
        window.history.pushState({}, '', detail.url);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    };

    window.addEventListener('appNotificationAction', onAction);
    // App was closed: the Answer/Join tap arrived before the page loaded.
    // Pick it up from the phone once the call screens are listening.
    const pickup = window.setTimeout(() => {
      try {
        const bridge = (window as unknown as { AndroidNotification?: { getPendingNotificationAction?: () => string } }).AndroidNotification;
        const raw = bridge?.getPendingNotificationAction?.();
        if (raw) onAction(new CustomEvent('appNotificationAction', { detail: JSON.parse(raw) }));
      } catch { /* ignore */ }
    }, 800);
    return () => { window.clearTimeout(pickup); window.removeEventListener('appNotificationAction', onAction); };
  }, []);
}
