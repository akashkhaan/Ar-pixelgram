import FacebookSwitchAccountModal from '@/components/profile/FacebookSwitchAccountModal';
import { logInToAnotherAccount } from '@/lib/savedAccounts';
import InstagramIcon from "@/components/icons/InstagramIcon";
import { ArrowLeft, AtSign, BadgeCheck, ChevronDown, ChevronRight, Flag, UserPlus, Users, Globe, HelpCircle, LayoutDashboard, Loader2, LogOut, Moon, Shield, Sun, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import MobileLayout from '@/components/layouts/MobileLayout';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import useGoBack from '@/hooks/use-go-back';
import { getMyVerificationRequest, submitVerificationRequest } from '@/services/api';
import type { VerificationRequest } from '@/types/types';
import ReportProblemSection from './ReportProblemSection';


const SettingsPage: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const goBack = useGoBack("/profile");
  const handleBack = () => { if (section !== "main") setSection("main"); else goBack(); };
  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains('dark'));
  const [section, setSection] = useState<'main' | 'help' | 'report' | 'verification'>('main');
  const [showSwitchModal, setShowSwitchModal] = useState(false);
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
  const approvedAtRaw = verificationRequest?.reviewed_at || (profile?.is_verified ? (profile?.created_at || '2026-10-02T10:00:00Z') : null);
  const approvedDate = approvedAtRaw ? new Date(approvedAtRaw) : new Date();
  // 30 days = 1 month validity
  const expiryDate = new Date(approvedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const diffMs = expiryDate.getTime() - now;
  const isExpired = approvedAtRaw ? diffMs <= 0 : false;
  const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const hoursLeft = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
  const minutesLeft = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
  const secondsLeft = Math.max(0, Math.floor((diffMs % (1000 * 60)) / 1000));

  const isVerifiedActive = Boolean((profile?.is_verified || verificationRequest?.status === 'approved') && !isExpired);

  // Auto-expire tick after 1 month (gayab ho jaye)
  useEffect(() => {
    if (profile?.is_verified && isExpired && user) {
      import('@/services/api').then(({ supabase }) => {
        supabase.from('profiles').update({ is_verified: false }).eq('user_id', user.id);
      }).catch(console.error);
    }
  }, [profile?.is_verified, isExpired, user]);

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
    if (val) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
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

          {profile?.is_verified ? (
            <div className="flex flex-col items-center py-12 text-center">
              <BadgeCheck className="w-16 h-16 text-primary mb-3" />
              <h3 className="font-bold text-foreground text-lg">Already Verified!</h3>
              <p className="text-sm text-muted-foreground">Your account has a verified badge.</p>
            </div>
          ) : verificationRequest && verificationRequest.status !== 'rejected' ? (
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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="w-9 h-9 rounded-full hover:bg-muted active:scale-95 flex items-center justify-center transition-all text-foreground"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h2 className="text-xl font-bold text-foreground">Settings</h2>
        </div>

        {/* Profile info & Switch Account (Facebook Menu Style from Screenshot) */}
        <div className="space-y-2.5">
          {/* Card 1: Profile Card */}
          <div
            onClick={() => setShowSwitchModal(true)}
            className="flex items-center justify-between gap-3 glass-card rounded-2xl p-3.5 hover:bg-muted/70 active:scale-[0.99] transition-all cursor-pointer border border-border/50 shadow-xs"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0 ring-1 ring-border/50" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-primary font-bold text-lg">{profile?.username?.[0]?.toUpperCase()}</span>
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <p className="font-bold text-[15px] text-foreground truncate">{profile?.full_name || profile?.username}</p>
                <p className="text-xs text-muted-foreground truncate">View your profile</p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-muted/90 flex items-center justify-center text-muted-foreground">
              <ChevronDown className="w-5 h-5" />
            </div>
          </div>

          {/* Card 2: Switch Account Card (from Screenshot) */}
          <div
            onClick={() => setShowSwitchModal(true)}
            className="flex items-center justify-between gap-3 glass-card rounded-2xl p-3.5 hover:bg-muted/70 active:scale-[0.99] transition-all cursor-pointer border border-border/50 shadow-xs"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-full p-[2px] premium-rainbow-border flex items-center justify-center shrink-0 shadow-sm">
                <div className="w-full h-full rounded-full bg-card dark:bg-zinc-800 flex items-center justify-center">
                  <Users className="w-5 h-5 premium-rainbow-icon" />
                </div>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-bold text-[15px] premium-rainbow-text">Switch account</p>
                <p className="text-xs text-muted-foreground">Tap to switch or add another account</p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-muted/90 flex items-center justify-center text-muted-foreground">
              <ChevronDown className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
            <div className="flex items-center gap-3">
              {darkMode ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-primary" />}
              <div>
                <p className="text-sm font-medium text-foreground">Dark Mode</p>
                <p className="text-xs text-muted-foreground">{darkMode ? 'Dark theme active' : 'Light theme active'}</p>
              </div>
            </div>
            <Switch checked={darkMode} onCheckedChange={toggleTheme} />
          </div>
        </div>

        {/* Dashboard Card */}
        <div className="frame">
          <div className="dash">
            {/* Top Bar with Dynamic Avatar & Verification Button */}
            <div className="bar">
              <b>Pixelgram</b>
              <span>{profile?.username || 'username'}</span>
              <span>withdraw</span>
              <button
                type="button"
                onClick={() => setSection('verification')}
                className="flex items-center gap-1 text-white hover:text-sky-200 active:scale-95 transition-all font-medium cursor-pointer shrink-0"
                title="Verification Status"
              >
                <BadgeCheck className="w-3.5 h-3.5 text-sky-300" />
                <span>Verification</span>
              </button>
              <span className="flex items-center gap-1.5 shrink-0">
                <span>History</span>
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
              </span>
            </div>

            {/* Verification Status & 30-Day Auto Countdown inside Blue Box */}
            {isVerifiedActive ? (
              <div className="flex-1 p-3 flex flex-col justify-between text-white bg-gradient-to-b from-[#2563eb] to-[#1d4ed8]">
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
                <div className="grid grid-cols-2 gap-2 my-1 bg-black/20 p-2 rounded-xl border border-white/10 text-left">
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
                <div className="bg-white/10 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-[11px] border border-white/15">
                  <div className="flex items-center gap-1 text-white font-medium truncate">
                    <span className="animate-pulse">⏳</span>
                    <span>Khatam hone me: <b className="text-amber-300 font-bold">{daysLeft} din {hoursLeft}h {minutesLeft}m {secondsLeft}s</b> bache</span>
                  </div>
                  <span className="text-[9px] text-blue-200 shrink-0 font-medium">1 Mahine me auto-expire</span>
                </div>
              </div>
            ) : (
              <div className="flex-1 p-3 flex flex-col justify-between text-white bg-gradient-to-b from-[#2563eb] to-[#1d4ed8]">
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

                <div className="bg-black/20 p-2 rounded-xl border border-white/10 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-blue-100 truncate text-left">
                    <span className="font-semibold text-white">Tick Validity:</span> 1 Mahina (30 Din Auto-Countdown)
                  </div>
                  <button
                    type="button"
                    onClick={() => setSection('verification')}
                    className="px-3 py-1 bg-white text-[#2563eb] rounded-lg text-xs font-bold shadow hover:bg-blue-50 active:scale-95 transition-all shrink-0 flex items-center gap-1 cursor-pointer"
                  >
                    <BadgeCheck className="w-3.5 h-3.5" />
                    <span>{verificationRequest?.status === 'pending' ? 'View Status' : isExpired ? 'Renew Tick' : 'Request Tick'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Menu items */}
        {[
          { icon: BadgeCheck, label: 'Request Verification', desc: profile?.is_verified ? 'Already verified ✓' : 'Get the blue badge', onClick: () => setSection('verification'), danger: false },
          { icon: AtSign, label: 'Account Center', desc: 'Email aur phone number add/manage karein', onClick: () => navigate('/settings/account-center'), danger: false },
          { icon: Globe, label: 'Language', desc: 'App ki bhasha chunein / Select your language', onClick: () => navigate('/settings/language'), danger: false },
          { icon: HelpCircle, label: 'Help Center', desc: 'FAQs and support', onClick: () => setSection('help'), danger: false },
          { icon: Flag, label: 'Report a Problem', desc: "Let us know what's wrong", onClick: () => setSection('report'), danger: false },
          {
            customIcon: <InstagramIcon size={26} />,
            label: 'Owner contact',
            desc: 'Click on join pixelgram owner connect',
            href: 'https://www.instagram.com/akash_raaj_89?stkn=MXR3NTNhaTB2Mm15cg==',
            badge: 'Instagram',
            danger: false,
          },
          { icon: Shield, label: 'Privacy', desc: 'Manage your privacy settings', onClick: () => navigate('/edit-profile'), danger: false },
        ].map((item: any) => {
          if (item.href) {
            return (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-3 px-4 py-3.5 glass-card rounded-xl hover:bg-muted/60 transition-colors group cursor-pointer border border-pink-500/20"
              >
                {item.customIcon}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-pink-500/15 via-rose-500/15 to-amber-500/15 text-pink-600 dark:text-pink-400 border border-pink-500/20">
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </a>
            );
          }
          const { icon: Icon, label, desc, onClick, danger } = item;
          return (
            <button key={label} onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 glass-card rounded-xl hover:bg-muted/60 transition-colors">
              <Icon className={`w-5 h-5 shrink-0 ${danger ? 'text-destructive' : 'text-primary'}`} />
              <div className="flex-1 min-w-0 text-left">
                <p className={`text-sm font-medium ${danger ? 'text-destructive' : 'text-foreground'}`}>{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          );
        })}

        {/* Admin Panel — only visible for admin users */}
        {profile?.is_admin && (
          <button
            onClick={() => navigate('/admin')}
            className="w-full flex items-center gap-3 px-4 py-3.5 glass-card rounded-xl hover:bg-primary/10 transition-colors border border-primary/40"
          >
            <LayoutDashboard className="w-5 h-5 shrink-0 text-primary" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-primary">Admin Panel</p>
              <p className="text-xs text-muted-foreground">Manage the platform</p>
            </div>
            <ChevronRight className="w-4 h-4 text-primary shrink-0" />
          </button>
        )}

        {/* Logout */}
        <button onClick={signOut} className="w-full flex items-center gap-3 px-4 py-3.5 glass-card rounded-xl hover:bg-muted/60 transition-colors">
          <LogOut className="w-5 h-5 shrink-0 text-destructive" />
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-destructive">Sign Out</p>
          </div>
        </button>

        {/* Delete account */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="w-full flex items-center gap-3 px-4 py-3.5 glass-card rounded-xl hover:bg-destructive/5 transition-colors">
              <Trash2 className="w-5 h-5 shrink-0 text-destructive" />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-destructive">Delete Account</p>
                <p className="text-xs text-muted-foreground">This action is permanent</p>
              </div>
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
      <FacebookSwitchAccountModal
        isOpen={showSwitchModal}
        onClose={() => setShowSwitchModal(false)}
      />
    </MobileLayout>
  );
};

export default SettingsPage;
