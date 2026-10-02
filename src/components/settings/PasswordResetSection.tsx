import React, { useState } from 'react';
import { KeyRound, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { startPasswordReset, confirmPasswordReset } from '@/services/passwordReset';
import { FuturisticOtpCard } from '@/components/auth/FuturisticOtpCard';

/**
 * Account Center → Password reset with FuturisticOtpCard
 */
const PasswordResetSection: React.FC = () => {
  const { user, profile } = useAuth();
  const [stage, setStage] = useState<'idle' | 'password_input' | 'verify'>('idle');
  const [token, setToken] = useState('');
  const [masked, setMasked] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);

  const accountEmail = user?.email || '';
  const identifier = accountEmail || profile?.username || '';

  const maskEmail = (email: string) => {
    const [name, domain] = email.split('@');
    if (!domain) return email;
    const visible = name.length <= 2 ? name[0] : `${name.slice(0, 1)}${'*'.repeat(Math.max(1, name.length - 2))}${name.slice(-1)}`;
    return `${visible}@${domain}`;
  };

  const handleStartReset = () => {
    if (password.length < 6) {
      toast.error('Password kam se kam 6 characters ka ho');
      return;
    }
    if (password !== confirm) {
      toast.error('Dono password same nahi hain');
      return;
    }
    sendCode();
  };

  const sendCode = async () => {
    if (!identifier) { toast.error('Account load nahi hua'); return; }
    setBusy(true);
    try {
      const res = await startPasswordReset(identifier);
      if (!res.found || !res.token) { toast.error('Account nahi mila'); return; }
      setToken(res.token);
      setMasked(res.masked ?? '');
      setStage('verify');
      toast.success('OTP email par bhej diya');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (codeEntered: string): Promise<boolean> => {
    if (codeEntered.trim().length < 6) {
      throw new Error('6-digit OTP daalein');
    }
    try {
      await confirmPasswordReset(token, codeEntered, password);
      toast.success('Password badal gaya ✅');
      setTimeout(() => {
        setStage('idle');
        setPassword('');
        setConfirm('');
      }, 1500);
      return true;
    } catch (e: any) {
      throw new Error(e?.message || 'Galat OTP code! Kripya sahi code daalein.');
    }
  };

  if (stage === 'verify') {
    return (
      <div className="flex items-center justify-center -mx-4 -my-2">
        <FuturisticOtpCard
          title="Check Your Email Now"
          subtitle="Enter the OTP sent to your email to change your password."
          target={masked}
          type="email"
          onVerify={handleVerifyOtp}
          onResend={sendCode}
          onBack={() => setStage('password_input')}
          successTitle="Password Changed Successfully!"
          successSubtitle="Your account credentials have been updated."
        />
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-primary" />
        <p className="font-semibold text-foreground">Password</p>
      </div>

      {stage === 'idle' ? (
        <>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Is account ka email</p>
            <p className="text-sm font-semibold text-foreground break-all">
              {accountEmail ? maskEmail(accountEmail) : 'Email add nahi hai'}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Isi email par 6-digit code bhejenge. Naya password set karne ke liye aage badhein.
          </p>
          <Button onClick={() => setStage('password_input')} disabled={!identifier} className="w-full h-10 font-semibold">
            Change password
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Naya password daalein, iske baad aapke email ({maskEmail(accountEmail)}) par 6-digit OTP verification code aayega:
          </p>
          <div className="relative">
            <Input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Naya password (min 6 characters)"
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
          <Input
            type={showPass ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Password dobara"
            className="h-11"
          />
          <div className="flex gap-2">
            <Button onClick={handleStartReset} disabled={busy} className="flex-1 h-10 font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Send OTP & Verify
            </Button>
            <Button variant="outline" onClick={() => setStage('idle')} disabled={busy} className="h-10">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PasswordResetSection;
