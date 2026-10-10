import FacebookSwitchAccountModal from '@/components/profile/FacebookSwitchAccountModal';
import { ArrowLeft, BadgeCheck, Loader2 } from 'lucide-react';
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
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2, width: '24px', height: '24px', display: 'block' }}
    dangerouslySetInnerHTML={{ __html: P[name] }}
  />
);

const LogoSvg = () => (
  <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%', display: 'block' }}>
    <defs>
      <linearGradient id="l_grad_p" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FF3D7F" />
        <stop offset="0.55" stopColor="#FF8A00" />
        <stop offset="1" stopColor="#7C5CFF" />
      </linearGradient>
    </defs>
    <rect width="120" height="120" fill="#0B0616" />
    <text x="60" y="70" textAnchor="middle" fontSize="50" fontWeight="800" fill="url(#l_grad_p)" letterSpacing="-2" fontFamily="inherit">
      AR
    </text>
    <text x="60" y="92" textAnchor="middle" fontSize="9" letterSpacing="2" fontWeight="700" fill="#e9d5ff" fontFamily="inherit">
      PIXELGRAM
    </text>
  </svg>
);

const InstagramSvg = () => (
  <svg viewBox="0 0 48 48" style={{ width: '100%', height: '100%', display: 'block' }}>
    <defs>
      <linearGradient id="ig_grad_p" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#FEDA75" />
        <stop offset="0.3" stopColor="#FA7E1E" />
        <stop offset="0.6" stopColor="#D62976" />
        <stop offset="1" stopColor="#4F5BD5" />
      </linearGradient>
    </defs>
    <rect width="48" height="48" fill="url(#ig_grad_p)" />
    <rect x="12" y="12" width="24" height="24" rx="7" fill="none" stroke="#fff" strokeWidth="3" />
    <circle cx="24" cy="24" r="6" fill="none" stroke="#fff" strokeWidth="3" />
    <circle cx="31.5" cy="16.5" r="1.8" fill="#fff" stroke="none" />
  </svg>
);

