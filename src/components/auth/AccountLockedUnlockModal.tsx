import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/db/supabase';
import { Lock, Mail, Phone, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FuturisticOtpCard } from './FuturisticOtpCard';

// JWT ke amr claim se pata chalta hai ki session kaise bana tha
// ("password" ya "otp"). Sirf fresh OTP session hi unlock ka rasta hai.
function hasFreshOtpSession(accessToken?: string | null): boolean {
  if (!accessToken) return false;
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return false;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const amr = Array.isArray(json?.amr) ? json.amr : [];
    const now = Date.now() / 1000;
    return amr.some((item: any) => {
      const method = String(item?.method ?? '').toLowerCase();
      const ts = Number(item?.timestamp ?? 0);
      return ['otp', 'email_otp', 'sms_otp'].includes(method) && ts > 0 && now - ts < 15 * 60;
    });
  } catch {
    return false;
  }
}

interface AccountLockedUnlockModalProps {
  user: any;
  profile: any;
  onUnlocked?: () => void;
  onSignOut?: () => void;
}

export const AccountLockedUnlockModal: React.FC<AccountLockedUnlockModalProps> = ({
  user,
  profile,
  onUnlocked,
  onSignOut,
}) => {
  // Steps: 'locked_view' | 'choose_method' | 'enter_otp'
  const [step, setStep] = useState<'locked_view' | 'choose_method' | 'enter_otp'>('locked_view');

  // Contact methods
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<'email' | 'phone'>('email');

  // OTP State — code sirf server verify karta hai, browser ke paas koi
  // "apna" accepted code nahi hota.
  const [loading, setLoading] = useState(false);
  const [otpTtl, setOtpTtl] = useState(60);
  const [resendAfter, setResendAfter] = useState(60);
  const [resendCount, setResendCount] = useState(0);
  const [freshOtpSession, setFreshOtpSession] = useState(false);
  const unlockedRef = useRef(false);

  // NOTE: pehle yahan auth events (SIGNED_IN / USER_UPDATED / #access_token) par
  // account automatically unlock karne wala listener tha. Wahi "bina OTP account
  // khul gaya" bug tha — page reload / tab focus / token refresh par bhi chalta tha.
  // Ab unlock sirf handleVerifyOtpCode() se hota hai, yaani asli OTP verify hone ke baad.
  // Database me bhi guard trigger hai (00008_guard_account_unlock.sql), to galat
  // tarike se unlock ki koshish DB hi reject kar deti hai.

  // Email ka magic link click hone par session banta hai (amr = otp).
  // Us case me OTP screen par ek saaf button dikhate hain — automatic kuch
  // unlock nahi hota, user khud tap karta hai.
  useEffect(() => {
    const sync = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session?.user?.id || session.user.id !== user?.id) {
        setFreshOtpSession(false);
        return;
      }
      setFreshOtpSession(hasFreshOtpSession(session.access_token));
    };

    void sync();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void sync();
    });
    return () => sub.subscription.unsubscribe();
  }, [user]);

  // Load user verified contacts
  useEffect(() => {
    async function loadContacts() {
      let detectedEmail = (user?.email || profile?.email || '').trim();
      let detectedPhone = (user?.phone || profile?.phone || '').trim();

      if (user?.id) {
        try {
          const { data, error } = await supabase
            .from('account_identifiers')
            .select('type, value')
            .eq('user_id', user.id);

          if (!error && data) {
            for (const item of data) {
              if (item.type === 'phone' && !detectedPhone && item.value?.trim()) {
                detectedPhone = item.value.trim();
              }
              if (item.type === 'email' && !detectedEmail && item.value?.trim()) {
                detectedEmail = item.value.trim();
              }
            }
          }
        } catch (err) {
          console.warn('Could not fetch account_identifiers:', err);
        }
      }

      setEmail(detectedEmail);
      setPhone(detectedPhone);

      // Auto select appropriate method
      if (detectedEmail && !detectedPhone) {
        setSelectedMethod('email');
      } else if (detectedPhone && !detectedEmail) {
        setSelectedMethod('phone');
      } else if (detectedEmail) {
        setSelectedMethod('email');
      }
    }

    loadContacts();
  }, [user, profile]);

  // Format real locked date & time from status_updated_at
  const getFormattedLockedDate = () => {
    const rawDate = profile?.status_updated_at || profile?.updated_at || new Date().toISOString();
    try {
      const d = new Date(rawDate);
      return new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(d);
    } catch {
      return '2 October 2026 at 03:13 pm';
    }
  };

  const maskEmail = (str: string) => {
    if (!str) return '';
    const parts = str.split('@');
    if (parts.length !== 2) return str;
    const name = parts[0];
    const visible = name.slice(0, 2);
    return `${visible}***@${parts[1]}`;
  };

  const maskPhone = (str: string) => {
    if (!str) return '';
    const digits = str.replace(/[^\d+]/g, '');
    if (digits.length <= 4) return digits;
    const end = digits.slice(-4);
    const start = digits.slice(0, 3);
    return `${start} ******${end}`;
  };

  const hasEmail = Boolean(email && email.trim());
  const hasPhone = Boolean(phone && phone.trim());

  // Send REAL OTP to Email or Phone (code sirf server ke paas hota hai)
  const handleSendOtp = async (isResend: boolean = false) => {
    const destination = selectedMethod === 'phone' ? phone : email;
    if (!destination) {
      toast.error(selectedMethod === 'phone' ? 'Account me phone number add nahi hai' : 'Account me email add nahi hai');
      return;
    }

    setLoading(true);

    try {
      if (selectedMethod === 'email') {
        const { error: otpErr } = await supabase.auth.signInWithOtp({
          email: destination.trim(),
          options: {
            shouldCreateUser: false,
            data: {
              username: profile?.username,
              full_name: profile?.full_name || profile?.username,
              avatar_url: profile?.avatar_url,
              purpose: 'Pixelgram Account Unlock Code',
              site_name: 'Pixelgram',
            },
          },
        });

        if (otpErr) {
          console.warn('Supabase signInWithOtp error:', otpErr);
          const isRateLimit = otpErr.message?.includes('rate limit') || (otpErr as any)?.status === 429;
          toast.error(
            isRateLimit
              ? 'Email rate limit ho gaya hai. Kripya 1 minute baad dobara try karein.'
              : 'Email code bhejne me dikkat aayi. Kripya phone se try karein.'
          );
          return;
        }

        toast.success(
          isResend
            ? `Naya security code ${maskEmail(destination)} par bhej diya gaya hai!`
            : `Security code ${maskEmail(destination)} par bhej diya gaya hai!`
        );

        // email code: 1 minute (60s) ke andar daalna hai
        setOtpTtl(60);
        setResendAfter(60);
      } else {
        // SMS — code server par hash hoke save hota hai; response me code/hash
        // kabhi nahi aata, sirf expiry aur cooldown aata hai.
        const { data, error } = await supabase.functions.invoke('unlock-account-otp', {
          body: { action: 'send', type: 'phone', destination: destination.trim() },
        });

        if (error || data?.error) {
          const code = data?.error || 'delivery_failed';
          if (code === 'resend_cooldown' && data?.retry_after) {
            toast.warning(`Kripya ${data.retry_after} second baad naya code maangein.`);
          } else if (code === 'too_many_requests') {
            toast.error('Bahut zyada koshish. Kripya 15 minute baad try karein.');
          } else if (code === 'destination_not_on_account') {
            toast.error('Ye number is account se juda hua nahi hai.');
          } else {
            toast.error('SMS code bhejne me dikkat aayi. Kripya email se try karein.');
          }
          return;
        }

        setOtpTtl(Number(data?.expiresIn ?? 60));
        setResendAfter(Number(data?.resendAfter ?? 60));
        toast.success(
          isResend ? 'Naya SMS code bhej diya gaya hai!' : `SMS code ${maskPhone(destination)} par bhej diya gaya hai!`
        );
      }

      setResendCount((n) => n + 1);
      setStep('enter_otp');
    } catch (err: any) {
      console.error('handleSendOtp error:', err);
      toast.error('Code bhejne me dikkat aayi. Kripya dobara try karein.');
    } finally {
      setLoading(false);
    }
  };

  // Sirf UI: success dikhao aur aage bhejo (koi DB write nahi)
  const finishUnlock = () => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    toast.success(`Mubarak ho ${profile?.full_name || profile?.username}! Aapka account unlock ho gaya hai! 🎉`);
    setTimeout(() => {
      if (onUnlocked) {
        onUnlocked();
      } else {
        window.location.href = '/home';
      }
    }, 2000);
  };

  // Account status update — ise database ka guard trigger check karta hai:
  // sirf fresh OTP-verified session se hi chalta hai, warna error aata hai.
  const unlockViaClient = async (): Promise<boolean> => {
    const { error } = await supabase
      .from('profiles')
      .update({
        account_status: 'active',
        status_reason: null,
        status_updated_at: new Date().toISOString(),
        is_suspended: false,
      })
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to unlock profile:', error);
      // DB guard ka message aage bhejo (expire / bina OTP / limit)
      const raw = String((error as any)?.message ?? '');
      if (/expire/i.test(raw)) {
        toast.error('Code expire ho gaya hai. Resend par tap karke naya code bhejein.');
      }
      return false;
    }
    finishUnlock();
    return true;
  };

  // Magic link se verify hua session — user ke tap par hi unlock
  const handleLinkUnlock = async () => {
    setLoading(true);
    try {
      const { data: check } = await supabase
        .from('profiles')
        .select('account_status')
        .eq('user_id', user.id)
        .maybeSingle();
      if (check?.account_status === 'active') {
        finishUnlock();
        return;
      }
      const ok = await unlockViaClient();
      if (!ok) {
        toast.error('Unlock nahi ho paya. Kripya email ka 6-digit code daalein.');
        setFreshOtpSession(false);
      }
    } finally {
      setLoading(false);
    }
  };

  // Verify entered OTP
  const handleVerifyOtpCode = async (enteredCode: string): Promise<boolean> => {
    const trimmedInput = enteredCode.trim();
    if (!trimmedInput) {
      throw new Error('Kripya 6-digit security code ya email link enter karein');
    }

    const destination = selectedMethod === 'phone' ? phone : email;

    // ---------- PHONE: server-side verify (hash + expiry DB me check hota hai) ----------
    if (selectedMethod === 'phone') {
      let fnError: any = null;
      try {
        const { data, error } = await supabase.functions.invoke('unlock-account-otp', {
          body: {
            action: 'verify',
            userId: user.id,
            destination: destination.trim(),
            code: trimmedInput,
          },
        });
        fnError = error;
        if (!error && data?.ok === true) {
          // Server (service role) ne account unlock kar diya hai — yahan dobara
          // client se update karne ki zarurat nahi, warna guard trigger reject karega.
          finishUnlock();
          return true;
        }
        // Function ka asli error message (galat code / expire / limit) dikhao
        const serverCode = typeof data?.error === 'string' ? data.error : '';
        const left = data?.attempts_left;
        const message =
          serverCode === 'invalid_code'
            ? `Galat OTP code!${typeof left === 'number' ? ` (${left} try baaki)` : ''}`
            : serverCode === 'otp_expired'
              ? 'Code expire ho gaya hai. Resend par tap karke naya code bhejein.'
              : serverCode === 'no_active_code'
                ? 'Koi active code nahi hai. Pehle naya code bhejein.'
                : serverCode === 'too_many_attempts'
                  ? 'Bahut zyada galat koshish. Naya code maangein.'
                  : '';
        throw new Error(message || 'Galat OTP code! Kripya sahi code daalein.');
      } catch (err: any) {
        if (err?.message && !fnError) throw err;
        console.warn('unlock-account-otp verify error:', err, fnError);
        throw new Error(err?.message || 'OTP verify nahi ho paya. Naya code bhejein.');
      }
    }

    // ---------- EMAIL: sirf Supabase Auth OTP (server) verify karta hai ----------
    let emailError: string = '';

    try {
      // a) Email me aaya poora link paste kiya ho to us se verify
      if (trimmedInput.includes('http') || trimmedInput.includes('token=')) {
        try {
          const urlStr = trimmedInput.replace(/^.*https?:\/\//, 'https://');
          const urlObj = new URL(urlStr);
          const tokenParam = urlObj.searchParams.get('token') || urlObj.searchParams.get('code');
          const tokenHash = urlObj.searchParams.get('token_hash');
          if (tokenHash) {
            const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
            if (!error && (data?.session || data?.user)) {
              const unlocked = await unlockViaClient();
              if (!unlocked) throw new Error('Account unlock nahi ho paya. Kripya naya code bhej kar dobara try karein.');
              return true;
            }
            emailError = error?.message || '';
          } else if (tokenParam) {
            const { data, error } = await supabase.auth.verifyOtp({
              email: destination.trim(),
              token: tokenParam,
              type: 'email',
            });
            if (!error && (data?.session || data?.user)) {
              const unlocked = await unlockViaClient();
              if (!unlocked) throw new Error('Account unlock nahi ho paya. Kripya naya code bhej kar dobara try karein.');
              return true;
            }
            emailError = error?.message || '';
          }
        } catch (e) {
          console.warn('Email link parse failed:', e);
        }
      }

      // b) 6-digit code — Supabase hi sahi/galat/expire decide karta hai
      const numMatch = trimmedInput.match(/\d{6}/);
      const codeToVerify = numMatch ? numMatch[0] : trimmedInput;
      const { data, error } = await supabase.auth.verifyOtp({
        email: destination.trim(),
        token: codeToVerify,
        type: 'email',
      });

      if (!error && (data?.session || data?.user)) {
        const unlocked = await unlockViaClient();
        if (!unlocked) throw new Error('Account unlock nahi ho paya. Kripya naya code bhej kar dobara try karein.');
        return true;
      }
      emailError = error?.message || '';
    } catch (err: any) {
      emailError = err?.message || '';
    }

    // Yahan tak aaye matlab code galat ya expire hai — unlock NAHI hoga
    // Supabase galat aur expired code ke liye ek jaisa message deta hai,
    // isliye dono ka saaf matlab likhte hain (unlock phir bhi nahi hoga).
    throw new Error(
      /expire|invalid|token/i.test(emailError)
        ? 'Code galat hai ya expire ho gaya hai. Resend par tap karke naya code bhejein.'
        : 'Galat OTP code! Kripya sahi code daalein.'
    );
  };

  const displayName = profile?.full_name || profile?.username || 'User';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center">
      {/* STEP 1: LOCKED VIEW */}
      {step === 'locked_view' && (
        <div className="w-full max-w-sm flex flex-col items-center px-4 py-8 animate-in fade-in zoom-in-95 duration-200">
          {/* Avatar with Lock Badge */}
          <div className="w-24 h-24 rounded-full border-4 border-border flex items-center justify-center mb-4 bg-muted relative shadow-lg">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="w-full h-full rounded-full object-cover opacity-60"
              />
            ) : (
              <span className="text-3xl font-black text-muted-foreground">
                {displayName[0]?.toUpperCase()}
              </span>
            )}
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center border-2 border-background shadow-md">
              <Lock className="w-4 h-4 text-white" />
            </div>
          </div>

          {/* User Name & Locked Header */}
          <h2 className="text-xl font-black text-foreground mb-1">
            {displayName}
          </h2>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold text-xs mb-3">
            <Lock className="w-3.5 h-3.5" />
            <span>Account Locked</span>
          </div>

          <p className="text-sm font-semibold text-foreground max-w-xs mb-1">
            <span className="text-amber-600 dark:text-amber-400">{displayName}</span>, your account has been locked
          </p>

          <p className="text-xs text-muted-foreground max-w-xs mb-3 text-pretty">
            {profile?.status_reason || 'Admin ने lock किया'}
          </p>

          {/* REAL Locked Date & Time */}
          <div className="w-full bg-muted/50 border border-border/60 rounded-xl px-4 py-2.5 mb-5 text-left flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">Locked Date & Time:</p>
              <p className="text-xs font-bold text-foreground">{getFormattedLockedDate()}</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          </div>

          {/* Action Buttons: ONLY UNLOCK ACCOUNT & SIGN OUT */}
          <div className="w-full space-y-3">
            <Button
              onClick={() => {
                if (hasEmail && !hasPhone) {
                  setSelectedMethod('email');
                } else if (hasPhone && !hasEmail) {
                  setSelectedMethod('phone');
                }
                setStep('choose_method');
              }}
              className="w-full h-12 rounded-xl font-black text-base shadow-lg transition-transform active:scale-98 text-white premium-rainbow-border"
            >
              <ShieldCheck className="w-5 h-5 mr-2 stroke-[2.5]" />
              Unlock Account (अनलॉक करें)
            </Button>

            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="pt-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: CHOOSE VERIFICATION METHOD */}
      {step === 'choose_method' && (
        <div className="w-full max-w-sm flex flex-col items-center px-4 py-8 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="w-full flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setStep('locked_view')}
              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-foreground">Choose Unlock Method</h3>
            <div className="w-7" />
          </div>

          <p className="text-xs text-muted-foreground mb-4 text-center">
            {hasEmail && hasPhone
              ? 'Select where you want to receive your 6-digit security code:'
              : hasEmail
              ? 'Your account has this email linked. We will send a 6-digit security code to unlock your account:'
              : 'Your account has this mobile number linked. We will send an SMS security code:'}
          </p>

          <div className="w-full space-y-3 mb-6 text-left">
            {/* Mobile SMS OTP — ONLY IF PHONE EXISTS */}
            {hasPhone && (
              <div
                onClick={() => setSelectedMethod('phone')}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none flex items-center gap-3.5 ${
                  selectedMethod === 'phone'
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border/60 bg-card hover:bg-muted/40'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  selectedMethod === 'phone' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                }`}>
                  <Phone className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-foreground">Mobile SMS Code</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold border border-emerald-500/20">
                      SMS
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {maskPhone(phone)}
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedMethod === 'phone' ? 'border-primary' : 'border-muted-foreground/40'
                }`}>
                  {selectedMethod === 'phone' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </div>
              </div>
            )}

            {/* Email OTP — ONLY IF EMAIL EXISTS */}
            {hasEmail && (
              <div
                onClick={() => setSelectedMethod('email')}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none flex items-center gap-3.5 ${
                  selectedMethod === 'email'
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border/60 bg-card hover:bg-muted/40'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  selectedMethod === 'email' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                }`}>
                  <Mail className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-foreground">Email Security Code</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 font-semibold border border-sky-500/20">
                      Email
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {maskEmail(email)}
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedMethod === 'email' ? 'border-primary' : 'border-muted-foreground/40'
                }`}>
                  {selectedMethod === 'email' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={() => handleSendOtp(false)}
            disabled={loading || (!hasEmail && !hasPhone)}
            className="w-full h-12 rounded-xl font-bold text-base shadow-md text-white premium-rainbow-border"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : null}
            Continue (आगे बढ़ें)
          </Button>
        </div>
      )}

      {/* STEP 3: FUTURISTIC OTP CARD COMPONENT (USER PROVIDED HTML/CSS) */}
      {step === 'enter_otp' && (
        <>
          {freshOtpSession && (
            <div className="fixed inset-x-0 bottom-4 z-50 px-4">
              <div className="mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-white shadow-xl">
                <span className="text-xs font-semibold">Email link verify ho gaya hai</span>
                <Button
                  size="sm"
                  onClick={handleLinkUnlock}
                  disabled={loading}
                  className="bg-white text-emerald-700 hover:bg-white/90"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Unlock'}
                </Button>
              </div>
            </div>
          )}
          <FuturisticOtpCard
            title={selectedMethod === 'phone' ? 'Check Your Phone Now' : 'Check Your Email Now'}
            subtitle={selectedMethod === 'phone' ? 'Enter the OTP sent to your phone.' : 'Enter the OTP sent to your email.'}
            target={selectedMethod === 'phone' ? maskPhone(phone) : maskEmail(email)}
            type={selectedMethod}
            ttlSeconds={otpTtl}
            resendCooldown={resendAfter}
            resendKey={resendCount}
            onVerify={handleVerifyOtpCode}
            onResend={() => handleSendOtp(true)}
            onBack={() => setStep('choose_method')}
            successTitle="Account Unlocked Successfully!"
            successSubtitle="Welcome back. Redirecting to your feed..."
          />
        </>
      )}
    </div>
  );
};

export default AccountLockedUnlockModal;
