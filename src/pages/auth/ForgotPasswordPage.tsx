import { CountryPhoneInput } from "@/components/common/CountryPhoneInput";
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, Loader2, Mail, MessageCircle, ShieldCheck, User as UserIcon, BadgeCheck, Lock, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  findAccounts,
sendResetOtp,
confirmPasswordReset,
type FoundAccount,
} from '@/services/passwordReset';
import { FuturisticOtpCard } from '@/components/auth/FuturisticOtpCard';

type Step = 'identify' | 'accounts' | 'method' | 'verify' | 'new_password';

const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('identify');
  const [identifier, setIdentifier] = useState('');
  const [identifyMode, setIdentifyMode] = useState<'username' | 'phone'>('username');
  const [loading, setLoading] = useState(false);

  // Accounts step
  const [accounts, setAccounts] = useState<FoundAccount[]>([]);
  const [account, setAccount] = useState<FoundAccount | null>(null);

  // Method step
  const [destinationId, setDestinationId] = useState('');
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email');

  // Verify step
  const [token, setToken] = useState('');
  const [masked, setMasked] = useState('');
  const [verifiedCode, setVerifiedCode] = useState('');

  // New Password step
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      toast.error('Email, mobile number ya username daalein');
      return;
    }
    setLoading(true);
    try {
      const list = await findAccounts(identifier.trim());
      if (!list.length) {
        toast.error('Is detail se koi account nahi mila');
        return;
      }
      if (list.length === 1) {
        setAccount(list[0]);
        if (list[0].destinations.length === 1) {
          await sendOtp(list[0].destinations[0].id, false, list[0]);
        } else {
          setStep('method');
        }
      } else {
        setAccounts(list);
        setStep('accounts');
      }
    } catch (err: any) {
      toast.error(err.message || 'Dhoondhne me dikkat aayi');
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async (destId: string, isResend = false, targetAcc = account) => {
    if (!targetAcc) return;
    setLoading(true);
    try {
      const res = await sendResetOtp(targetAcc.userId, destId);
      if (!res.found || !res.token) {
        toast.error('Code nahi bheja ja saka');
        return;
      }
      setToken(res.token);
      setMasked(res.masked || '');
      setChannel(res.channel || 'email');
      setDestinationId(destId);
      setStep('verify');
      if (isResend) {
        toast.success('Naya code bhej diya gaya hai');
      } else {
        toast.success(`${res.masked} par 6-digit code bhej diya`);
      }
    } catch (err: any) {
      toast.error(err.message || 'OTP bhejne me dikkat aayi');
    } finally {
      setLoading(false);
    }
  };

  // Called by FuturisticOtpCard upon typing 6 digits
  const handleVerifyOtp = async (enteredCode: string): Promise<boolean> => {
    if (!token) throw new Error('Token miss ho gaya hai');
    setVerifiedCode(enteredCode);
    setTimeout(() => {
      setStep('new_password');
    }, 1600);
    return true;
  };

  // Final password submission
  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password kam se kam 6 characters ka hona chahiye');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Dono password match nahi ho rahe');
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(token, verifiedCode, password);
      toast.success('Password successfully badal gaya! Ab naye password se login karein.');
      navigate('/login');
    } catch (err: any) {
      toast.error(err.message || 'Password update nahi ho saka');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (step === 'new_password') setStep('verify');
    else if (step === 'verify') setStep('method');
    else if (step === 'method') setStep(accounts.length > 1 ? 'accounts' : 'identify');
    else if (step === 'accounts') setStep('identify');
    else navigate('/login');
  };

  const AccountRow = ({ item, onClick }: { item: FoundAccount; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/60 transition-colors text-left"
    >
      {item.avatarUrl ? (
        <img src={item.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center shrink-0">
          <UserIcon className="w-6 h-6 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-foreground truncate">{item.fullName}</span>
          {item.isVerified && <BadgeCheck className="w-4 h-4 text-primary shrink-0" />}
        </div>
        {item.username && <p className="text-sm text-muted-foreground truncate">@{item.username}</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      {/* VERIFY STEP USES THE FUTURISTIC OTP CARD */}
      {step === 'verify' ? (
        <FuturisticOtpCard
          title={channel === 'whatsapp' ? 'Check Your WhatsApp' : 'Check Your Email Now'}
          subtitle={channel === 'whatsapp' ? 'Enter the OTP sent to your WhatsApp.' : 'Enter the OTP sent to your email.'}
          target={masked}
          type={channel === 'whatsapp' ? 'phone' : 'email'}
          onVerify={handleVerifyOtp}
          onResend={() => sendOtp(destinationId, true)}
          onBack={goBack}
          successTitle="Identity Verified!"
          successSubtitle="Credentials confirmed. Now choose your new password..."
        />
      ) : (
        <div className="w-full max-w-sm px-6 py-8 space-y-6">
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {step === 'identify' ? 'Back to Login' : 'Back'}
          </button>

          <div className="text-center space-y-1.5">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
              {step === 'new_password' ? <KeyRound className="w-6 h-6 text-primary" /> : <ShieldCheck className="w-6 h-6 text-primary" />}
            </div>
            <h1 className="text-xl font-bold text-foreground">
              {step === 'identify' && 'Apna account dhoondein'}
              {step === 'accounts' && 'Ye rahe aapke accounts'}
              {step === 'method' && 'Code kahan bhejein?'}
              {step === 'new_password' && 'Naya password banayein'}
            </h1>
            <p className="text-sm text-muted-foreground text-pretty">
              {step === 'identify' && 'Apna email, phone number ya username daalein'}
              {step === 'accounts' && 'Jis account me jaana hai use chunein'}
              {step === 'method' && 'Aapke account se jude email aur WhatsApp number'}
              {step === 'new_password' && 'Apne account ke liye ek mazboot naya password chunein'}
            </p>
          </div>

          {step === 'identify' && (
            <form onSubmit={search} className="space-y-4">
              <div className="flex rounded-xl bg-muted/60 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => { setIdentifyMode('username'); setIdentifier(''); }}
                  className={`flex-1 py-2 rounded-lg transition-all ${
                    identifyMode === 'username' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Email / Username
                </button>
                <button
                  type="button"
                  onClick={() => { setIdentifyMode('phone'); setIdentifier(''); }}
                  className={`flex-1 py-2 rounded-lg transition-all ${
                    identifyMode === 'phone' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Mobile Number
                </button>
              </div>

              {identifyMode === 'phone' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="identifier-phone">Mobile number</Label>
                  <CountryPhoneInput
                    id="identifier-phone"
                    value={identifier}
                    onChange={(val) => setIdentifier(val)}
                    placeholder="Mobile number daalein"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="identifier">Email ya username</Label>
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    placeholder="you@example.com / username"
                    className="h-11"
                    autoFocus
                  />
                </div>
              )}

              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
              </Button>
            </form>
          )}

          {step === 'accounts' && (
            <div className="space-y-2">
              {accounts.map(item => (
                <AccountRow
                  key={item.userId}
                  item={item}
                  onClick={() => { setAccount(item); setStep('method'); }}
                />
              ))}
            </div>
          )}

          {step === 'method' && account && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border p-3">
                <AccountRow item={account} onClick={() => setStep(accounts.length > 1 ? 'accounts' : 'identify')} />
              </div>
              {account.destinations.map(dest => (
                <button
                  key={dest.id}
                  type="button"
                  disabled={loading}
                  onClick={() => void sendOtp(dest.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/60 transition-colors text-left disabled:opacity-60"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    {dest.type === 'whatsapp'
                      ? <MessageCircle className="w-5 h-5 text-primary" />
                      : <Mail className="w-5 h-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm">
                      {dest.type === 'whatsapp' ? 'WhatsApp par code bhejein' : 'Email par code bhejein'}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">{dest.masked}</p>
                  </div>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </button>
              ))}
            </div>
          )}

          {step === 'new_password' && (
            <form onSubmit={handleSaveNewPassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-pass">Naya password</Label>
                <div className="relative">
                  <Input
                    id="new-pass"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Kam se kam 6 characters"
                    className="h-11 pr-10"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pass">Password dobara</Label>
                <Input
                  id="confirm-pass"
                  type={showPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Wahi password dobara"
                  className="h-11"
                />
              </div>
              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set New Password'}
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Yaad aa gaya? <Link to="/login" className="text-primary font-semibold">Log in</Link>
          </p>
        </div>
      )}
    </div>
  );
};

export default ForgotPasswordPage;
