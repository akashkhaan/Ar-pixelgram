import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Laptop, Loader2, MapPin, Monitor, Smartphone, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { getDeviceId } from '@/services/accessToken';
import { describeDevice, formatFull, listSessions, logoutSessions, resolvePhoneNames, type LoginSession } from '@/services/loginSessions';

const KindIcon = ({ kind }: { kind: string }) => {
  const cls = 'h-6 w-6 text-foreground';
  if (kind === 'phone') return <Smartphone className={cls} />;
  if (kind === 'tablet') return <Tablet className={cls} />;
  if (kind === 'laptop') return <Laptop className={cls} />;
  return <Monitor className={cls} />;
};

const LoginSessionsSection: React.FC = () => {
  const { user, signOut } = useAuth();
  const myId = getDeviceId();
  const [items, setItems] = useState<LoginSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const list = await listSessions(user.id);
      setItems(list);
      const models = list.map(s => describeDevice(s.user_agent ?? '', s.platform, s.device_name).model).filter(Boolean);
      if (models.length) void resolvePhoneNames(models).then(setNames);
    }
    catch { toast.error('Login activity load nahi ho paayi'); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const toggle = (id: string) =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const allSelected = items.length > 0 && selected.length === items.length;

  const doLogout = async (ids: string[]) => {
    if (!user || !ids.length) return;
    if (!window.confirm(`${ids.length} device se log out karna hai?`)) return;
    setBusy(true);
    try {
      await logoutSessions(user.id, ids);
      toast.success('Selected devices se log out ho gaya');
      setSelected([]);
      if (ids.includes(myId)) { await signOut(); return; }
      await load();
    } catch {
      toast.error('Log out nahi ho paaya');
    } finally { setBusy(false); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 px-4 pt-5 pb-10">
      <div>
        <h2 className="text-xl font-bold text-foreground">Where you're logged in</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Aapka account {items.length} device par khula hai. Jis device ko nahi pehchante, use select karke log out karein.
        </p>
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-between">
          <button type="button" className="text-sm font-semibold text-primary" onClick={() => setSelected(allSelected ? [] : items.map(i => i.device_id))}>
            {allSelected ? 'Unselect all' : 'Select all'}
          </button>
          <span className="text-xs text-muted-foreground">{selected.length} selected</span>
        </div>
      )}

      <div className="space-y-3">
        {items.map(s => {
          const d = describeDevice(s.user_agent ?? '', s.platform, s.device_name);
          const phoneName = d.model ? (names[d.model] || d.model) : d.title;
          const loc = [s.city, s.region, s.country].filter(Boolean).join(', ') || 'Location pata nahi';
          const isMe = s.device_id === myId;
          const checked = selected.includes(s.device_id);
          return (
            <label key={s.device_id} className={`flex gap-3 rounded-lg border bg-card p-3 ${checked ? 'border-primary' : 'border-border'}`}>
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={checked} onChange={() => toggle(s.device_id)} />
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted"><KindIcon kind={d.kind} /></div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-semibold text-foreground">
                  {phoneName} {isMe && <span className="ml-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">This device</span>}
                </p>
                {d.model && phoneName !== d.model && <p className="text-xs text-muted-foreground">Model {d.model}</p>}
                <p className="text-xs text-muted-foreground">{d.kindLabel} · {d.os} · {d.via}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{loc}{s.ip ? ` · IP ${s.ip}` : ''}</p>
                <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Login:</span> {formatFull(s.logged_in_at ?? s.first_seen_at)}</p>
                <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Last active:</span> {isMe ? 'Abhi active' : formatFull(s.last_seen_at)}</p>
              </div>
            </label>
          );
        })}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Koi device nahi mila.</p>}
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          <Button className="w-full" variant="destructive" disabled={busy || !selected.length} onClick={() => doLogout(selected)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Log out selected (${selected.length})`}
          </Button>
          <Button className="w-full" variant="outline" disabled={busy} onClick={() => doLogout(items.map(i => i.device_id))}>
            Log out from all devices
          </Button>
        </div>
      )}
    </div>
  );
};

export default LoginSessionsSection;
