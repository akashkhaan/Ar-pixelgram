import FacebookSwitchAccountModal from '@/components/profile/FacebookSwitchAccountModal';
import { logInToAnotherAccount } from '@/lib/savedAccounts';
import InstagramIcon from "@/components/icons/InstagramIcon";
import { ArrowLeft, AtSign, BadgeCheck, Sparkles, ChevronDown, ChevronRight, Flag, UserPlus, Users, Globe, HelpCircle, KeyRound, LayoutDashboard, Loader2, LogOut, Moon, Shield, Sun, Trash2, Check, Plus } from 'lucide-react';
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

const P = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  video: '<rect x="3" y="4" width="18" height="16" rx="4"/><path d="M10 9l5 3-5 3z"/>',
  people: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5a6 6 0 0 1 11 0"/>',
  stories: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke-width="2.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chd: '<path d="M6 9l6 6 6-6"/>',
  chr: '<path d="M9 5l7 7-7 7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  shieldck: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3"/>',
  badge: '<path d="M12 2l2.4 1.7 2.9-.1 1 2.8 2.4 1.7-.9 2.8.9 2.8-2.4 1.7-1 2.8-2.9-.1L12 22l-2.4-1.7-2.9.1-1-2.8-2.4-1.7.9-2.8-.9-2.8 2.4-1.7 1-2.8 2.9.1z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'
};

const I = (name: keyof typeof P) => (
  <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: P[name] }} />
);

const LogoSvg = () => (
  <svg viewBox="0 0 120 120">
    <defs>
      <linearGradient id="l_grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FF3D7F" />
        <stop offset="0.55" stopColor="#FF8A00" />
        <stop offset="1" stopColor="#7C5CFF" />
      </linearGradient>
    </defs>
    <rect width="120" height="120" fill="#0B0616" />
    <text x="60" y="70" textAnchor="middle" fontSize="50" fontWeight="800" fill="url(#l_grad)" letterSpacing="-2" fontFamily="inherit">
      AR
    </text>
    <text x="60" y="92" textAnchor="middle" fontSize="9" letterSpacing="2" fontWeight="700" fill="#e9d5ff" fontFamily="inherit">
      PIXELGRAM
    </text>
  </svg>
);

const InstagramSvg = () => (
  <svg viewBox="0 0 48 48">
    <defs>
      <linearGradient id="ig_grad" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#FEDA75" />
        <stop offset="0.3" stopColor="#FA7E1E" />
        <stop offset="0.6" stopColor="#D62976" />
        <stop offset="1" stopColor="#4F5BD5" />
      </linearGradient>
    </defs>
    <rect width="48" height="48" fill="url(#ig_grad)" />
    <rect x="12" y="12" width="24" height="24" rx="7" fill="none" stroke="#fff" strokeWidth="3" />
    <circle cx="24" cy="24" r="6" fill="none" stroke="#fff" strokeWidth="3" />
    <circle cx="31.5" cy="16.5" r="1.8" fill="#fff" stroke="none" />
  </svg>
);

