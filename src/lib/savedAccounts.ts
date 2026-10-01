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
  last_active: number;
  notifications_count?: number;
}

const STORAGE_KEY = 'pixelgram_saved_accounts_v1';

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
  session: Session | null
) {
  if (!user || !session) return;

  try {
    const accounts = getSavedAccounts();
    const existingIndex = accounts.findIndex((a) => a.user_id === user.id);

    const updatedAccount: SavedAccount = {
      user_id: user.id,
      username: profile?.username || user.user_metadata?.username || user.email?.split('@')[0] || 'User',
      full_name:
        profile?.full_name ||
        user.user_metadata?.full_name ||
        profile?.username ||
        'Pixelgram User',
      avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || null,
      email: user.email,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      last_active: Date.now(),
      notifications_count: existingIndex >= 0 ? accounts[existingIndex].notifications_count : undefined,
    };

    if (existingIndex >= 0) {
      accounts[existingIndex] = {
        ...accounts[existingIndex],
        ...updatedAccount,
      };
    } else {
      accounts.push(updatedAccount);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.error('Failed to save current account:', e);
  }
}

export async function switchToAccount(account: SavedAccount): Promise<boolean> {
  try {
    // 1. First ensure current account tokens are updated in list
    const { data: cur } = await supabase.auth.getSession();
    if (cur.session && cur.session.user) {
      const accounts = getSavedAccounts();
      const idx = accounts.findIndex((a) => a.user_id === cur.session.user.id);
      if (idx >= 0) {
        accounts[idx].access_token = cur.session.access_token;
        accounts[idx].refresh_token = cur.session.refresh_token;
        accounts[idx].last_active = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
      }
    }

    // 2. Set target account's session
    let res = await supabase.auth.setSession({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
    });

    // If access token expired, try refreshing with refresh token
    if (res.error) {
      console.warn('Direct setSession failed, attempting refreshSession:', res.error);
      const refreshRes = await supabase.auth.refreshSession({
        refresh_token: account.refresh_token,
      });

      if (refreshRes.error) {
        throw refreshRes.error;
      }
      res = refreshRes;
    }

    if (res.data.session) {
      // Update saved tokens
      const accounts = getSavedAccounts();
      const targetIdx = accounts.findIndex((a) => a.user_id === account.user_id);
      if (targetIdx >= 0) {
        accounts[targetIdx].access_token = res.data.session.access_token;
        accounts[targetIdx].refresh_token = res.data.session.refresh_token;
        accounts[targetIdx].last_active = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
      }
    }

    // Full reload to clean all query caches and load fresh profile
    window.location.href = '/home';
    return true;
  } catch (err) {
    console.error('Account switch failed:', err);
    return false;
  }
}

export function removeSavedAccount(userId: string) {
  try {
    const accounts = getSavedAccounts().filter((a) => a.user_id !== userId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.error('Failed to remove saved account:', e);
  }
}

export async function logInToAnotherAccount() {
  try {
    // Save current active session tokens before signing out
    const { data: cur } = await supabase.auth.getSession();
    if (cur.session && cur.session.user) {
      const accounts = getSavedAccounts();
      const idx = accounts.findIndex((a) => a.user_id === cur.session.user.id);
      if (idx >= 0) {
        accounts[idx].access_token = cur.session.access_token;
        accounts[idx].refresh_token = cur.session.refresh_token;
        accounts[idx].last_active = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
      }
    }

    // Sign out from Supabase (without clearing saved_accounts in localStorage!)
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Sign out for add account caught error:', err);
  } finally {
    // Redirect to login page where user can create a new account or log in
    window.location.href = '/login';
  }
}
