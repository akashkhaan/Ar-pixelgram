import type { Profile } from '@/types/types';

/** Suspended / locked / disabled account ke liye Instagram jaisa generic naam */
export const RESTRICTED_DISPLAY_NAME = 'Pixelgram User';

type StatusLike = { account_status?: string | null; is_suspended?: boolean | null } | null | undefined;

/**
 * Account restricted hai? (suspended / locked / permanently_disabled / is_suspended)
 * Instagram yahi teeno case me content aur naam chhupa deta hai.
 */
export function isAccountRestricted(profile: StatusLike): boolean {
  if (!profile) return false;
  const status = String(profile.account_status ?? 'active').toLowerCase();
  if (status && status !== 'active') return true;
  return Boolean(profile.is_suspended);
}

/**
 * Naam chhupana hai? (account restricted HO ya maine us user ko block kiya ho)
 * Instagram me blocked user bhi "Instagram User" dikhta hai.
 */
export function isIdentityHidden(profile: StatusLike, opts?: { blockedByMe?: boolean }): boolean {
  return Boolean(opts?.blockedByMe) || isAccountRestricted(profile);
}

/** Chat/list me dikhne wala naam */
export function displayNameOf(profile: Profile | null | undefined, opts?: { blockedByMe?: boolean }): string {
  if (!profile) return RESTRICTED_DISPLAY_NAME;
  if (isIdentityHidden(profile, opts)) return RESTRICTED_DISPLAY_NAME;
  return profile.full_name || profile.username || RESTRICTED_DISPLAY_NAME;
}

/** @username — hidden hone par khaali (generic avatar ke saath) */
export function handleOf(profile: Profile | null | undefined, opts?: { blockedByMe?: boolean }): string {
  if (!profile || isIdentityHidden(profile, opts)) return '';
  return profile.username ? `@${profile.username}` : '';
}

/** Avatar ke liye initial — hidden hone par '' (generic icon dikhao) */
export function initialOf(profile: Profile | null | undefined, opts?: { blockedByMe?: boolean }): string {
  if (!profile || isIdentityHidden(profile, opts)) return '';
  return (profile.full_name || profile.username || '?').charAt(0).toUpperCase();
}

/**
 * Feed/listing se restricted users ka content hatao.
 * Restore (account_status = active) hone par apne aap wapas dikhne lagega.
 */
export function dropRestrictedRows<T extends { profile?: Profile | null; user_id?: string | null }>(
  rows: T[],
): T[] {
  return rows.filter((row) => !isAccountRestricted(row.profile));
}