const SettingsPage: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const goBack = useGoBack("/profile");
  const handleBack = () => { if (section !== "main") setSection("main"); else goBack(); };
  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains('dark'));
  const [section, setSection] = useState<'main' | 'help' | 'report' | 'verification'>('main');
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [pfxOpen, setPfxOpen] = useState(false);
  const [swxOpen, setSwxOpen] = useState(false);
  const [verificationRequest, setVerificationRequest] = useState<VerificationRequest | null>(null);
  const [verifyReason, setVerifyReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) getMyVerificationRequest(user.id).then(setVerificationRequest);
  }, [user]);

  const toggleTheme = () => {
    const val = !darkMode;
    setDarkMode(val);
    if (val) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  };

  const handleDeleteAccount = async () => {
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
        <div className="p-4 page-transition setsm-wrap">
          <button onClick={() => setSection('main')} className="flex items-center gap-2 mb-5 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" /><span className="text-sm font-medium">Back</span>
          </button>
          <h2 className="text-xl font-bold text-foreground mb-5">Help Center</h2>
          <div className="space-y-4">
            {[
              { q: 'Blue tick kaise renew karein?', a: 'Settings mein Verification box ke Renew Tick button par tap karein. Renew hote hi 30 din ke liye tick active ho jata hai.' },
              { q: 'Account recover kaise karein?', a: 'Account Center mein apna email aur phone number add karke rakhein, taaki zarurat par recover kar sakein.' },
              { q: 'Token aur devices kaise manage karein?', a: 'Access Token mein sab logged-in devices dikhte hain. Kisi bhi device ko wahin se logout kar sakte hain.' },
              { q: 'Kisi ko report kaise karein?', a: 'Uske profile ya chat ke 3-dot menu mein Report user chunein.' },
            ].map(({ q, a }) => (
              <div key={q} className="setsm-card p-4 space-y-1">
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
        <div className="p-4 page-transition setsm-wrap">
          <button onClick={() => setSection('main')} className="flex items-center gap-2 mb-5 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" /><span className="text-sm font-medium">Back</span>
          </button>
          <h2 className="text-xl font-bold text-foreground mb-2">Verification Request</h2>
          <p className="text-sm text-muted-foreground mb-5 text-pretty">Get a blue checkmark to show your account is authentic.</p>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Why should your account be verified?</Label>
              <Textarea
                placeholder="Explain your public presence, notable work, or why verification is important for your account…"
                value={verifyReason}
                onChange={e => setVerifyReason(e.target.value)}
                rows={5}
                maxLength={500}
                className="resize-none in"
              />
            </div>
            <Button className="w-full h-11 font-semibold btn" onClick={handleSubmitVerification} disabled={loading || !verifyReason.trim()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BadgeCheck className="w-4 h-4 mr-2" />}
              Submit Request
            </Button>
          </div>
        </div>
      </MobileLayout>
    );
  }

  // Main settings: USER'S EXACT SETSM LAYOUT & CLASSES
  return (
    <MobileLayout>
      <div className="p-4 page-transition setsm-wrap space-y-3.5 pb-24">
        
        {/* Title Header */}
        <div className="flex items-center gap-3.5 py-3">
          <button
            type="button"
            onClick={handleBack}
            className="w-11 h-11 rounded-[15px] bg-[var(--card)] border border-[var(--line)] grid place-items-center cursor-pointer"
            aria-label="Back"
          >
            {I('back')}
          </button>
          <h1 className="text-[34px] font-[800] tracking-tight text-[var(--ink)]">Settings</h1>
        </div>

        {/* 1. Profile Card with Collapsible Details */}
        <div className="setsm-card">
          <div className="setsm-pfr">
            <button
              type="button"
              className="setsm-main"
              onClick={() => navigate('/profile')}
            >
              <span className="setsm-avt">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <LogoSvg />
                )}
              </span>
              <span className="setsm-tx">
                <b>{profile?.full_name || profile?.username || 'Ar pixelgram'}</b>
                <small>View your profile</small>
              </span>
            </button>
            <button
              type="button"
              className={`setsm-chv ${pfxOpen ? 'open' : ''}`}
              onClick={() => setPfxOpen(!pfxOpen)}
              aria-label="Expand profile"
            >
              {I('chd')}
            </button>
          </div>
          <div className={`setsm-acc ${pfxOpen ? 'open' : ''}`}>
            <div>
              <div className="setsm-chips">
                <span>@{profile?.username || 'ar_pixelgram'}</span>
                <span className="warn">Blue tick: Expired</span>
                <span>Account: <b>Public</b></span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Switch Account Card with Spinning Cyan-Emerald Ring */}
        <div className="setsm-card" style={{ borderColor: 'rgba(34,211,160,.35)' }}>
          <div className="setsm-pfr">
            <button
              type="button"
              className="setsm-main"
              onClick={() => setSwxOpen(!swxOpen)}
            >
              <span className="sw-ring">
                <span>{I('users')}</span>
              </span>
              <span className="setsm-tx">
                <b className="setsm-grt">Switch account</b>
                <small>Tap to switch or add another account</small>
              </span>
            </button>
            <button
              type="button"
              className={`setsm-chv ${swxOpen ? 'open' : ''}`}
              onClick={() => setSwxOpen(!swxOpen)}
              aria-label="Expand accounts"
            >
              {I('chd')}
            </button>
          </div>
          <div className={`setsm-acc ${swxOpen ? 'open' : ''}`}>
            <div>
              <div className="p-3 pt-0">
                <button
                  type="button"
                  onClick={() => setShowSwitchModal(true)}
                  className="w-full py-2.5 px-3 rounded-2xl bg-[var(--acc)]/10 text-[var(--acc)] font-bold text-sm flex items-center justify-center gap-2 border border-[var(--line)]"
                >
                  <Plus className="w-4 h-4" /> Open Switch Account Modal
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Dark Mode Toggle Card */}
        <button
          type="button"
          className="setsm-card setsm-row"
          onClick={toggleTheme}
        >
          <span className="setsm-ti">{I('sun')}</span>
          <span className="setsm-tx">
            <b>Dark Mode</b>
            <small>{darkMode ? 'Dark theme active' : 'Light theme active'}</small>
          </span>
          <span className={`setsm-tg ${darkMode ? 'on' : ''}`}>
            <i>
              <svg className="su" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: P.sun }} />
              <svg className="mo" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: P.moon }} />
            </i>
          </span>
        </button>

        {/* 4. Verification Box – User's Exact Design */}
        <div className="vb">
          <div className="vi">
            <div className="vh">
              <span>Pixelgram</span>
              <span>{profile?.username || 'ar_pixelgram'}</span>
              <span className="chk">{I('badge')}Verification</span>
              <span className="vav">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <LogoSvg />
                )}
              </span>
            </div>
            <div className="vbody">
              <span className="vic">{I('shieldck')}</span>
              <div className="vt">
                <b>⚠️ Blue Tick Expired (30 Din pure)</b>
                <p>Aapka 1 mahine ka blue tick khatam ho gaya hai. Dobara blue tick pane ke liye Renew Tick par tap karein.</p>
              </div>
            </div>
            <div className="vbar">
              <span><b>Tick Validity:</b> 1 Mahina (30 Din pure)</span>
              <button
                type="button"
                className="renew"
                onClick={() => setSection('verification')}
              >
                {I('badge')} Renew Tick
              </button>
            </div>
          </div>
        </div>

        {/* 5. Account Center */}
        <button
          type="button"
          className="setsm-card setsm-row"
          onClick={() => navigate('/settings/account-center')}
        >
          <span className="setsm-ti">{I('at')}</span>
          <span className="setsm-tx">
            <b>Account Center</b>
            <small>Email aur phone number add/manage karein</small>
          </span>
          <span className="setsm-cv">{I('chr')}</span>
        </button>

        {/* 6. Language */}
        <button
          type="button"
          className="setsm-card setsm-row"
          onClick={() => navigate('/settings/language')}
        >
          <span className="setsm-ti">{I('globe')}</span>
          <span className="setsm-tx">
            <b>Language</b>
            <small>App ki bhasha chunein / Select your language</small>
          </span>
          <span className="setsm-cv">{I('chr')}</span>
        </button>

        {/* 7. Access Token */}
        <button
          type="button"
          className="setsm-card setsm-row"
          onClick={() => navigate('/settings/access-token')}
        >
          <span className="setsm-ti">{I('key')}</span>
          <span className="setsm-tx">
            <b>Access Token</b>
            <small>30 din ka token, devices aur logout manage karein</small>
          </span>
          <span className="setsm-cv">{I('chr')}</span>
        </button>

        {/* 8. Help Center */}
        <button
          type="button"
          className="setsm-card setsm-row"
          onClick={() => setSection('help')}
        >
          <span className="setsm-ti">{I('help')}</span>
          <span className="setsm-tx">
            <b>Help Center</b>
            <small>FAQs and support</small>
          </span>
          <span className="setsm-cv">{I('chr')}</span>
        </button>

        {/* 9. Report a Problem */}
        <button
          type="button"
          className="setsm-card setsm-row"
          onClick={() => setSection('report')}
        >
          <span className="setsm-ti">{I('flag')}</span>
          <span className="setsm-tx">
            <b>Report a Problem</b>
            <small>Let us know what's wrong</small>
          </span>
          <span className="setsm-cv">{I('chr')}</span>
        </button>

        {/* 10. Owner contact */}
        <a
          className="setsm-card setsm-row setsm-own"
          href="https://www.instagram.com/akash_raaj_89?stkn=MXR3NTNhaTB2Mm15cg=="
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="w-[52px] h-[52px] rounded-[16px] overflow-hidden shrink-0 shadow-md">
            <InstagramSvg />
          </span>
          <span className="setsm-tx">
            <b>
              Owner contact
              <span className="setsm-pill">Instagram</span>
            </b>
            <small>Click on join pixelgram owner connect</small>
          </span>
          <span className="setsm-cv">{I('chr')}</span>
        </a>

        {/* 11. Privacy */}
        <button
          type="button"
          className="setsm-card setsm-row"
          onClick={() => navigate('/edit-profile')}
        >
          <span className="setsm-ti">{I('shield')}</span>
          <span className="setsm-tx">
            <b>Privacy</b>
            <small>Manage your privacy settings</small>
          </span>
          <span className="setsm-cv">{I('chr')}</span>
        </button>

        {/* 12. Sign Out */}
        <button
          type="button"
          className="setsm-card setsm-row setsm-dg"
          onClick={signOut}
        >
          <span className="setsm-ti">{I('logout')}</span>
          <span className="setsm-tx">
            <b>Sign Out</b>
          </span>
        </button>

        {/* 13. Delete Account */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="setsm-card setsm-row setsm-dg"
            >
              <span className="setsm-ti">{I('trash')}</span>
              <span className="setsm-tx">
                <b>Delete Account</b>
                <small>This action is permanent</small>
              </span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Account?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your account, posts, and all data. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-2xl">
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
