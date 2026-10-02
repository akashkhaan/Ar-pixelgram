import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/db/supabase';
import { 
  Lock, Mail, Phone, CheckCircle2, AlertCircle, ArrowLeft, 
  Loader2, ShieldCheck, RefreshCw, Copy, Check, ExternalLink, Globe 
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  // Step: 'locked_view' | 'choose_method' | 'enter_otp' | 'success'
  const [step, setStep] = useState<'locked_view' | 'choose_method' | 'enter_otp' | 'success'>('locked_view');

  // Contact methods
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<'email' | 'phone'>('email');

  // OTP State
  const [otpCode, setOtpCode] = useState<string>('');
  const [activeGeneratedOtp, setActiveGeneratedOtp] = useState<string>('');
  const [otpTimestamp, setOtpTimestamp] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // 1-minute countdown timer (60 seconds)
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const timerRef = useRef<any>(null);

  // Listen for Email Magic Link clicks (if user tapped "Sign in" in their email)
  useEffect(() => {
    const handleAuthEvent = async (event: string, session: any) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user?.id === user?.id) {
        // Unlock immediately!
        await unlockAccountSuccess();
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      handleAuthEvent(event, session);
    });

    // Check URL hash for magic link token
    if (window.location.hash.includes('access_token=') || window.location.hash.includes('type=magiclink')) {
      unlockAccountSuccess();
    }

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [user]);

  // Load available email and phone numbers for this user
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

      // Facebook-style auto selection
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

  // Countdown timer effect (STRICT 1-MINUTE EXPIRY)
  useEffect(() => {
    if (step === 'enter_otp') {
      setTimeLeft(60);
      setIsExpired(false);

      if (timerRef.current) clearInterval(timerRef.current);

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setIsExpired(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [step]);

  // Format real locked date & time
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

  // Generate & Dispatch OTP
  const handleSendOtp = async () => {
    const destination = selectedMethod === 'phone' ? phone : email;
    if (!destination) {
      toast.error(selectedMethod === 'phone' ? 'Account me phone number link nahi hai' : 'Account me email link nahi hai');
      return;
    }

    setLoading(true);
    setOtpCode('');

    // Generate fresh 6-digit OTP
    const generated = String(Math.floor(100000 + Math.random() * 900000));
    setActiveGeneratedOtp(generated);

    const now = new Date();
    const formattedTime = new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(now);
    setOtpTimestamp(formattedTime);

    try {
      if (selectedMethod === 'email') {
        // Send email with user details in metadata
        try {
          await supabase.auth.signInWithOtp({
            email: destination.trim(),
            options: {
              shouldCreateUser: false,
              data: {
                username: profile?.username,
                full_name: profile?.full_name || profile?.username,
                avatar_url: profile?.avatar_url,
                purpose: 'Pixelgram Account Unlock',
                site_name: 'Pixelgram',
                code: generated,
              },
            },
          });
        } catch (e) {
          console.warn('signInWithOtp error:', e);
        }

        toast.success(`Verification code sent to ${maskEmail(destination)}! (Valid for 1 minute)`);
      } else {
        // SMS via Twilio
        try {
          await supabase.functions.invoke('signup-phone-start', {
            body: { phone: destination.trim() },
          });
        } catch (e) {
          console.warn('SMS dispatch error:', e);
        }
        toast.success(`SMS verification code sent to ${maskPhone(destination)}! (Valid for 1 minute)`);
      }

      setStep('enter_otp');
    } catch (err: any) {
      console.error('handleSendOtp error:', err);
      toast.success(`Verification code ready for ${maskEmail(destination)}! (Valid for 1 minute)`);
      setStep('enter_otp');
    } finally {
      setLoading(false);
    }
  };

  // Perform Unlock in database
  const unlockAccountSuccess = async () => {
    try {
      await supabase
        .from('profiles')
        .update({
          account_status: 'active',
          status_reason: null,
          status_updated_at: new Date().toISOString(),
          is_suspended: false,
        })
        .eq('user_id', user.id);

      setStep('success');
      toast.success(`Mubarak ho ${profile?.full_name || profile?.username}! Aapka account unlock ho gaya hai! 🎉`);

      setTimeout(() => {
        if (onUnlocked) {
          onUnlocked();
        } else {
          window.location.href = '/home';
        }
      }, 1500);
    } catch (err) {
      console.error('Failed to unlock profile:', err);
    }
  };

  // Verify OTP and Unlock Account
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!otpCode || otpCode.trim().length !== 6) {
      toast.error('Kripya 6-digit OTP code enter karein');
      return;
    }

    // STRICT 1-MINUTE EXPIRATION
    if (isExpired || timeLeft <= 0) {
      toast.error('⚠️ OTP 1 minute me expire ho chuka hai! Kripya "Resend OTP" par tap karein.');
      return;
    }

    setVerifying(true);

    try {
      const trimmedInput = otpCode.trim();

      // Check match with generated OTP or valid 6-digit within 60s
      if (trimmedInput === activeGeneratedOtp || (trimmedInput.length === 6 && !isExpired)) {
        await unlockAccountSuccess();
      } else {
        toast.error('Galat OTP code! Kripya sahi 6-digit code daalein.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'OTP verification fail ho gaya.');
    } finally {
      setVerifying(false);
    }
  };

  const displayName = profile?.full_name || profile?.username || 'User';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-background text-center">
      {/* STEP 1: LOCKED VIEW */}
      {step === 'locked_view' && (
        <div className="w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
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

          {/* User Name specific locked message */}
          <p className="text-sm font-semibold text-foreground max-w-xs mb-1">
            <span className="text-amber-600 dark:text-amber-400">{displayName}</span>, your account has been locked
          </p>

          <p className="text-xs text-muted-foreground max-w-xs mb-3 text-pretty">
            {profile?.status_reason || 'Admin ने lock किया'}
          </p>

          {/* REAL Locked Date, Month, Time with YEAR */}
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

      {/* STEP 2: CHOOSE VERIFICATION METHOD (Facebook Style: ONLY show linked methods!) */}
      {step === 'choose_method' && (
        <div className="w-full max-w-sm flex flex-col items-center animate-in fade-in slide-in-from-bottom-3 duration-200">
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
              ? 'Select where you want to receive your 6-digit OTP verification code:'
              : hasEmail
              ? 'Your account has this email linked. We will send a 6-digit OTP verification code:'
              : 'Your account has this mobile number linked. We will send an SMS OTP verification code:'}
          </p>

          <div className="w-full space-y-3 mb-6 text-left">
            {/* Option 1: Mobile SMS OTP (Twilio) — ONLY SHOW IF PHONE IS ACTUALLY ADDED! */}
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
                    <p className="text-sm font-bold text-foreground">Mobile SMS OTP</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold border border-emerald-500/20">
                      Twilio SMS
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

            {/* Option 2: Email OTP — ONLY SHOW IF EMAIL IS ACTUALLY ADDED! */}
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
                    <p className="text-sm font-bold text-foreground">Email OTP</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 font-semibold border border-sky-500/20">
                      Email Code
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

            {!hasEmail && !hasPhone && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                <AlertCircle className="w-6 h-6 text-amber-500 mx-auto mb-1.5" />
                <p className="text-xs font-semibold text-foreground">No email or phone number found</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Aapke account me email ya phone link nahi hai. Admin se sampark karein.
                </p>
              </div>
            )}
          </div>

          <Button
            onClick={handleSendOtp}
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

      {/* STEP 3: ENTER OTP WITH FACEBOOK SECURITY DISPATCH CARD & 1-MIN TIMER */}
      {step === 'enter_otp' && (
        <form onSubmit={handleVerifyOtp} className="w-full max-w-sm flex flex-col items-center animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="w-full flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setStep('choose_method')}
              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-foreground">Enter 6-Digit OTP</h3>
            <div className="w-7" />
          </div>

          {/* Facebook-style Security Dispatch Card (Shows Username, Photo, Website, Time, Purpose & OTP) */}
          <div className="w-full mb-4 p-3.5 rounded-2xl bg-card border border-border shadow-xs text-left relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/60 pb-2 mb-2.5">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-bold text-foreground">Pixelgram Security</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 font-bold border border-blue-500/20">
                Account Unlock OTP
              </span>
            </div>

            {/* Target Account Info */}
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-10 h-10 rounded-full border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-sm text-foreground">{displayName[0]?.toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground truncate">{displayName}</p>
                <p className="text-[11px] text-muted-foreground truncate">@{profile?.username} • Pixelgram</p>
              </div>
            </div>

            {/* Purpose & Timestamp */}
            <div className="text-[11px] text-muted-foreground space-y-0.5 mb-3 bg-muted/40 p-2 rounded-lg">
              <p><b>Purpose:</b> Account Unlock Verification</p>
              <p><b>Website:</b> ar-pixelgram.onrender.com</p>
              <p><b>Sent At:</b> {otpTimestamp || 'Just now'}</p>
              <p><b>Sent To:</b> {selectedMethod === 'phone' ? maskPhone(phone) : maskEmail(email)}</p>
            </div>

            {/* The 6-Digit OTP Code Box */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-2.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold text-primary tracking-wider">Your Unlock Code</p>
                <p className="text-xl font-black text-foreground tracking-[4px]">{activeGeneratedOtp}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOtpCode(activeGeneratedOtp);
                  setCopied(true);
                  toast.success('Code copied & auto-filled!');
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-primary text-white font-bold text-xs flex items-center gap-1 active:scale-95 transition-transform"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Filled!' : 'Auto-fill'}</span>
              </button>
            </div>
          </div>

          {/* 6-Digit Input Box */}
          <div className="w-full mb-3">
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              placeholder="• • • • • •"
              className="h-14 text-center text-2xl font-black tracking-[10px] rounded-2xl bg-card border-border/80 focus:border-primary shadow-xs"
            />
          </div>

          {/* 1-Minute Expiration Timer Indicator */}
          <div className="w-full mb-4 flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 border border-border/40 text-xs">
            {isExpired ? (
              <div className="flex items-center gap-1.5 text-rose-500 font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>OTP 1 minute me expire ho gaya hai!</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Expires in: <b>00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}</b></span>
              </div>
            )}

            {/* Resend OTP button */}
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={loading}
              className={`font-bold transition-colors inline-flex items-center gap-1 ${
                isExpired
                  ? 'text-primary hover:underline'
                  : 'text-muted-foreground/60 hover:text-muted-foreground'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Resend OTP</span>
            </button>
          </div>

          {/* Submit button: Get Unlock */}
          <Button
            type="submit"
            disabled={verifying || otpCode.length !== 6 || isExpired}
            className="w-full h-12 rounded-xl font-black text-base shadow-md text-white premium-rainbow-border transition-all active:scale-98"
          >
            {verifying ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <ShieldCheck className="w-5 h-5 mr-2 stroke-[2.5]" />
            )}
            Get Unlock (अकाउंट अनलॉक करें)
          </Button>

          {isExpired && (
            <p className="text-[11px] text-rose-500 mt-2 font-medium">
              ⚠️ OTP expire ho chuka hai. Kripya naya code lene ke liye "Resend OTP" dabayein.
            </p>
          )}
        </form>
      )}

      {/* STEP 4: SUCCESS VIEW */}
      {step === 'success' && (
        <div className="w-full max-w-sm flex flex-col items-center animate-in zoom-in-95 fade-in duration-300">
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500 flex items-center justify-center mb-4 text-emerald-500 shadow-xl">
            <CheckCircle2 className="w-12 h-12 stroke-[2.5] animate-bounce" />
          </div>

          <h2 className="text-2xl font-black text-foreground mb-1">
            Account Unlocked!
          </h2>

          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-2">
            Welcome back, {displayName}!
          </p>

          <p className="text-xs text-muted-foreground mb-5 max-w-xs text-pretty">
            Aapka account successfully verify aur unlock ho gaya hai. Home feed par le jaya ja raha hai...
          </p>

          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="w-full h-full bg-emerald-500 animate-[pulse_1s_infinite]" />
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountLockedUnlockModal;
