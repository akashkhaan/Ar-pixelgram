import { supabase } from '@/db/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { Profile } from '@/types/types';

export interface SavedAccount {
  user_id: string;
  username: string;
  full_name: string;
  avatar_url?: string | null;
  email?: string;
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  last_active: number;
  notifications_count?: number;
  saved_credential?: string;
  is_verified?: boolean; // Base64 encoded password for seamless 1-tap switching
}

const STORAGE_KEY = 'pixelgram_saved_accounts_v1';
const SUPABASE_URL = 'https://jfizzduvmzavtqwzqacy.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmaXp6ZHV2bXphdnRxd3pxYWN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NjQ2MTIsImV4cCI6MjEwMTU0MDYxMn0.9i77iYIYBEBDWzm528gVDpV3qgiiwkvE5MVTTKIG19s';
const SUPABASE_STORAGE_KEY = 'sb-jfizzduvmzavtqwzqacy-auth-token';

export function getSavedAccounts(): SavedAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('Failed to parse saved accounts:', e);
    return [];
  }
}

export function saveCurrentAccount(
  user: User | null,
  profile: Profile | null,
  session: Session | null,
  plainPassword?: string
) {
  if (!user || !session?.access_token) return;

  try {
    const accounts = getSavedAccounts();
    const existingIndex = accounts.findIndex((a) => a.user_id === user.id);
    const existing = existingIndex >= 0 ? accounts[existingIndex] : null;

    let credential = existing?.saved_credential;
    if (plainPassword) {
      try {
        credential = btoa(unescape(encodeURIComponent(plainPassword)));
      } catch {}
    }

    const updatedAccount: SavedAccount = {
      user_id: user.id,
      username:
        profile?.username ||
        user.user_metadata?.username ||
        user.email?.split('@')[0] ||
        'User',
      full_name:
        profile?.full_name ||
        user.user_metadata?.full_name ||
        profile?.username ||
        'Pixelgram User',
      avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || null,
      email: user.email,
      access_token: session.access_token,
      refresh_token: session.refresh_token || existing?.refresh_token || '',
      expires_at: session.expires_at,
      last_active: Date.now(),
      notifications_count: existing?.notifications_count,
      saved_credential: credential,
      is_verified: profile?.is_verified ?? existing?.is_verified ?? false,
    };

    if (existingIndex >= 0) {
      accounts[existingIndex] = {
        ...existing,
        ...updatedAccount,
      };
    } else {
      accounts.push(updatedAccount);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    // Also save individual session backup
    localStorage.setItem(`pixelgram_sess_${user.id}`, JSON.stringify(session));
  } catch (e) {
    console.error('Failed to save current account:', e);
  }
}

/**
 * 1-Tap Instant Account Switcher
 * Switches directly between accounts without server-side revocation or redirect loops.
 */
export async function switchToAccount(
  account: SavedAccount,
  providedPassword?: string
): Promise<{ success: boolean; requiresPassword?: boolean; message?: string }> {
  try {
    // 1. Snapshot current active session before switching
    const currentRaw = localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (currentRaw) {
      try {
        const curSess = JSON.parse(currentRaw);
        if (curSess?.user?.id) {
          localStorage.setItem(`pixelgram_sess_${curSess.user.id}`, currentRaw);
        }
      } catch {}
    }

    let targetSession: any = null;

    // 2. Check if we have an unexpired access token
    const nowSec = Math.floor(Date.now() / 1000);
    if (account.access_token && account.expires_at && account.expires_at > nowSec + 60) {
      // Access token is still fresh!
      targetSession = {
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        expires_at: account.expires_at,
        expires_in: account.expires_at - nowSec,
        token_type: 'bearer',
        user: {
          id: account.user_id,
          email: account.email,
          user_metadata: {
            username: account.username,
            full_name: account.full_name,
            avatar_url: account.avatar_url,
          },
        },
      };
    }

    // 3. If access token is expired, try direct REST refresh with refresh_token
    if (!targetSession && account.refresh_token) {
      try {
        const refRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: account.refresh_token }),
        });

        if (refRes.ok) {
          const fresh = await refRes.json();
          if (fresh?.access_token) {
            targetSession = fresh;
            // Update saved account with fresh tokens
            const accounts = getSavedAccounts();
            const idx = accounts.findIndex((a) => a.user_id === account.user_id);
            if (idx >= 0) {
              accounts[idx].access_token = fresh.access_token;
              accounts[idx].refresh_token = fresh.refresh_token;
              accounts[idx].expires_at = fresh.expires_at;
              accounts[idx].last_active = Date.now();
              localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
            }
          }
        }
      } catch (err) {
        console.warn('Direct refresh token fetch failed:', err);
      }
    }

    // 4. If refresh token expired or failed, try saved credential or provided password!
    if (!targetSession) {
      let pass = providedPassword;
      if (!pass && account.saved_credential) {
        try {
          pass = decodeURIComponent(escape(atob(account.saved_credential)));
        } catch {}
      }

      if (pass) {
        try {
          const loginIdentifier = account.username || account.email || '';
          const { data: fnData, error: fnError } = await supabase.functions.invoke(
            'login-with-identifier',
            {
              body: { identifier: loginIdentifier, password: pass },
            }
          );

          if (!fnError && fnData?.access_token) {
            targetSession = fnData;
            // Update saved account tokens and credential
            saveCurrentAccount(
              { id: account.user_id, email: account.email } as User,
              { username: account.username, full_name: account.full_name, avatar_url: account.avatar_url } as any,
              fnData,
              pass
            );
          }
        } catch (err) {
          console.warn('Re-auth via credential failed:', err);
        }
      }
    }

    // 5. If we obtained a valid session for the target account: ACTIVATE IT!
    if (targetSession?.access_token) {
      localStorage.setItem(SUPABASE_STORAGE_KEY, JSON.stringify(targetSession));
      localStorage.setItem(`pixelgram_sess_${account.user_id}`, JSON.stringify(targetSession));

      // Reload page into clean state with the new active user
      window.location.reload();
      return { success: true };
    }

    // 6. Target account needs password entry (without logging out current user!)
    return {
      success: false,
      requiresPassword: true,
      message: `Please enter password for ${account.full_name || account.username}`,
    };
  } catch (err) {
    console.error('switchToAccount exception:', err);
    return { success: false, message: 'Switch failed' };
  }
}

export function removeSavedAccount(userId: string) {
  try {
    const accounts = getSavedAccounts().filter((a) => a.user_id !== userId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    localStorage.removeItem(`pixelgram_sess_${userId}`);
  } catch (e) {
    console.error('Failed to remove saved account:', e);
  }
}

/**
 * Log in to another account WITHOUT destroying or revoking active sessions!
 */
export async function logInToAnotherAccount() {
  try {
    // 1. Snapshot current active session before opening login
    const currentRaw = localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (currentRaw) {
      try {
        const curSess = JSON.parse(currentRaw);
        if (curSess?.user?.id) {
          localStorage.setItem(`pixelgram_sess_${curSess.user.id}`, currentRaw);
        }
      } catch {}
    }

    // 2. Remove ONLY active storage key so /login displays fresh login form.
    // Do NOT call supabase.auth.signOut(), keeping refresh tokens 100% active on the server!
    localStorage.removeItem(SUPABASE_STORAGE_KEY);
  } catch (err) {
    console.warn('Error during add account transition:', err);
  } finally {
    window.location.href = '/login';
  }
}
