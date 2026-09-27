import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/layouts/AdminLayout';
import {
  KeyRound,
  ShieldAlert,
  RotateCw,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Users,
  Code2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  FacebookApiToken,
  getAllTokens,
  getMasterSystemToken,
  getMasterTokenVersion,
  revokeUserToken,
  rotateMasterTokenSecret,
  createUserAccessToken,
} from '@/services/tokens';

const AdminTokens: React.FC = () => {
  const [tokens, setTokens] = useState<FacebookApiToken[]>([]);
  const [masterVersion, setMasterVersion] = useState<number>(1);
  const [masterSystemToken, setMasterSystemToken] = useState<string>('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [generating, setGenerating] = useState(false);

  // New token form state
  const [customUsername, setCustomUsername] = useState('admin');
  const [customCountry, setCustomCountry] = useState('India');

  const loadData = () => {
    const list = getAllTokens();
    setTokens(list);
    setMasterVersion(getMasterTokenVersion());
    setMasterSystemToken(getMasterSystemToken());
  };

  useEffect(() => {
    loadData();
  }, []);

  // Admin Master Token Rotation: Invalidates all existing tokens!
  const handleRotateMasterKey = () => {
    setRotating(true);
    setTimeout(() => {
      const result = rotateMasterTokenSecret();
      setMasterVersion(result.newVersion);
      setMasterSystemToken(result.newMasterToken);
      loadData();
      setRotating(false);
      toast.success(
        `New Master Key v${result.newVersion} generated! All ${result.invalidatedCount} previous tokens have been expired.`
      );
    }, 800);
  };

  // Generate an instant token from admin panel
  const handleGenerateAdminToken = () => {
    setGenerating(true);
    setTimeout(() => {
      const tok = createUserAccessToken(
        'admin_master',
        customUsername.trim() || 'admin',
        'admin@pixelgram.com',
        customCountry,
        customCountry
      );
      loadData();
      setGenerating(false);
      toast.success(`New API Token created for ${tok.username} (Valid 30 days)!`);
    }, 600);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(id);
    toast.success('Token copied to clipboard!');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleRevoke = (id: string) => {
    revokeUserToken(id);
    loadData();
    toast('Token revoked');
  };

  const activeCount = tokens.filter((t) => t.status === 'active').length;
  const expiredCount = tokens.filter((t) => t.status === 'expired').length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <KeyRound className="w-6 h-6 text-primary" />
              <span>Tokens & Security Generator</span>
            </h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              Facebook Graph API-style Access Tokens, Global Master Key Rotation & Invalidation
            </p>
          </div>

          <Button
            type="button"
            onClick={loadData}
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 self-start"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-4 shadow-card">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{activeCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Active Tokens (30d)</p>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 shadow-card">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center mb-2">
              <XCircle className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{expiredCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Expired / Invalidated</p>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 shadow-card">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center mb-2">
              <KeyRound className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{tokens.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Generated</p>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 shadow-card">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center mb-2">
              <RotateCw className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">v{masterVersion}</p>
            <p className="text-xs text-muted-foreground mt-1">Security Key Version</p>
          </div>
        </div>

        {/* GLOBAL MASTER KEY ROTATION (Exact User Feature Request) */}
        <div className="bg-gradient-to-br from-card via-card to-destructive/5 border border-destructive/30 rounded-2xl p-5 shadow-card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Global Master Token Rotate & Invalidate All
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Admin jaise hi is button par tap karega, naya master key generate hoga aur pehle ke sabhi tokens turant expire ho jayenge!
                </p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-bold border border-destructive/20 shrink-0">
              Admin Master Control
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Active Master System Token (v{masterVersion}):</span>
              <button
                type="button"
                onClick={() => handleCopy(masterSystemToken, 'master')}
                className="text-primary hover:underline flex items-center gap-1 font-mono text-[11px]"
              >
                {copiedToken === 'master' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>Copy Master</span>
              </button>
            </div>
            <p className="text-[11px] font-mono text-pink-400 break-all select-all">
              {masterSystemToken}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
            <Button
              type="button"
              variant="destructive"
              disabled={rotating}
              onClick={handleRotateMasterKey}
              className="w-full sm:w-auto h-11 px-6 font-bold text-xs gap-2 shadow-md shadow-destructive/20"
            >
              <RotateCw className={`w-4 h-4 ${rotating ? 'animate-spin' : ''}`} />
              <span>{rotating ? 'Invalidating All Tokens…' : 'Rotate Master Token & Expire All Previous'}</span>
            </Button>
            <p className="text-[11px] text-muted-foreground text-center sm:text-left">
              Current security version: <b>v{masterVersion}</b>. Rotating increases version and purges all old active sessions.
            </p>
          </div>
        </div>

        {/* INSTANT TOKEN GENERATOR */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-card space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Generate New API Token</h3>
              <p className="text-xs text-muted-foreground">Create a fresh 30-day Facebook Graph API token for any user</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Target Username</label>
              <Input
                value={customUsername}
                onChange={(e) => setCustomUsername(e.target.value)}
                placeholder="e.g. akashkhaan or admin"
                className="h-10 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Origin Country</label>
              <Input
                value={customCountry}
                onChange={(e) => setCustomCountry(e.target.value)}
                placeholder="e.g. India"
                className="h-10 text-xs"
              />
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                disabled={generating}
                onClick={handleGenerateAdminToken}
                className="w-full h-10 font-bold text-xs bg-gradient-to-r from-violet-600 to-pink-500 text-white shadow-sm"
              >
                {generating ? 'Generating…' : 'Generate Token (30 Days) ✨'}
              </Button>
            </div>
          </div>
        </div>

        {/* TOKENS AUDIT TABLE */}
        <div className="bg-card border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
            <div>
              <h3 className="text-sm font-bold text-foreground">Issued Access Tokens Directory</h3>
              <p className="text-xs text-muted-foreground">Audit log of all user and system tokens</p>
            </div>
            <span className="text-xs text-muted-foreground">{tokens.length} records</span>
          </div>

          {tokens.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              <KeyRound className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
              <p>No tokens generated yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
                  <tr>
                    <th className="p-3.5">User</th>
                    <th className="p-3.5">Token Preview</th>
                    <th className="p-3.5">Origin</th>
                    <th className="p-3.5">Expires</th>
                    <th className="p-3.5">Version</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tokens.map((tok) => {
                    const isCopied = copiedToken === tok.id;
                    return (
                      <tr key={tok.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3.5 font-bold text-foreground">
                          {tok.username}
                        </td>
                        <td className="p-3.5 font-mono text-[11px] text-pink-400">
                          {tok.token.slice(0, 16)}...{tok.token.slice(-8)}
                        </td>
                        <td className="p-3.5 text-muted-foreground">
                          🇮🇳 {tok.originCountry}
                        </td>
                        <td className="p-3.5 text-muted-foreground">
                          {new Date(tok.expiresAt).toLocaleDateString()}
                        </td>
                        <td className="p-3.5 font-mono">
                          v{tok.version}
                        </td>
                        <td className="p-3.5">
                          {tok.status === 'active' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                              Active
                            </span>
                          ) : tok.status === 'expired' ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 font-bold text-[10px]">
                              Expired
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-bold text-[10px]">
                              Revoked
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right space-x-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(tok.token, tok.id)}
                            className="h-7 px-2 text-xs"
                          >
                            {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </Button>
                          {tok.status === 'active' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevoke(tok.id)}
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            >
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminTokens;