const CSS_STYLES = `
:root {
  --bg: #F6F5FC;
  --card: rgba(255, 255, 255, 0.85);
  --solid: #fff;
  --ink: #15112B;
  --mute: #6A6685;
  --line: rgba(124, 77, 255, 0.13);
  --acc: #7C4DFF;
  --acc2: #FF3D9A;
  --red: #E5384F;
  --shc: rgba(80, 50, 160, 0.08);
  --sh: 0 10px 30px var(--shc);
  --b1: #c4b5fd;
  --b2: #fbcfe8;
  --b3: #a5f3fc;
}

[data-theme="dark"], .dark {
  --bg: #0E0820;
  --card: rgba(255, 255, 255, 0.06);
  --solid: #1A1233;
  --ink: #F7F3FF;
  --mute: #A99FD2;
  --line: rgba(255, 255, 255, 0.1);
  --acc: #A78BFA;
  --red: #FF6B81;
  --shc: rgba(0, 0, 0, 0.34);
  --b1: #5b21b6;
  --b2: #9d174d;
  --b3: #155e75;
}

.setsm-container {
  max-width: 560px;
  margin: 0 auto;
  padding: 12px 16px 120px;
  font-family: 'Bricolage Grotesque', system-ui, sans-serif;
  color: var(--ink);
}

.setsm-container .ttl {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 4px 18px;
}

.setsm-container .back {
  width: 44px;
  height: 44px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  background: var(--card);
  border: 1px solid var(--line);
  cursor: pointer;
  color: var(--ink);
}

.setsm-container h1 {
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--ink);
  margin: 0;
}

.setsm-container .card {
  position: relative;
  display: block;
  width: 100%;
  margin-bottom: 14px;
  border-radius: 26px;
  background: var(--card);
  border: 1px solid var(--line);
  box-shadow: var(--sh);
  overflow: hidden;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.setsm-container .pfr {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 16px 16px 16px 18px;
}

.setsm-container .pfr .main {
  display: flex;
  align-items: center;
  gap: 15px;
  flex: 1;
  min-width: 0;
  background: none;
  border: 0;
  cursor: pointer;
  text-align: left;
}

.setsm-container .avt {
  flex: none;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 0 0 3px var(--solid), 0 0 0 5px color-mix(in srgb, var(--acc2) 60%, transparent);
  position: relative;
}

.setsm-container .avt img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.setsm-container .chv {
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--acc) 10%, var(--solid));
  color: var(--mute);
  cursor: pointer;
  border: 0;
  transition: transform 0.3s;
}

.setsm-container .chv.open {
  transform: rotate(180deg);
  background: var(--acc);
  color: #fff;
}

.setsm-container .chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 18px 18px;
}

.setsm-container .chips span {
  padding: 8px 14px;
  border-radius: 99px;
  font-size: 14px;
  font-weight: 600;
  background: color-mix(in srgb, var(--acc) 11%, transparent);
  color: var(--acc);
}

.setsm-container .chips span.warn {
  background: rgba(250, 204, 21, 0.18);
  color: #B45309;
}

.setsm-container .row {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 17px 18px;
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  cursor: pointer;
}

.setsm-container .ti {
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  color: var(--acc);
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, color-mix(in srgb, var(--acc) 18%, transparent), color-mix(in srgb, var(--acc2) 12%, transparent));
}

.setsm-container .ti svg {
  width: 24px;
  height: 24px;
}

.setsm-container .tx {
  flex: 1;
  min-width: 0;
}

.setsm-container .tx b {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
}

.setsm-container .tx small {
  display: block;
  color: var(--mute);
  font-size: 15px;
  margin-top: 2px;
}

.setsm-container .cv {
  flex: none;
  color: var(--mute);
}

.setsm-container .cv svg {
  width: 20px;
  height: 20px;
}

.setsm-container .dg .ti {
  color: var(--red);
  background: color-mix(in srgb, var(--red) 14%, transparent);
}

.setsm-container .dg .tx b {
  color: var(--red);
}

.setsm-container .sw-ring {
  flex: none;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  padding: 3px;
  background: conic-gradient(#22D3EE, #34D399, #22D3EE);
  display: grid;
  place-items: center;
}

.setsm-container .sw-ring > span {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--solid);
  color: #14A38B;
}

.setsm-container .grt {
  background: linear-gradient(90deg, #10D98C, #22D3EE);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.setsm-container .tg {
  flex: none;
  width: 60px;
  height: 34px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--mute) 35%, transparent);
  position: relative;
}

.setsm-container .tg i {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #fff;
  display: grid;
  place-items: center;
  color: #F59E0B;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25);
  transition: transform 0.26s cubic-bezier(0.3, 1.3, 0.5, 1);
}

.setsm-container .tg.on {
  background: linear-gradient(135deg, #7C4DFF, #FF3D9A);
}

.setsm-container .tg.on i {
  transform: translateX(26px);
  color: #7C4DFF;
}

.setsm-container .vb {
  position: relative;
  margin: 20px 0 16px;
  border-radius: 24px;
  padding: 4px;
  background: conic-gradient(from 210deg, #8B5CF6, #22D3EE, #34D399, #FACC15, #FB7185, #C084FC, #8B5CF6);
  box-shadow: -6px -4px 28px rgba(34, 211, 238, 0.4), 8px 8px 34px rgba(251, 113, 133, 0.4);
}

.setsm-container .vi {
  border-radius: 20px;
  overflow: hidden;
  background: linear-gradient(135deg, #1488c8 0%, #18a99a 55%, #2fbf71 100%);
  color: #fff;
}

.setsm-container .vh {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  background: rgba(7, 66, 110, 0.62);
  font-weight: 700;
  font-size: 12px;
  white-space: nowrap;
}

.setsm-container .vbody {
  padding: 16px 14px 0 12px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.setsm-container .vic {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.35);
  display: grid;
  place-items: center;
}

.setsm-container .vt {
  min-width: 0;
  flex: 1;
}

.setsm-container .vt b {
  display: block;
  font-size: 13px;
  line-height: 1.3;
  color: #fff;
}

.setsm-container .vt p {
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.3;
  opacity: 0.9;
  color: #fff;
}

.setsm-container .vbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 40px 14px 13px 12px;
  padding: 8px 8px 8px 14px;
  border-radius: 16px;
  background: rgba(5, 70, 80, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 11px;
}

.setsm-container .renew {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 99px;
  background: #fff;
  color: #14121f;
  font-weight: 800;
  font-size: 12.5px;
  cursor: pointer;
  border: 0;
}

.setsm-container .renew svg {
  color: #f43f5e;
  width: 12px;
  height: 12px;
}

.setsm-container .ig {
  flex: none;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  overflow: hidden;
}

.setsm-container .own {
  border-color: rgba(214, 41, 118, 0.35);
  background: linear-gradient(135deg, rgba(254, 218, 117, 0.16), rgba(214, 41, 118, 0.1), rgba(79, 91, 213, 0.1));
}

.setsm-container .pill {
  display: inline-block;
  margin-left: 8px;
  padding: 3px 12px;
  border-radius: 99px;
  font-size: 14px;
  font-weight: 700;
  color: #D62976;
  background: rgba(214, 41, 118, 0.14);
  border: 1px solid rgba(214, 41, 118, 0.3);
}
`;

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
      <MobileLayout hideNav hideHeader>
        <style dangerouslySetInnerHTML={{ __html: CSS_STYLES }} />
        <div className="setsm-container">
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
              <div key={q} className="card p-4 space-y-1">
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
      <MobileLayout hideNav hideHeader>
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
      <MobileLayout hideNav hideHeader>
        <style dangerouslySetInnerHTML={{ __html: CSS_STYLES }} />
        <div className="setsm-container">
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
                className="resize-none"
              />
            </div>
            <Button className="w-full h-11 font-semibold" onClick={handleSubmitVerification} disabled={loading || !verifyReason.trim()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BadgeCheck className="w-4 h-4 mr-2" />}
              Submit Request
            </Button>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout hideHeader>
      <style dangerouslySetInnerHTML={{ __html: CSS_STYLES }} />
      <div className="setsm-container">
        
        {/* Title Header */}
        <div className="ttl">
          <button
            type="button"
            className="back"
            onClick={handleBack}
            aria-label="Back"
          >
            {I('back')}
          </button>
          <h1>Settings</h1>
        </div>

        {/* 1. Profile Card */}
        <div className="card">
          <div className="pfr">
            <button
              type="button"
              className="main"
              onClick={() => navigate('/profile')}
            >
              <span className="avt" style={{ width: 62, height: 62, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <LogoSvg />
                )}
              </span>
              <span className="tx">
                <b>{profile?.full_name || profile?.username || 'Ar pixelgram'}</b>
                <small>View your profile</small>
              </span>
            </button>
            <button
              type="button"
              className={`chv ${pfxOpen ? 'open' : ''}`}
              onClick={() => setPfxOpen(!pfxOpen)}
              aria-label="Expand profile"
            >
              {I('chd')}
            </button>
          </div>
          {pfxOpen && (
            <div className="chips">
              <span>@{profile?.username || 'ar_pixelgram'}</span>
              <span className="warn">Blue tick: Expired</span>
              <span>Account: <b>Public</b></span>
            </div>
          )}
        </div>

        {/* 2. Switch Account Card */}
        <div className="card" style={{ borderColor: 'rgba(34,211,160,.35)' }}>
          <div className="pfr">
            <button
              type="button"
              className="main"
              onClick={() => setShowSwitchModal(true)}
            >
              <span className="sw-ring" style={{ width: 62, height: 62, borderRadius: '50%', flexShrink: 0 }}>
                <span>{I('users')}</span>
              </span>
              <span className="tx">
                <b className="grt">Switch account</b>
                <small>Tap to switch or add another account</small>
              </span>
            </button>
            <button
              type="button"
              className="chv"
              onClick={() => setShowSwitchModal(true)}
              aria-label="Switch account"
            >
              {I('chd')}
            </button>
          </div>
        </div>

        {/* 3. Dark Mode Toggle */}
        <button
          type="button"
          className="card row"
          onClick={toggleTheme}
        >
          <span className="ti">{I('sun')}</span>
          <span className="tx">
            <b>Dark Mode</b>
            <small>{darkMode ? 'Dark theme active' : 'Light theme active'}</small>
          </span>
          <span className={`tg ${darkMode ? 'on' : ''}`}>
            <i>{darkMode ? I('moon') : I('sun')}</i>
          </span>
        </button>

        {/* 4. Verification Box */}
        <div className="vb">
          <div className="vi">
            <div className="vh">
              <span>Pixelgram</span>
              <span>{profile?.username || 'ar_pixelgram'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {I('badge')} Verification
              </span>
              <span style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: '50%', overflow: 'hidden' }}>
                <LogoSvg />
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
          className="card row"
          onClick={() => navigate('/settings/account-center')}
        >
          <span className="ti">{I('at')}</span>
          <span className="tx">
            <b>Account Center</b>
            <small>Email aur phone number add/manage karein</small>
          </span>
          <span className="cv">{I('chr')}</span>
        </button>

        {/* 6. Language */}
        <button
          type="button"
          className="card row"
          onClick={() => navigate('/settings/language')}
        >
          <span className="ti">{I('globe')}</span>
          <span className="tx">
            <b>Language</b>
            <small>App ki bhasha chunein / Select your language</small>
          </span>
          <span className="cv">{I('chr')}</span>
        </button>

        {/* 7. Access Token */}
        <button
          type="button"
          className="card row"
          onClick={() => navigate('/settings/access-token')}
        >
          <span className="ti">{I('key')}</span>
          <span className="tx">
            <b>Access Token</b>
            <small>30 din ka token, devices aur logout manage karein</small>
          </span>
          <span className="cv">{I('chr')}</span>
        </button>

        {/* 8. Help Center */}
        <button
          type="button"
          className="card row"
          onClick={() => setSection('help')}
        >
          <span className="ti">{I('help')}</span>
          <span className="tx">
            <b>Help Center</b>
            <small>FAQs and support</small>
          </span>
          <span className="cv">{I('chr')}</span>
        </button>

        {/* 9. Report a Problem */}
        <button
          type="button"
          className="card row"
          onClick={() => setSection('report')}
        >
          <span className="ti">{I('flag')}</span>
          <span className="tx">
            <b>Report a Problem</b>
            <small>Let us know what's wrong</small>
          </span>
          <span className="cv">{I('chr')}</span>
        </button>

        {/* 10. Owner contact */}
        <a
          className="card row own"
          href="https://www.instagram.com/akash_raaj_89?stkn=MXR3NTNhaTB2Mm15cg=="
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="ig">
            <InstagramSvg />
          </span>
          <span className="tx">
            <b>
              Owner contact
              <span className="pill">Instagram</span>
            </b>
            <small>Click on join pixelgram owner connect</small>
          </span>
          <span className="cv">{I('chr')}</span>
        </a>

        {/* 11. Privacy */}
        <button
          type="button"
          className="card row"
          onClick={() => navigate('/edit-profile')}
        >
          <span className="ti">{I('shield')}</span>
          <span className="tx">
            <b>Privacy</b>
            <small>Manage your privacy settings</small>
          </span>
          <span className="cv">{I('chr')}</span>
        </button>

        {/* 12. Sign Out */}
        <button
          type="button"
          className="card row dg"
          onClick={signOut}
        >
          <span className="ti">{I('logout')}</span>
          <span className="tx">
            <b>Sign Out</b>
          </span>
        </button>

        {/* 13. Delete Account */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="card row dg"
            >
              <span className="ti">{I('trash')}</span>
              <span className="tx">
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
