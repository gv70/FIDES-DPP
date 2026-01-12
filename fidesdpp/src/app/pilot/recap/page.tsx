/**
 * Pilot recap page: helps testers report tx hashes / explorer links in surveys.
 *
 * @license Apache-2.0
 */

'use client';

import { useMemo, useState } from 'react';
import { useTypink } from 'typink';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { useTxLog } from '@/hooks/use-tx-log';
import { toast } from 'sonner';

function copyToClipboard(text: string) {
  if (!text) return;
  void navigator.clipboard.writeText(text);
  toast.success('Copied');
}

function extractTxHash(input: string): string {
  const value = String(input || '').trim();
  if (!value) return '';

  // Direct hash
  if (/^0x[0-9a-fA-F]{64,}$/.test(value)) return value;

  // Any URL / text containing a 0x... hash
  const match = value.match(/0x[0-9a-fA-F]{64,}/);
  if (match?.[0]) return match[0];

  // Some tools may provide hash without 0x
  if (/^[0-9a-fA-F]{64,}$/.test(value)) return `0x${value}`;

  return '';
}

function actionLabel(action: string): string {
  switch (action) {
    case 'passport_create':
      return 'Create passport';
    case 'passport_update':
      return 'Update passport';
    case 'passport_revoke':
      return 'Revoke passport';
    case 'passport_transfer':
      return 'Transfer passport';
    case 'account_map':
      return 'Map account (required for ink! v6)';
    default:
      return action;
  }
}

export default function PilotRecapPage() {
  const { connectedAccount } = useTypink();
  const address = connectedAccount?.address || '';
  const { items, clear, add } = useTxLog({ address });
  const [manualTxInput, setManualTxInput] = useState('');

  const hasWallet = !!address;
  const sorted = useMemo(() => items.slice(), [items]);
  const subscanAccountUrl = useMemo(() => {
    if (!address) return '';
    return `https://assethub-westend.subscan.io/account/${encodeURIComponent(address)}`;
  }, [address]);

  return (
    <div className='mx-auto max-w-4xl p-6 space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>Demo recap (for survey reporting)</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='text-sm text-muted-foreground'>
            Use this page to quickly copy your wallet address and the on-chain transaction hashes produced during the pilot.
          </div>

          <Alert>
            <AlertTitle>Note</AlertTitle>
            <AlertDescription>
              This page shows transactions recorded by this browser session after the recap feature was deployed.
              If transactions were created earlier, open the explorer account page and add the tx hash here.
            </AlertDescription>
          </Alert>

          {!hasWallet && (
            <Alert variant='destructive'>
              <AlertTitle>Wallet not connected</AlertTitle>
              <AlertDescription>
                Connect your wallet first, then come back here to see the transactions performed by this browser session.
              </AlertDescription>
            </Alert>
          )}

          {hasWallet && (
            <div className='space-y-2'>
              <div className='text-sm'>
                Wallet address: <code className='text-xs'>{address}</code>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button type='button' variant='outline' size='sm' onClick={() => copyToClipboard(address)}>
                  Copy wallet address
                </Button>
                <Button asChild type='button' variant='outline' size='sm'>
                  <a href={subscanAccountUrl} target='_blank' rel='noreferrer'>
                    Open explorer account page
                  </a>
                </Button>
                <Button asChild type='button' variant='outline' size='sm'>
                  <Link href='/pilot'>Back to Pilot</Link>
                </Button>
              </div>
            </div>
          )}

          {hasWallet && (
            <div className='space-y-2 rounded-lg border p-3'>
              <div className='font-medium'>Add transaction (manual entry)</div>
              <div className='text-xs text-muted-foreground'>
                Paste a transaction hash or an explorer link (Subscan). It will be added to your recap list.
              </div>
              <div className='flex flex-col md:flex-row gap-2'>
                <Input
                  value={manualTxInput}
                  onChange={(e) => setManualTxInput(e.target.value)}
                  placeholder='0x… or https://assethub-westend.subscan.io/extrinsic/0x…'
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    const txHash = extractTxHash(manualTxInput);
                    if (!txHash) {
                      toast.error('Invalid tx hash / link');
                      return;
                    }
                    add({ address, action: 'other', txHash, network: 'assethub-westend' });
                    setManualTxInput('');
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          )}

          <div className='flex items-center justify-between gap-2'>
            <div className='font-medium'>Transactions</div>
            <Button type='button' variant='outline' size='sm' onClick={() => clear()} disabled={!hasWallet || items.length === 0}>
              Clear list
            </Button>
          </div>

          {hasWallet && items.length === 0 && (
            <Alert>
              <AlertTitle>No transactions yet</AlertTitle>
              <AlertDescription>
                Perform at least one action (e.g. create a passport in <Link className='underline' href='/pilot'>Pilot</Link>{' '}
                or <Link className='underline' href='/passports'>Passports</Link>) and this list will populate automatically.
              </AlertDescription>
            </Alert>
          )}

          {items.length > 0 && (
            <div className='space-y-3'>
              {sorted.map((tx) => (
                <div key={tx.id} className='rounded-lg border p-3 space-y-2'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <div className='font-medium'>{actionLabel(tx.action)}</div>
                    <div className='text-xs text-muted-foreground'>{new Date(tx.createdAt).toLocaleString()}</div>
                  </div>

                  <div className='text-sm'>
                    Tx hash: <code className='text-xs'>{tx.txHash}</code>
                    {tx.tokenId ? (
                      <>
                        {' '}· tokenId <code className='text-xs'>{tx.tokenId}</code>
                      </>
                    ) : null}
                  </div>

                  <div className='flex flex-wrap gap-2'>
                    <Button type='button' variant='outline' size='sm' onClick={() => copyToClipboard(tx.txHash)}>
                      Copy tx hash
                    </Button>
                    {tx.explorerUrl && (
                      <>
                        <Button type='button' variant='outline' size='sm' onClick={() => copyToClipboard(tx.explorerUrl || '')}>
                          Copy explorer link
                        </Button>
                        <Button asChild type='button' variant='outline' size='sm'>
                          <a href={tx.explorerUrl} target='_blank' rel='noreferrer'>
                            Open explorer
                          </a>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
