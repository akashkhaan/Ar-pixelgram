import { supabase } from '@/db/supabase';

/**
 * Supabase auth ke English error messages ko saaf Hinglish me badalta hai.
 * Sabse zaroori: email rate limit (default provider par 2 email/hour) — pehle
 * user ko "email rate limit exceeded" jaisa raw message dikhta tha ya kuch bhi
 * nahi dikhta tha aur wo samajh hi nahi paata tha ki email kyun nahi aayi.
 */
export function friendlyAuthError(rawMessage?: string | null): string {
  const msg = String(rawMessage ?? '').toLowerCase();

  if (msg.includes('rate limit') || msg.includes('over_email_send')) {
    return 'Email bhejne ki limit poori ho gayi hai. Kripya 1 ghante baad dobara try karein.';
  }
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return 'Ye email pehle se registered hai. Login karein ya "Resend confirmation" dabayein.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Email confirm nahi hua hai. Inbox me confirmation link kholo, ya naya link bhejein.';
  }
  if (msg.includes('invalid email')) {
    return 'Email address sahi nahi hai.';
  }
  if (msg.includes('password should be') || msg.includes('weak password')) {
    return 'Password kamzor hai. Kam se kam 6 character rakhein.';
  }
  if (msg.includes('signups not allowed') || msg.includes('signup is disabled')) {
    return 'Abhi naye signup band hain. Thodi der baad try karein.';
  }
  if (msg.includes('user not found')) {
    return 'Is email ka koi account nahi mila.';
  }
  return rawMessage || 'Kuch galat ho gaya. Kripya dobara try karein.';
}

/** Signup confirmation email dobara bhejta hai. */
export async function resendSignupConfirmation(email: string): Promise<{ ok: boolean; message: string }> {
  const clean = (email ?? '').trim().toLowerCase();
  if (!clean.includes('@')) {
    return { ok: false, message: 'Sahi email address daalein.' };
  }

  const { error } = await supabase.auth.resend({ type: 'signup', email: clean });
  if (error) {
    return { ok: false, message: friendlyAuthError(error.message) };
  }
  return {
    ok: true,
    message: `Confirmation link ${clean} par bhej diya gaya hai. Inbox aur Spam folder dono check karein.`,
  };
}

/**
 * Signup ke turant baad user ko sach batata hai.
 * Supabase kabhi-kabhi email bheje bina hi success deta hai (default provider
 * par sirf team emails ko deliver hota hai), isliye yahan saaf instruction
 * dete hain aur resend ka rasta bhi kholte hain.
 */
export async function afterSignupEmailNotice(email: string): Promise<string> {
  return `Account ban gaya. Confirmation link ${email} par bheja gaya hai — Inbox aur Spam folder check karein. Link na mile to "Resend confirmation" dabayein.`;
}
