import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/layouts/AdminLayout';
import { getOnlineUsers, subscribeOnlineUsers, ONLINE_WINDOW_SECONDS, type OnlineUser } from '@/services/presence';
import { Users, Wifi, MapPin, Smartphone, RefreshCw, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GlassSearch from '@/components/common/GlassSearch';
import { toast } from 'sonner';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

const agoText = (seconds: number) => {
  if (seconds < 10) return 'abhi';
  if (seconds < 60) return `${seconds}s pehle`;
  const m = Math.floor(seconds / 60);
  return `${m} min pehle`;
};

/**
 * Admin → Online Users
 * Jitne users abhi online hain (kisi bhi desh se) — photo + naam + "Online",
 * row par tap karte hi uska profile khul jaata hai.
 */
const AdminOnlineUsers: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date());
  const busy = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (busy.current) return;
    busy.current = true;
    if (!silent) setRefreshing(true);
    try {
      const list = await getOnlineUsers();
      setUsers(list);
      setUpdatedAt(new Date());
    } catch (err) {
      console.error('online users load failed', err);
      if (!silent) toast.error('Online users load nahi ho paye');
    } finally {
      busy.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // realtime + 20s polling (app band hone par bhi list fresh rahe)
    const unsubscribe = subscribeOnlineUsers(() => void load(true));
    return unsubscribe;
  }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return users;
    return users.filter(u =>
      [u.username, u.full_name, u.country, u.city, u.device, u.os]
        .some(v => (v || '').toLowerCase().includes(t)),
    );
  }, [users, q]);

  const stats = useMemo(() => {
    const countries = new Set(users.map(u => u.country).filter(Boolean));
    const devices = new Set(users.map(u => u.device).filter(Boolean));
    return { online: users.length, countries: countries.size, devices: devices.size };
  }, [users]);

  const cards = [
    { label: 'Online Now', value: stats.online, icon: Wifi, tone: 'text-emerald-600 bg-emerald-500/10' },
    { label: 'Countries', value: stats.countries, icon: MapPin, tone: 'text-sky-600 bg-sky-500/10' },
    { label: 'Devices', value: stats.devices, icon: Smartphone, tone: 'text-purple-600 bg-purple-500/10' },
    { label: 'Total Users', value: '—', icon: Users, tone: 'text-amber-600 bg-amber-500/10', hide: true },
  ].filter(c => !c.hide);

  const openProfile = (userId: string) => {
    navigate(`/profile/${userId}`);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-foreground">Online Users</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Jo bhi user abhi app/website par hai (kisi bhi desh se) — photo, naam aur "Online".
              Naam par tap karo to profile khul jayegi.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Live · {fmtTime(updatedAt.toISOString())}
            </span>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {cards.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4 shadow-card">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-semibold">
                <span className={`w-6 h-6 rounded-md flex items-center justify-center ${tone}`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                {label}
              </div>
              <p className="text-2xl font-bold text-foreground mt-2">{value}</p>
            </div>
          ))}
        </div>

        <div className="relative">
          <GlassSearch
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by name, country, device…"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Wifi className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {users.length === 0 ? 'Abhi koi user online nahi hai' : 'Search se koi match nahi mila'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {users.length === 0
                ? `Koi user app kholega to yahan automatic dikhega (${ONLINE_WINDOW_SECONDS}s heartbeat window).`
                : 'Naam, desh ya device se search karo.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(u => (
              <div
                key={u.user_id}
                className="group bg-card border border-border rounded-xl px-3 py-2.5 shadow-card hover:border-primary/40 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {/* Profile photo + online dot */}
                  <button
                    type="button"
                    onClick={() => openProfile(u.user_id)}
                    className="relative shrink-0"
                    aria-label={`Open ${u.username} profile`}
                  >
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt={u.username}
                        className="w-11 h-11 rounded-full object-cover ring-2 ring-emerald-500/40"
                        onError={e => { (e.target as HTMLElement).style.visibility = 'hidden'; }}
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold ring-2 ring-emerald-500/40">
                        {(u.full_name || u.username || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-card" />
                  </button>

                  {/* Name + online label — tap opens profile */}
                  <button
                    type="button"
                    onClick={() => openProfile(u.user_id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-bold text-foreground truncate">
                        {u.full_name || u.username}
                      </span>
                      {u.is_verified && <ShieldCheck className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
                      {u.is_admin && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 shrink-0">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Online
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate">@{u.username}</span>
                      {(u.city || u.country) && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                          <MapPin className="w-3 h-3" />
                          {[u.city, u.country].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Meta */}
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-muted-foreground">{agoText(u.secondsAgo)}</p>
                    {u.device && (
                      <p className="text-[10px] text-muted-foreground/80 truncate max-w-[110px]">
                        {[u.device, u.os].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => openProfile(u.user_id)}
                    title="Open profile"
                    aria-label={`Open ${u.username} profile`}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Note: user app band karte hi list se hat jaata hai. Agar force-close ho to {ONLINE_WINDOW_SECONDS}s
          ke heartbeat window ke baad automatic hat jayega.
        </p>
      </div>
    </AdminLayout>
  );
};

export default AdminOnlineUsers;
