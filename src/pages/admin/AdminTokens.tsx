import React, { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Button } from '@/components/ui/button';
import { adminTokenRegenerate, adminTokenStatus } from '@/services/accessToken';

type Status = { currentToken: string | null; generatedAt: string | null; activeUserTokens: number };

const AdminTokens: React.FC = () => {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { adminTokenStatus().then(setS).catch((e) => toast.error(e.message)); }, []);

  const regenerate = async () => {
    if (!confirm('Naya token banate hi purane sab tokens expire ho jayenge. Continue?')) return;
    setBusy(true);
    try { setS(await adminTokenRegenerate()); toast.success('Naya token ban gaya, purane sab expire'); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-2"><KeyRound className="h-6 w-6 text-primary" /><h1 className="text-2xl font-bold">Token Generator</h1></div>
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Current token</p>
          <div className="break-all rounded-md bg-muted p-3 font-mono text-sm">{s?.currentToken ?? 'Abhi koi token nahi bana'}</div>
          <p className="text-xs text-muted-foreground">Generated: {s?.generatedAt ? new Date(s.generatedAt).toLocaleString() : '—'}</p>
          <p className="text-sm">Active user tokens: <b>{s?.activeUserTokens ?? 0}</b></p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={regenerate} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}New Token Generate</Button>
            {s?.currentToken && <Button variant="outline" onClick={() => { navigator.clipboard.writeText(s.currentToken!); toast.success('Copy ho gaya'); }}><Copy className="mr-2 h-4 w-4" />Copy</Button>}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminTokens;
