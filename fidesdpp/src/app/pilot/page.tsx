/**
 * Pilot Mode (guided)
 *
 * Creates a per-tester path-based did:web and lets the tester self-authorize their wallet
 * so they can create/update passports on-chain without needing their own domain.
 *
 * @license Apache-2.0
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTypink } from 'typink';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DppHybridCreate } from '@/components/dpp-hybrid-create';
import { toast } from 'sonner';
import { BalanceInsufficientAlert } from '@/components/shared/balance-insufficient-alert';
import { NonMappedAccountAlert } from '@/components/shared/non-mapped-account-alert';
import { setPilotContext } from '@/hooks/use-pilot-context';
import { clearPilotContext, usePilotContext } from '@/hooks/use-pilot-context';

type PilotStartResponse = {
  success: boolean;
  pilotId?: string;
  did?: string;
  status?: string;
  didDocumentUrl?: string;
  polkadotAccountsUrl?: string;
  error?: string;
  hint?: string;
};

type PilotAuthorizeResponse = {
  success: boolean;
  pilotId?: string;
  did?: string;
  address?: string;
  network?: string;
  polkadotAccountsDocument?: any;
  error?: string;
  expectedMessage?: string;
};

type PolkadotAccountsDoc = {
  did?: string;
  accounts?: Array<{ network?: string; addresses?: string[] }>;
};

async function signWithInjectedWallet(params: { address: string; message: string; walletName?: string }): Promise<string> {
  const walletName = params.walletName || 'polkadot-js';
  const injected = (window as any).injectedWeb3?.[walletName];

  if (!injected) {
    throw new Error(`Wallet extension not found for source "${walletName}". Please install Polkadot.js extension.`);
  }

  let signer = injected.signer;
  if (injected.enable) {
    const enabled = await injected.enable();
    if (enabled?.signer) signer = enabled.signer;
  }

  if (!signer?.signRaw) {
    throw new Error('Wallet signer does not support signRaw.');
  }

  const dataHex = Buffer.from(params.message, 'utf-8').toString('hex');
  const res = await signer.signRaw({
    address: params.address,
    // Polkadot.js extensions expect hex data prefixed with 0x
    data: `0x${dataHex}`,
    type: 'bytes',
  });
  return String(res.signature || '');
}

export default function PilotPage() {
  const { connectedAccount } = useTypink();
  const { pilotDid: storedPilotDid, pilotId: storedPilotId, clearPilot } = usePilotContext();
  const [pilot, setPilot] = useState<PilotStartResponse | null>(null);
  const [authorization, setAuthorization] = useState<PilotAuthorizeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pilotDid = pilot?.did || '';
  const isWalletConnected = !!connectedAccount?.address;
  const walletSource = (connectedAccount as any)?.source || 'polkadot-js';

  const expectedAuthMessage = useMemo(() => {
    if (!pilot?.pilotId || !pilotDid || !connectedAccount?.address) return '';
    return [
      'FIDES-DPP Pilot Authorization',
      `pilotId: ${pilot.pilotId}`,
      `did: ${pilotDid}`,
      `address: ${connectedAccount.address}`,
    ].join('\n');
  }, [pilot?.pilotId, pilotDid, connectedAccount?.address]);

  // Resume pilot from localStorage when the page opens (so we don't force users to create a new pilot each time).
  useEffect(() => {
    if (pilot?.did) return;
    if (!storedPilotDid || !storedPilotId) return;
    setPilot({
      success: true,
      pilotId: storedPilotId,
      did: storedPilotDid,
      status: 'VERIFIED',
      didDocumentUrl: `${window.location.origin}/pilots/${encodeURIComponent(storedPilotId)}/did.json`,
      polkadotAccountsUrl: `${window.location.origin}/pilots/${encodeURIComponent(storedPilotId)}/polkadot-accounts.json`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedPilotDid, storedPilotId]);

  // If a pilot is selected and the wallet is connected, auto-detect whether the wallet is already authorized.
  useEffect(() => {
    const pilotId = pilot?.pilotId;
    const address = connectedAccount?.address;
    if (!pilotId || !address) return;

    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/pilots/${encodeURIComponent(pilotId)}/polkadot-accounts.json`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const doc = (await res.json()) as PolkadotAccountsDoc;
        const accounts = Array.isArray(doc.accounts) ? doc.accounts : [];
        const allAddresses = accounts.flatMap((a) => (Array.isArray(a.addresses) ? a.addresses : []));
        const isAuthorized = allAddresses.includes(address);
        if (cancelled) return;
        if (isAuthorized) {
          setAuthorization({
            success: true,
            pilotId: pilotId,
            did: pilot?.did,
            address,
            network: 'westend-asset-hub',
            polkadotAccountsDocument: doc,
          });
        }
      } catch {
        // Ignore auto-detection errors
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [pilot?.pilotId, pilot?.did, connectedAccount?.address]);

  const startPilot = async () => {
    setBusy(true);
    setError(null);
    setAuthorization(null);
    try {
      const res = await fetch('/api/pilot/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const json = (await res.json()) as PilotStartResponse;
      if (!json.success) throw new Error(json.error || 'Failed to start pilot');
      setPilot(json);
      if (json.pilotId && json.did) {
        setPilotContext({ pilotId: json.pilotId, did: json.did });
      }
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const clearPilotAndState = () => {
    clearPilot();
    clearPilotContext();
    setPilot(null);
    setAuthorization(null);
    setError(null);
  };

  const authorizeWallet = async () => {
    if (!pilot?.pilotId || !pilotDid) {
      setError('Start the pilot first.');
      return;
    }
    if (!connectedAccount?.address) {
      setError('Connect your wallet first.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const signature = await signWithInjectedWallet({
        address: connectedAccount.address,
        message: expectedAuthMessage,
        walletName: walletSource,
      });

      const res = await fetch('/api/pilot/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pilotId: pilot.pilotId,
          address: connectedAccount.address,
          signature,
          network: 'westend-asset-hub',
        }),
      });
      const json = (await res.json()) as PilotAuthorizeResponse;
      if (!json.success) throw new Error(json.error || 'Failed to authorize wallet');
      setAuthorization(json);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyWalletAddress = async () => {
    if (!connectedAccount?.address) return;
    try {
      await navigator.clipboard.writeText(connectedAccount.address);
      toast.success('Wallet address copied');
    } catch (e) {
      console.error(e);
      toast.error('Failed to copy wallet address');
    }
  };

  return (
    <div className='mx-auto max-w-3xl p-6 space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>Pilot Mode</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='text-sm text-muted-foreground'>
            Guided flow to test DPP creation on Westend Asset Hub using a per-tester <code>did:web</code> under this project domain.
          </div>

          {error && (
            <Alert variant='destructive'>
              <AlertTitle>Error</AlertTitle>
              <AlertDescription className='whitespace-pre-wrap'>{error}</AlertDescription>
            </Alert>
          )}

          <div className='space-y-2'>
            <div className='font-medium'>1) Start test</div>
            <div className='flex flex-wrap gap-2'>
              <Button onClick={startPilot} disabled={busy}>
                {pilot?.success ? 'Start new test (new pilot DID)' : 'Start test (create pilot DID)'}
              </Button>
              {pilot?.success && (
                <Button type='button' variant='outline' onClick={clearPilotAndState} disabled={busy}>
                  Clear pilot
                </Button>
              )}
            </div>
            {pilot?.success && (
              <div className='text-sm space-y-1'>
                <div>
                  <span className='font-medium'>pilotId:</span> <code>{pilot.pilotId}</code>
                </div>
                <div>
                  <span className='font-medium'>DID:</span> <code>{pilotDid}</code>
                </div>
                {pilot.didDocumentUrl && (
                  <div>
                    <span className='font-medium'>did.json:</span> <code>{pilot.didDocumentUrl}</code>
                  </div>
                )}
                {pilot.polkadotAccountsUrl && (
                  <div>
                    <span className='font-medium'>polkadot-accounts:</span> <code>{pilot.polkadotAccountsUrl}</code>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <div className='font-medium'>2) Connect wallet</div>
            <div className='text-sm text-muted-foreground'>
              Use the Polkadot.js browser extension. Your wallet will sign a short off-chain message to authorize itself for the pilot DID.
            </div>
            <div className='text-sm'>
              Status:{' '}
              {isWalletConnected ? (
                <span>
                  connected (<code>{connectedAccount?.address}</code>)
                </span>
              ) : (
                <span>not connected</span>
              )}
            </div>
            {/* Only show these onboarding blockers within the wallet step */}
            {isWalletConnected && (
              <div className='space-y-3 pt-2'>
                <BalanceInsufficientAlert />
                <NonMappedAccountAlert />
              </div>
            )}
            {isWalletConnected && (
              <div>
                <Button type='button' variant='outline' size='sm' onClick={copyWalletAddress}>
                  Copy wallet address
                </Button>
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <div className='font-medium'>3) Authorize wallet</div>
            <div className='text-sm text-muted-foreground'>
              This will add your wallet address to the pilot <code>polkadot-accounts.json</code>.
            </div>
            <Button onClick={authorizeWallet} disabled={busy || !pilot?.success || !isWalletConnected}>
              Authorize wallet for pilot DID
            </Button>
            {expectedAuthMessage && (
              <div className='text-xs text-muted-foreground whitespace-pre-wrap'>
                Message to sign:
                {'\n'}
                <code>{expectedAuthMessage}</code>
              </div>
            )}
            {authorization?.success && (
              <Alert>
                <AlertTitle>Authorized</AlertTitle>
                <AlertDescription>
                  Wallet <code>{authorization.address}</code> authorized for <code>{authorization.did}</code>.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {authorization?.success && pilotDid && (
        <Card>
          <CardHeader>
            <CardTitle>4) Create a sample DPP</CardTitle>
          </CardHeader>
          <CardContent>
            <DppHybridCreate noCard initialIssuerDid={pilotDid} lockIssuerDid />
          </CardContent>
        </Card>
      )}

      {authorization?.success && pilotDid && (
        <Card>
          <CardHeader>
            <CardTitle>5) Create a sample DTE</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='text-sm text-muted-foreground'>
              Create UNTP Digital Traceability Events and link them resolver-first to your products. The issuer DID is inherited from Pilot Mode.
            </div>
            <div>
              <a className='text-sm font-medium underline underline-offset-4' href='/traceability'>
                Open Traceability Events (DTE)
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
