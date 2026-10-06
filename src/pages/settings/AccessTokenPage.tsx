import React, { useEffect, useState } from 'react';
import { ArrowLeft, Copy, KeyRound, Loader2, LogOut, Monitor, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import MobileLayout from '@/components/layouts/MobileLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import useGoBack from '@/hooks/use-go-back';
import {
  confirmAccessToken, getDeviceId, listDevices, logoutDevices, registerDevice, startAccessToken, type DeviceInfo,
} from '@/services/accessToken';

const ERR: Record<string, string> = {
  invalid_credentials: 'Email ya password galat hai',
  location_mismatch: 'Aapki location account ke desh se match nahi karti',
  multiple_devices: 'Token pehle se dusre device par active hai. Pehle us device ko logout karein.',
  invalid_otp: 'OTP galat hai',
  otp_expired: 'OTP expire ho gaya, dobara try karein',
  too_many_attempts: 'Bahut zyada galat try, naya OTP mangaayein',
  email_failed: 'OTP email nahi gaya, dobara try karein',
};
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString() : '—');

const AccessTokenPage: React.FC = () => {
  const goBack = useGoBack();
  const { user } = useAuth() as any;
  const myId = getDeviceId();
  const [step, setStep] = useState<'creds' | 'otp' | 'token'>('creds');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [otpId, setOtpId] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [active, setActive] = useState<{ token_prefix: string; device_name: string | null; expires_at: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const load = async () => {
    try {
      await registerDevice();
      const r = await listDevices();
      setDevices(r.devices);
      setActive(r.activeToken);
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const showErr = (e: any) => toast.error(ERR[e?.message] ?? e?.message ?? 'Kuch galat hua');

  const onStart = async () => {
    setBusy(true);
    try { const r = await startAccessToken(email, password); setOtpId(r.otpId); setStep('otp'); toast.success('OTP email par bheja gaya'); }
    catch (e: any) { showErr(e); if (e?.data?.devices) setDevices(e.data.devices); }
    finally { setBusy(false); }
  };
  const onConfirm = async () => {
    setBusy(true);
    try { const r = await confirmAccessToken(otpId, code); setToken(r.token); setExpiresAt(r.expiresAt); setStep('token'); setPassword(''); load(); }
    catch (e) { showErr(e); } finally { setBusy(false); }
  };
  const others = devices.filter((d) => d.device_id !== myId);
  const allSelected = others.length > 0 && selected.length === others.length;
  const onLogout = async () => {
    if (!selected.length) return;
    setBusy(true);
    try { await logoutDevices(selected); toast.success('Selected devices logout ho gaye'); setSelected([]); load(); }
    catch (e) { showErr(e); } finally { setBusy(false); }
  };

  return (
    <MobileLayout>
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background px-4 py-3">
          <button onClick={goBack} aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <h1 className="text-lg font-semibold">Access Token</h1>
        </div>

        <div className="space-y-6 p-4">
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /><h2 className="font-semibold">Apna token</h2></div>
            {active && step !== 'token' && (
              <p className="text-sm text-muted-foreground">Active token: <span className="font-mono">{active.token_prefix}…</span> ({active.device_name}) — expire: {fmt(active.expires_at)}</p>
            )}
            {step === 'creds' && (
              <>
                <p className="text-sm text-muted-foreground">Token 30 din tak valid rahega. Email, password aur OTP se verify karein.</p>
                <div className="space-y-1"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="space-y-1"><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button className="w-full" disabled={busy || !email || !password} onClick={onStart}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}OTP bhejein</Button>
              </>
            )}
            {step === 'otp' && (
              <>
                <p className="text-sm text-muted-foreground">{email} par 6 digit OTP bheja gaya hai.</p>
                <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
                <Button className="w-full" disabled={busy || code.length !== 6} onClick={onConfirm}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify karein</Button>
                <Button variant="ghost" className="w-full" onClick={() => setStep('creds')}>Wapas</Button>
              </>
            )}
            {step === 'token' && (
              <>
                <p className="text-sm text-muted-foreground">Ye token sirf ek baar dikhega — abhi copy kar lein.</p>
                <div className="break-all rounded-md bg-muted p-3 font-mono text-sm">{token}</div>
                <p className="text-xs text-muted-foreground">Expire: {fmt(expiresAt)}</p>
                <Button className="w-full" onClick={() => { navigator.clipboard.writeText(token); toast.success('Copy ho gaya'); }}><Copy className="mr-2 h-4 w-4" />Copy</Button>
              </>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Aap kahan logged in hain</h2>
              {others.length > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : others.map((d) => d.device_id))} />
                  Select all
                </label>
              )}
            </div>
            {devices.length === 0 && <p className="text-sm text-muted-foreground">Koi device nahi mila.</p>}
            <ul className="divide-y divide-border">
              {devices.map((d) => {
                const mine = d.device_id === myId;
                const Icon = /Android|iOS/.test(d.device_name ?? '') ? Smartphone : Monitor;
                return (
                  <li key={d.device_id} className="flex items-center gap-3 py-3">
                    {!mine && (
                      <input type="checkbox" checked={selected.includes(d.device_id)}
                        onChange={() => setSelected((s) => s.includes(d.device_id) ? s.filter((x) => x !== d.device_id) : [...s, d.device_id])} />
                    )}
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.device_name ?? 'Unknown device'} {mine && <span className="text-xs text-primary">(Ye device)</span>}</p>
                      <p className="text-xs text-muted-foreground">{[d.city, d.country].filter(Boolean).join(', ') || 'Location unknown'} · {fmt(d.last_seen_at)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {others.length > 0 && (
              <Button variant="destructive" className="w-full" disabled={busy || !selected.length} onClick={onLogout}>
                <LogOut className="mr-2 h-4 w-4" />Selected devices logout ({selected.length})
              </Button>
            )}
          </section>
        </div>
      </div>
    </MobileLayout>
  );
};

export default AccessTokenPage;
