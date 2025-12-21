'use client';

import { useEffect, useState } from 'react';
import { useTypink } from 'typink';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Plus, AlertCircle } from 'lucide-react';

type TestStatusResponse = {
  enabled: boolean;
  did: string;
  didDocumentUrl: string;
  polkadotAccountsUrl: string;
};

type PolkadotAccountsDocument = {
  did?: string;
  updatedAt?: string;
  accounts?: Array<{
    address: string;
    network?: string;
  }>;
  policy?: string;
};

export function IssuerAuthorizedAccounts() {
  const { connectedAccount, network } = useTypink();
  const [enabled, setEnabled] = useState<boolean>(false);
  const [status, setStatus] = useState<TestStatusResponse | null>(null);
  const [doc, setDoc] = useState<PolkadotAccountsDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [error, setError] = useState<string>('');

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const statusResp = await fetch('/api/test/status', { method: 'GET' });
      if (!statusResp.ok) {
        setEnabled(false);
        setStatus(null);
        setDoc(null);
        return;
      }

      const statusJson = (await statusResp.json().catch(() => null)) as TestStatusResponse | null;
      if (!statusJson?.enabled || !statusJson.polkadotAccountsUrl) {
        setEnabled(false);
        setStatus(null);
        setDoc(null);
        return;
      }

      setEnabled(true);
      setStatus(statusJson);

      const docResp = await fetch(statusJson.polkadotAccountsUrl, { method: 'GET' });
      const docJson = (await docResp.json().catch(() => null)) as PolkadotAccountsDocument | null;
      setDoc(docJson);
    } catch (e: any) {
      setError(e?.message || 'Failed to load authorized accounts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authorizeConnected = async () => {
    if (!connectedAccount?.address) {
      setError('Wallet not connected');
      return;
    }

    if (!enabled) {
      setError('Sandbox mode is not enabled');
      return;
    }

    setIsAuthorizing(true);
    setError('');

    try {
      const resp = await fetch('/api/test/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: connectedAccount.address,
          network: (network as any)?.id || (network as any)?.name || 'asset-hub',
        }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to authorize account');
      }

      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to authorize account');
    } finally {
      setIsAuthorizing(false);
    }
  };

  if (!enabled && !isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authorized Wallets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              DID: <span className="font-mono">{status?.did || '-'}</span>
            </div>

            <div className="rounded-md border border-gray-200 dark:border-gray-800">
              <div className="px-3 py-2 text-xs text-muted-foreground border-b border-gray-200 dark:border-gray-800">
                {doc?.accounts?.length ? `${doc.accounts.length} account(s)` : 'No accounts'}
              </div>
              <div className="px-3 py-2 space-y-1">
                {(doc?.accounts || []).map((a) => (
                  <div key={`${a.address}-${a.network || ''}`} className="text-xs font-mono break-all">
                    {a.address}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={authorizeConnected} disabled={!connectedAccount || isAuthorizing}>
                {isAuthorizing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Authorizing…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Authorize Connected Wallet
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={load} disabled={isLoading || isAuthorizing}>
                Refresh
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

