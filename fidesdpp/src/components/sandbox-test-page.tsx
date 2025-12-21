'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTypink } from 'typink';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type SandboxStatus = {
  enabled: boolean;
  did: string;
  didDocumentUrl: string;
  polkadotAccountsUrl: string;
};

type VerifyResponse = {
  did: string;
  ok: boolean;
  didVerification: { success: boolean; status: string; error?: string };
  authorization: { address: string; network: string; authorized: boolean | null; error?: string };
};

export function SandboxTestPage() {
  const { connectedAccount, network } = useTypink();
  const address = connectedAccount?.address || '';

  const [status, setStatus] = useState<SandboxStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [targetNetwork, setTargetNetwork] = useState('westend-asset-hub');
  const [busy, setBusy] = useState(false);
  const [authorizeResult, setAuthorizeResult] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setTargetNetwork((prev) => prev || 'westend-asset-hub');
  }, [network?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStatusError(null);
        const res = await fetch('/api/test/status', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as SandboxStatus;
        if (!cancelled) setStatus(data);
      } catch (e: any) {
        if (!cancelled) setStatusError(e.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canAuthorize = useMemo(() => !!address && !!status?.did, [address, status?.did]);
  const canVerify = useMemo(() => !!address && !!status?.did, [address, status?.did]);
  const canProceed = useMemo(() => verifyResult?.ok === true, [verifyResult?.ok]);

  const authorize = async () => {
    if (!canAuthorize) return;
    setBusy(true);
    setActionError(null);
    setAuthorizeResult(null);
    setVerifyResult(null);

    try {
      const res = await fetch('/api/test/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, network: targetNetwork }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setAuthorizeResult(`Authorized ${address} (${targetNetwork})`);
    } catch (e: any) {
      setActionError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!canVerify) return;
    setBusy(true);
    setActionError(null);
    setVerifyResult(null);

    try {
      const res = await fetch('/api/test/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, network: targetNetwork }),
      });
      const data = (await res.json().catch(() => null)) as VerifyResponse | null;
      if (!res.ok || !data) throw new Error(`HTTP ${res.status}`);
      setVerifyResult(data);
    } catch (e: any) {
      setActionError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Sandbox Test Mode</h1>
        <p className="text-muted-foreground mt-1">
          Local did:web flow using `/.well-known/did.json` and `/.well-known/polkadot-accounts.json`
        </p>
      </div>

      <Card className="bg-gray-200/70 dark:bg-white/5 border-none shadow-none">
        <CardHeader>
          <CardTitle className="text-xl font-medium">Sandbox Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {statusError && <div className="text-sm text-red-600">{statusError}</div>}
          {status && (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[120px] text-muted-foreground">DID</div>
                <div className="font-mono break-all">{status.did}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[120px] text-muted-foreground">did.json</div>
                <a className="font-mono underline break-all" href={status.didDocumentUrl} target="_blank" rel="noreferrer">
                  {status.didDocumentUrl}
                </a>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[120px] text-muted-foreground">accounts</div>
                <a
                  className="font-mono underline break-all"
                  href={status.polkadotAccountsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {status.polkadotAccountsUrl}
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-gray-200/70 dark:bg-white/5 border-none shadow-none">
          <CardHeader>
            <CardTitle className="text-xl font-medium">Step 1: Wallet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="text-muted-foreground">
              Connect a wallet from the top bar and select an account.
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="min-w-[120px] text-muted-foreground">Address</div>
              <div className="font-mono break-all">{address || 'Not connected'}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-200/70 dark:bg-white/5 border-none shadow-none">
          <CardHeader>
            <CardTitle className="text-xl font-medium">Step 2–3: Authorize + Verify</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Network</div>
              <Input value={targetNetwork} onChange={(e) => setTargetNetwork(e.target.value)} placeholder="westend-asset-hub" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={authorize} disabled={!canAuthorize || busy}>
                Authorize Account (Sandbox)
              </Button>
              <Button onClick={verify} variant="outline" disabled={!canVerify || busy}>
                Verify
              </Button>
            </div>

            {authorizeResult && <div className="text-sm text-green-700">{authorizeResult}</div>}
            {actionError && <div className="text-sm text-red-600">{actionError}</div>}

            {verifyResult && (
              <div className="text-sm space-y-1">
                <div>
                  DID verification: {verifyResult.didVerification.success ? 'OK' : `FAILED (${verifyResult.didVerification.status})`}
                </div>
                <div>
                  Authorization: {verifyResult.authorization.authorized === true ? 'OK' : 'FAILED'}
                </div>
                {verifyResult.authorization.error && (
                  <div className="text-xs text-red-600 break-all">{verifyResult.authorization.error}</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-200/70 dark:bg-white/5 border-none shadow-none">
        <CardHeader>
          <CardTitle className="text-xl font-medium">Step 4: Proceed On-Chain</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-center">
          <Button asChild disabled={!canProceed}>
            <Link href="/passports">Go to Passport Management</Link>
          </Button>
          <div className="text-sm text-muted-foreground">
            This action is enabled only after the sandbox verification passes.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

