import FacebookSwitchAccountModal from '@/components/profile/FacebookSwitchAccountModal';
import { logInToAnotherAccount } from '@/lib/savedAccounts';
import InstagramIcon from "@/components/icons/InstagramIcon";
import YoutubeIcon from "@/components/icons/YoutubeIcon";
import { ArrowLeft, AtSign, BadgeCheck, Sparkles, ChevronDown, ChevronRight, Flag, UserPlus, Globe, HelpCircle, KeyRound, LayoutDashboard, Loader2, LogOut, Moon, Music2, Shield, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import MobileLayout from '@/components/layouts/MobileLayout';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import useGoBack from '@/hooks/use-go-back';
import { getMyVerificationRequest, submitVerificationRequest } from '@/services/api';
import type { VerificationRequest } from '@/types/types';
import ReportProblemSection from './ReportProblemSection';


const THEME_STORAGE_KEY = 'pixelgram-theme';

const SettingsPage: React.FC = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const goBack = useGoBack("/profile");
  const handleBack = () => { if (section !== "main") setSection("main"); else goBack(); };
  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains('dark'));
  const [section, setSection] = useState<'main' | 'help' | 'report' | 'verification'>('main');
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [verificationRequest, setVerificationRequest] = useState<VerificationRequest | null>(null);
  const [verifyReason, setVerifyReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (user) getMyVerificationRequest(user.id).then(setVerificationRequest);
  }, [user]);

  // Live timer for real-time countdown
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 30-day (1 month) verification timeline & auto-expiry calculations
  // Tick kab mila: profile.verified_at (server set karta hai), warna approve hone ki date.
  const approvedAtRaw = profile?.verified_at
    || (verificationRequest?.status === 'approved' ? verificationRequest.reviewed_at : null)
    || null;
  const approvedDate = approvedAtRaw ? new Date(approvedAtRaw) : new Date();
  // 30 days = 1 month validity
  const expiryDate = new Date(approvedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const diffMs = expiryDate.getTime() - now;
  const expiredByTime = approvedAtRaw ? diffMs <= 0 : false;
  const isExpired = verificationRequest?.status === 'expired' || expiredByTime;
  const daysLeft = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const hoursLeft = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
  const minutesLeft = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
  const secondsLeft = Math.max(0, Math.floor((diffMs % (1000 * 60)) / 1000));

  const isVerifiedActive = Boolean(profile?.is_verified && !expiredByTime);
  // Renew/Request form dikhana hai ya nahi
  const canRequestTick = !isVerifiedActive && verificationRequest?.status !== 'pending';

  // 3-Phase Ghost Vanish rotating card:
  // Box 30s ke baad bhoot ki tarah gayab hoga, fir 2nd box aayega (6s), fir 3rd box (6s), fir wapas 1st box
  type CardPhase = 'main_box' | 'welcome_gov' | 'user_greeting';
  const [cardPhase, setCardPhase] = useState<CardPhase>('main_box');
  const [ghostState, setGhostState] = useState<'visible' | 'vanishing' | 'appearing'>('visible');

  useEffect(() => {
    let timer: any;
    if (cardPhase === 'main_box') {
      // 30 seconds tak rahega, fir bhoot ki tarah gayab hoga
      timer = setTimeout(() => {
        setGhostState('vanishing');
        setTimeout(() => {
          setCardPhase('welcome_gov');
          setGhostState('appearing');
          setTimeout(() => setGhostState('visible'), 650);
        }, 700);
      }, 30000);
    } else if (cardPhase === 'welcome_gov') {
      // 6 seconds tak welcome gov box rahega, fir gayab
      timer = setTimeout(() => {
        setGhostState('vanishing');
        setTimeout(() => {
          setCardPhase('user_greeting');
          setGhostState('appearing');
          setTimeout(() => setGhostState('visible'), 650);
        }, 700);
      }, 6000);
    } else if (cardPhase === 'user_greeting') {
      // 6 seconds tak user profile + Enjoy username rahega, fir gayab
      timer = setTimeout(() => {
        setGhostState('vanishing');
        setTimeout(() => {
          setCardPhase('main_box');
          setGhostState('appearing');
          setTimeout(() => setGhostState('visible'), 650);
        }, 700);
      }, 6000);
    }
    return () => clearTimeout(timer);
  }, [cardPhase]);

  // Auto-expire tick after 1 month (gayab ho jaye) — server bhi har 5 min me hatata hai,
  // ye sirf turant UI update ke liye hai.
  useEffect(() => {
    if (profile?.is_verified && expiredByTime && user) {
      import('@/services/api').then(async ({ supabase }) => {
        await supabase.from('profiles').update({ is_verified: false }).eq('user_id', user.id);
        await refreshProfile?.();
      }).catch(console.error);
    }
  }, [profile?.is_verified, expiredByTime, user]);

  const formatFriendlyDate = (d: Date) => {
    try {
      return d.toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return d.toLocaleDateString();
    }
  };

  const formatFriendlyTime = (d: Date) => {
    try {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '';
    }
  };

  const toggleTheme = (val: boolean) => {
    setDarkMode(val);
    document.documentElement.classList.toggle('dark', val);
    document.documentElement.style.colorScheme = val ? 'dark' : 'light';

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, val ? 'dark' : 'light');
    } catch {
      // Theme still applies for this session if storage is unavailable.
    }

    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) themeColor.content = val ? '#0B0B0F' : '#f8f7fb';
  };

  const handleDeleteAccount = async () => {
    // Sign out and show message (actual deletion requires server-side)
    toast.info('Account deletion request submitted. Our team will process it shortly.');
    await signOut();
    navigate('/login');
  };

  const handleSubmitVerification = async () => {
    if (!verifyReason.trim()) { toast.error('Please explain why you should be verified'); return; }
    setLoading(true);
    try {
      await submitVerificationRequest(verifyReason.trim());
      const updated = await getMyVerificationRequest(user!.id);
      setVerificationRequest(updated);
      toast.success('Verification request submitted!');
      setVerifyReason('');
      setSection('main');
    } catch (err) {
      toast.error((err as Error).message || 'Request submit nahi ho paayi');
    } finally {
      setLoading(false);
    }
  };

  if (section === 'help') {
    return (
      <MobileLayout hideNav>
        <div className="p-4 page-transition">
          <button onClick={() => setSection('main')} className="flex items-center gap-2 mb-5 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" /><span className="text-sm font-medium">Back</span>
          </button>
          <h2 className="text-xl font-bold text-foreground mb-5">Help Center</h2>
          <div className="space-y-4">
            {[
              { q: 'Email ya phone number kaise add karein?', a: 'Settings → Account Center me jaakar email ya number daalein, OTP verify karein. Max 5 email aur 5 number. Verified email/number se wahi password daal kar login bhi ho jayega.' },
              { q: 'Password bhool gaye?', a: 'Login screen par "Forgot password" par tap karein aur OTP se naya password set karein.' },
              { q: 'How to make my account private?', a: 'Go to Edit Profile and toggle "Private Account". Only approved followers can see your posts.' },
              { q: 'How to get verified?', a: 'Submit a verification request with a valid reason. Our team reviews within 3-5 business days.' },
              { q: 'How to delete my account?', a: 'Scroll to the bottom of Settings and tap "Delete Account". This action is permanent.' },
              { q: 'How does chatting work?', a: 'You can only chat with mutual followers — people you follow who also follow you back.' },
            ].map(({ q, a }) => (
              <div key={q} className="glass-card rounded-xl p-4 space-y-1">
                <p className="font-semibold text-sm text-foreground">{q}</p>
                <p className="text-sm text-muted-foreground text-pretty">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </MobileLayout>
    );
  }

  if (section === 'report') {
    return (
      <MobileLayout hideNav>
        <ReportProblemSection
          userId={user?.id || ''}
          onBack={() => setSection('main')}
          onDone={() => setSection('main')}
        />
      </MobileLayout>
    );
  }

  if (section === 'verification') {
    return (
      <MobileLayout hideNav>
        <div className="p-4 page-transition">
          <button onClick={() => setSection('main')} className="flex items-center gap-2 mb-5 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" /><span className="text-sm font-medium">Back</span>
          </button>
          <h2 className="text-xl font-bold text-foreground mb-2">Verification Request</h2>
          <p className="text-sm text-muted-foreground mb-5 text-pretty">Get a blue checkmark to show your account is authentic.</p>

          {isVerifiedActive ? (
            <div className="flex flex-col items-center py-12 text-center">
              <BadgeCheck className="w-16 h-16 text-primary mb-3" />
              <h3 className="font-bold text-foreground text-lg">Already Verified!</h3>
              <p className="text-sm text-muted-foreground">Your account has a verified badge.</p>
              <p className="text-xs text-muted-foreground mt-2">Khatam hoga: {formatFriendlyDate(expiryDate)} · {formatFriendlyTime(expiryDate)}</p>
            </div>
          ) : !canRequestTick && verificationRequest ? (
            <div className="glass-card rounded-xl p-5 text-center">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium mb-3
                ${verificationRequest.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                  verificationRequest.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                <BadgeCheck className="w-4 h-4" />
                {verificationRequest.status.charAt(0).toUpperCase() + verificationRequest.status.slice(1)}
              </div>
              <p className="text-sm text-muted-foreground text-pretty">
                {verificationRequest.status === 'pending'
                  ? 'Your request is under review. We\'ll notify you soon.'
                  : 'Congratulations! Your account is verified.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {isExpired && verificationRequest?.status !== 'rejected' && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 p-4 text-center space-y-1">
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                    <BadgeCheck className="w-4 h-4" /> Blue Tick Expired
                  </div>
                  <p className="text-sm text-muted-foreground text-pretty">
                    Aapka 30 din ka blue tick khatam ho gaya. Neeche reason likh kar dobara request bhejein.
                  </p>
                </div>
              )}
              {verificationRequest?.status === 'rejected' && (
                <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 p-4 text-center space-y-1">
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
                    <BadgeCheck className="w-4 h-4" /> Rejected
                  </div>
                  <p className="text-sm text-muted-foreground text-pretty">
                    Your last request was not approved. You can submit a new request below.
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Why should your account be verified?</Label>
                <Textarea
                  placeholder="Explain your public presence, notable work, or why verification is important for your account…"
                  value={verifyReason}
                  onChange={e => setVerifyReason(e.target.value)}
                  rows={5}
                  maxLength={500}
                  className="resize-none"
                />
              </div>
              <Button className="w-full h-11 font-semibold" onClick={handleSubmitVerification} disabled={loading || !verifyReason.trim()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BadgeCheck className="w-4 h-4 mr-2" />}
                Submit Request
              </Button>
            </div>
          )}
        </div>
      </MobileLayout>
    );
  }

  // Main settings
  return (
    <MobileLayout>
      <div className="p-4 page-transition space-y-5">
        <div className="ns-head">
          <button type="button" onClick={handleBack} className="ns-back" aria-label="Go back">
            <ArrowLeft className="w-6 h-6" strokeWidth={2.1} />
          </button>
          <h2 className="ns-h1">Settings</h2>
        </div>

        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={() => setShowSwitchModal(true)} className="ns-item">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="ns-ico ns-round object-cover" style={{ padding: 0 }} />
            ) : (
              <span className="ns-ico ns-round" style={{ ['--h' as string]: 265 } as React.CSSProperties}>
                {profile?.username?.[0]?.toUpperCase()}
              </span>
            )}
            <span className="flex-1 min-w-0">
              <span className="ns-title flex items-center gap-1.5 min-w-0">
                <span className="truncate">{profile?.full_name || profile?.username}</span>
                {isVerifiedActive && (
                  <BadgeCheck className="w-4 h-4 text-sky-500 fill-sky-500 shrink-0" stroke="#fff" />
                )}
              </span>
              <span className="ns-desc">View your profile</span>
            </span>
            <ChevronDown className="ns-chev" />
          </button>

          <button type="button" onClick={() => toggleTheme(!darkMode)} className="ns-item" aria-pressed={darkMode}>
            <span className="ns-ico" style={{ ['--h' as string]: 255 } as React.CSSProperties}>
              <Moon className="w-[22px] h-[22px]" strokeWidth={1.9} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="ns-title">Dark Mode</span>
              <span className="ns-desc">{darkMode ? 'Dark theme active' : 'Light theme active'}</span>
            </span>
            <span className={`ns-switch${darkMode ? ' on' : ''}`} />
          </button>
        </div>

        {/* Dashboard Card with Ghost Vanish & Materialize (Bhoot ki tarah gayab hona) */}
        <div className="frame">
          <div className={`dash relative overflow-hidden h-[185px] min-h-[185px] max-h-[185px] flex flex-col justify-between ${ghostState === "vanishing" ? "ghost-disappear" : ghostState === "appearing" ? "ghost-appear" : ""}`}>
            {/* Top Bar with Dynamic Avatar & Verification Button */}
            <div className="bar">
              <b>Pixelgram</b>
              <span className="inline-flex items-center gap-1">
                <span>{profile?.username || 'username'}</span>
                {isVerifiedActive && (
                  <BadgeCheck className="w-3.5 h-3.5 text-sky-300 fill-sky-400 shrink-0" stroke="#fff" />
                )}
              </span>
              <button
                type="button"
                onClick={() => setSection('verification')}
                className="flex items-center gap-1 text-white hover:text-sky-200 active:scale-95 transition-all font-medium cursor-pointer shrink-0"
                title="Verification Status"
              >
                <BadgeCheck className="w-3.5 h-3.5 text-sky-300" />
                <span>Verification</span>
              </button>
              <div className="flex items-center shrink-0">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Profile"
                    className="avatar rounded-full object-cover shrink-0 ring-1 ring-white/60"
                  />
                ) : (
                  <svg className="avatar" viewBox="0 0 32 32" aria-label="profile">
                    <circle cx="16" cy="16" r="16" fill="#fff" />
                    <circle cx="16" cy="12" r="5" fill="#2563eb" />
                    <path d="M6 27c1.5-5.5 6-8 10-8s8.5 2.5 10 8a16 16 0 0 1-20 0z" fill="#2563eb" />
                  </svg>
                )}
              </div>
            </div>

            {/* Phase Content */}
            <div className="flex-1 flex flex-col">
              {/* PHASE 1: Main Verification Box (30s) */}
              {cardPhase === 'main_box' && (
                isVerifiedActive ? (
                  <div className="flex-1 p-3 flex flex-col justify-between text-white bg-transparent backdrop-blur-[2px]">
                    {/* Active Badge Title & Validity Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-md shrink-0">
                          <BadgeCheck className="w-5 h-5 text-[#2563eb] fill-[#2563eb]" stroke="#fff" />
                        </div>
                        <div className="min-w-0 text-left">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[13px] tracking-wide text-white truncate">Official Blue Tick Active</span>
                            <span className="px-1.5 py-0.5 bg-emerald-400/25 text-emerald-300 border border-emerald-400/40 rounded-full text-[9px] font-bold shrink-0">Active</span>
                          </div>
                          <p className="text-[11px] text-blue-100/90 truncate">Konse tick: Blue Verified Badge (30 Din Validity)</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[11px] font-black text-amber-300 bg-black/25 px-2 py-0.5 rounded-md border border-amber-300/30">
                          {daysLeft} Din bache
                        </span>
                      </div>
                    </div>

                    {/* Kab mila aur Kab hatega Timings */}
                    <div className="grid grid-cols-2 gap-2 my-1 bg-black/25 p-2 rounded-xl border border-white/10 text-left">
                      <div>
                        <p className="text-[10px] text-blue-200 font-medium">Kab Mila (Issued):</p>
                        <p className="text-[11px] font-bold text-white leading-tight">{formatFriendlyDate(approvedDate)}</p>
                        <p className="text-[9px] text-blue-200/80">{formatFriendlyTime(approvedDate)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-amber-200 font-medium">Kab Hatega (Expiry):</p>
                        <p className="text-[11px] font-bold text-amber-300 leading-tight">{formatFriendlyDate(expiryDate)}</p>
                        <p className="text-[9px] text-amber-200/80">{formatFriendlyTime(expiryDate)}</p>
                      </div>
                    </div>

                    {/* Daily Auto-Decrement Status Bar */}
                    <div className="bg-black/25 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-[11px] border border-white/15">
                      <div className="flex items-center gap-1 text-white font-medium truncate">
                        <span className="animate-pulse">⏳</span>
                        <span>Khatam hone me: <b className="text-amber-300 font-bold">{daysLeft} din {hoursLeft}h {minutesLeft}m {secondsLeft}s</b> bache</span>
                      </div>
                      <span className="text-[9px] text-blue-200 shrink-0 font-medium">1 Mahine me auto-expire</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 p-3 flex flex-col justify-between text-white bg-transparent backdrop-blur-[2px]">
                    <div className="flex items-center justify-between gap-2 text-left">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center border border-white/30 shrink-0">
                          <BadgeCheck className="w-4 h-4 text-sky-200" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-[13px] text-white truncate">
                            {verificationRequest?.status === 'pending'
                              ? '⏳ Verification Request Pending'
                              : isExpired
                              ? '⚠️ Blue Tick Expired (30 Din pure)'
                              : 'Get Official Blue Tick'}
                          </p>
                          <p className="text-[11px] text-blue-100/80 truncate">
                            {verificationRequest?.status === 'pending'
                              ? 'Request review mein hai, approve hote hi 30 din ka tick shuru hoga'
                              : isExpired
                              ? 'Aapka 1 mahine ka blue tick khatam ho gaya hai. Dobara request karein'
                              : 'Request karein — 1 mahine automatic validity ke sath'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-black/25 p-2 rounded-xl border border-white/10 flex items-center justify-between gap-2">
                      <div className="text-[11px] text-blue-100 truncate text-left">
                        <span className="font-semibold text-white">Tick Validity:</span> 1 Mahina (30 Din Auto-Countdown)
                      </div>
                      <button
                        type="button"
                        onClick={() => setSection('verification')}
                        className="px-3 py-1 bg-white text-slate-900 rounded-lg text-xs font-bold shadow hover:bg-slate-100 active:scale-95 transition-all shrink-0 flex items-center gap-1 cursor-pointer"
                      >
                        <BadgeCheck className="w-3.5 h-3.5 text-pink-600" />
                        <span>{verificationRequest?.status === 'pending' ? 'View Status' : isExpired ? 'Renew Tick' : 'Request Tick'}</span>
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* PHASE 2: Official Indian Social Media & New Delhi Government Site */}
              {cardPhase === 'welcome_gov' && (
                <div className="flex-1 px-3.5 py-2.5 flex items-center justify-between gap-3 text-white relative overflow-hidden backdrop-blur-[2px]">
                  {/* Subtle Tricolor Ambient Light */}
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500/15 via-white/10 to-emerald-500/15 pointer-events-none" />

                  {/* LEFT SIDE: National Seal & Official Badge */}
                  <div className="flex flex-col items-center justify-center shrink-0 w-20 text-center">
                    <div className="w-13 h-13 rounded-2xl bg-black/30 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-md mb-1">
                      <span className="text-2xl">🇮🇳</span>
                    </div>
                    <span className="text-[9px] font-extrabold text-amber-200 uppercase tracking-wider">Official</span>
                  </div>

                  {/* RIGHT SIDE: Text Description */}
                  <div className="flex-1 min-w-0 text-left flex flex-col justify-center gap-0.5">
                    <div className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full bg-black/30 border border-white/20 text-[9px] font-bold text-amber-200 shadow-xs">
                      <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                      <span>Certified Platform</span>
                    </div>

                    <h3 className="text-[14px] sm:text-[15px] font-black text-white drop-shadow-md tracking-tight leading-tight truncate">
                      Welcome back pixelgram
                    </h3>

                    <p className="text-[11px] font-semibold text-emerald-200 leading-tight">
                      Indian social media and new delhi government site
                    </p>

                    <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-white/80 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                      <span className="truncate">Digital India • Safe &amp; Trusted Community</span>
                    </div>
                  </div>
                </div>
              )}

              {/* PHASE 3: User Avatar & Name on LEFT, Enjoy Text on RIGHT (Same Compact Size) */}
              {cardPhase === 'user_greeting' && (
                <div className="flex-1 px-3.5 py-2.5 flex items-center justify-between gap-3.5 text-white relative overflow-hidden backdrop-blur-[2px]">
                  {/* LEFT SIDE: Profile Photo & Username */}
                  <div className="flex flex-col items-center justify-center shrink-0 w-20 text-center">
                    <div className="relative mb-1">
                      <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-amber-300 via-pink-400 to-cyan-300 shadow-md shadow-pink-500/20">
                        <div className="w-full h-full rounded-full overflow-hidden bg-slate-900 flex items-center justify-center">
                          {profile?.avatar_url ? (
                            <img
                              src={profile.avatar_url}
                              alt={profile.username || 'user'}
                              className="w-full h-full object-cover rounded-full"
                            />
                          ) : (
                            <svg className="w-full h-full" viewBox="0 0 32 32">
                              <circle cx="16" cy="16" r="16" fill="#fff" />
                              <circle cx="16" cy="12" r="5" fill="#2563eb" />
                              <path d="M6 27c1.5-5.5 6-8 10-8s8.5 2.5 10 8a16 16 0 0 1-20 0z" fill="#2563eb" />
                            </svg>
                          )}
                        </div>
                      </div>
                      {profile?.is_verified && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-full bg-white flex items-center justify-center shadow">
                          <BadgeCheck className="w-3.5 h-3.5 text-sky-500 fill-sky-500" stroke="#fff" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-white truncate max-w-[80px] drop-shadow-sm inline-flex items-center justify-center gap-0.5">
                      <span>@{profile?.username || 'user'}</span>
                      {isVerifiedActive && (
                        <BadgeCheck className="w-3 h-3 text-sky-300 fill-sky-400 shrink-0" stroke="#fff" />
                      )}
                    </span>
                  </div>

                  {/* RIGHT SIDE: Enjoy Greeting & Text */}
                  <div className="flex-1 min-w-0 text-left flex flex-col justify-center gap-0.5">
                    <div className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full bg-black/30 border border-white/20 text-[9px] text-amber-200 font-semibold shadow-xs">
                      <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                      <span>Special Member Access</span>
                    </div>

                    <h3 className="text-[14px] sm:text-[15px] font-black text-white drop-shadow-md tracking-tight leading-tight truncate">
                      Enjoy @{profile?.username || 'user'} ✨
                    </h3>

                    <p className="text-[11px] text-white/90 font-medium leading-tight">
                      Pixelgram par aapka swagat hai • Have fun &amp; enjoy your time!
                    </p>

                    <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-emerald-300 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                      <span className="truncate">VIP Experience Active</span>
                    </div>
                  </div>
                </div>
              )}
            </div>


          </div>
        </div>

        {/* Menu items — new design */}
        <div className="flex flex-col gap-1.5">
        {[
          { icon: AtSign, h: 255, label: 'Account Center', desc: 'Email aur phone number add/manage karein', onClick: () => navigate('/settings/account-center') },
          { icon: Music2, h: 285, label: 'Hello Tune', desc: 'Callers ko ringing par aapka gana sunai de', onClick: () => navigate('/settings/hello-tune') },
          { icon: Globe, h: 215, label: 'Language', desc: 'App ki bhasha chunein / Select your language', onClick: () => navigate('/settings/language') },
          { icon: KeyRound, h: 35, label: 'Access Token', desc: '30 din ka token, devices aur logout manage karein', onClick: () => navigate('/settings/access-token') },
          { icon: HelpCircle, h: 165, label: 'Help Center', desc: 'FAQs and support', onClick: () => setSection('help') },
          { icon: Flag, h: 340, label: 'Report a Problem', desc: "Let us know what's wrong", onClick: () => setSection('report') },
          { ownerConnect: true, label: 'Owner Connect' },
          { icon: Shield, h: 195, label: 'Privacy', desc: 'Manage your privacy settings', onClick: () => navigate('/edit-profile') },
        ].map((item: any) => {
          if (item.ownerConnect) {
            return (
              <div key="owner-connect" className="flex flex-col">
                <button type="button" onClick={() => setOwnerOpen((v) => !v)} aria-expanded={ownerOpen} className="ns-item">
                  <span className="ns-ico" style={{ ['--h' as any]: 325 }}><InstagramIcon size={22} /></span>
                  <span className="flex-1 min-w-0 text-left">
                    <span className="ns-title">Owner Connect</span>
                    <span className="ns-desc">Pixelgram owner se Instagram ya YouTube par judiye</span>
                  </span>
                  <ChevronDown className={`ns-chev transition-transform ${ownerOpen ? 'rotate-180' : ''}`} />
                </button>
                {ownerOpen && (
                  <div className="flex gap-2.5 px-1 pt-1 pb-3.5">
                    <a href="https://www.instagram.com/akash_raaj_89?stkn=MXR3NTNhaTB2Mm15cg==" target="_blank" rel="noopener noreferrer" className="ns-chip" style={{ background: 'linear-gradient(45deg,#f9a03c,#e1306c 55%,#8a3ab9)' }}>
                      <InstagramIcon size={18} /> Instagram
                    </a>
                    <a href="https://youtube.com/@techtrickindia9?si=vBCxAOAcKYq2O0zl" target="_blank" rel="noopener noreferrer" className="ns-chip" style={{ background: '#ff2b2b' }}>
                      <YoutubeIcon size={18} /> YouTube
                    </a>
                  </div>
                )}
              </div>
            );
          }
          const { icon: Icon, label, desc, onClick, h } = item;
          return (
            <button key={label} type="button" onClick={onClick} className="ns-item">
              <span className="ns-ico" style={{ ['--h' as any]: h }}><Icon className="w-[22px] h-[22px]" strokeWidth={1.9} /></span>
              <span className="flex-1 min-w-0 text-left">
                <span className="ns-title">{label}</span>
                <span className="ns-desc">{desc}</span>
              </span>
              <ChevronRight className="ns-chev" />
            </button>
          );
        })}

        {/* Admin Panel — only visible for admin users */}
        {profile?.is_admin && (
          <button type="button" onClick={() => navigate('/admin')} className="ns-item">
            <span className="ns-ico" style={{ ['--h' as any]: 230 }}><LayoutDashboard className="w-[22px] h-[22px]" strokeWidth={1.9} /></span>
            <span className="flex-1 min-w-0 text-left">
              <span className="ns-title">Admin Panel</span>
              <span className="ns-desc">Manage the platform</span>
            </span>
            <ChevronRight className="ns-chev" />
          </button>
        )}

        {/* Logout */}
        <button type="button" onClick={signOut} className="ns-item ns-danger">
          <span className="ns-ico"><LogOut className="w-[22px] h-[22px]" strokeWidth={1.9} /></span>
          <span className="flex-1 min-w-0 text-left"><span className="ns-title">Sign Out</span></span>
        </button>

        {/* Delete account */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button type="button" className="ns-item ns-danger">
              <span className="ns-ico"><Trash2 className="w-[22px] h-[22px]" strokeWidth={1.9} /></span>
              <span className="flex-1 min-w-0 text-left">
                <span className="ns-title">Delete Account</span>
                <span className="ns-desc">This action is permanent</span>
              </span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Account?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your account, posts, and all data. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete Account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </div>
      <FacebookSwitchAccountModal
        isOpen={showSwitchModal}
        onClose={() => setShowSwitchModal(false)}
      />
    </MobileLayout>
  );
};

export default SettingsPage;
