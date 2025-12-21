'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, XCircle, ExternalLink, Copy, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useTypink } from 'typink';

interface IssuerRegistrationResult {
  success: boolean;
  did: string;
  publicKey: string;
  didDocument: any;
  polkadotAccountsDocument?: any;
  metadata?: {
    domain?: string;
    organizationName?: string;
    registeredAt?: string;
  };
  instructions?: {
    url: string;
    content: any;
    contentType: string;
  };
  polkadotAccountsInstructions?: {
    url: string;
    content: any;
    contentType: string;
  };
  error?: string;
  message?: string;
}

interface IssuerRegistrationProps {
  /** If true, removes Card wrapper (for use in Dialog) */
  noCard?: boolean;
}

export function IssuerRegistration({ noCard = false }: IssuerRegistrationProps) {
  const { connectedAccount, network } = useTypink();
  const [domain, setDomain] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [result, setResult] = useState<IssuerRegistrationResult | null>(null);
  const [error, setError] = useState('');
  const [authorizeAddress, setAuthorizeAddress] = useState('');
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  const handleRegister = async () => {
    if (!domain) {
      setError('Domain is required');
      return;
    }

    setIsRegistering(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/issuer/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain.trim(),
          organizationName: organizationName.trim() || undefined,
        }),
      });

      const data: IssuerRegistrationResult = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Registration failed');
      }

      setResult(data);
      toast.success('Issuer registered successfully!');
    } catch (e: any) {
      console.error('Registration error:', e);
      setError(e.message || 'Failed to register issuer');
      toast.error(e.message || 'Failed to register issuer');
    } finally {
      setIsRegistering(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handleAuthorize = async () => {
    const did = result?.did;
    if (!did) return;

    const address = authorizeAddress.trim() || connectedAccount?.address || '';
    if (!address) {
      setError('Wallet address is required');
      return;
    }

    setIsAuthorizing(true);
    setError('');

    try {
      const resp = await fetch('/api/issuer/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          did,
          address,
          network: (network as any)?.id || (network as any)?.name || 'asset-hub',
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to authorize wallet');
      }

      setResult((prev) =>
        prev
          ? {
              ...prev,
              polkadotAccountsDocument: json.polkadotAccountsDocument || prev.polkadotAccountsDocument,
            }
          : prev
      );
      toast.success('Wallet authorized');
    } catch (e: any) {
      setError(e.message || 'Failed to authorize wallet');
      toast.error(e.message || 'Failed to authorize wallet');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const content = (
    <div className='space-y-6'>
        {error && (
          <Alert variant='destructive'>
            <XCircle className='h-4 w-4' />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Registration Form */}
        <div className='space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
          <div className='space-y-2'>
            <Label htmlFor='domain'>Domain *</Label>
            <Input
              id='domain'
              type='text'
              placeholder='example.com'
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={isRegistering}
            />
            <p className='text-xs text-muted-foreground'>
              Your organization's domain. The DID will be: did:web:{domain || 'example.com'}
            </p>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='organizationName'>Organization Name (Optional)</Label>
            <Input
              id='organizationName'
              type='text'
              placeholder='Acme Corporation'
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              disabled={isRegistering}
            />
          </div>

          <Button
            onClick={handleRegister}
            disabled={isRegistering || !domain}
            className='w-full'>
            {isRegistering ? 'Registering...' : 'Register Issuer'}
          </Button>

          <Alert>
            <Info className='h-4 w-4' />
            <AlertDescription className='text-xs'>
              <strong>Note:</strong> After registration, you must host the DID document at{' '}
              <code className='px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded'>
                https://{domain || 'example.com'}/.well-known/did.json
              </code>
              <br />
              The platform can serve it temporarily, but for production you should host it on your own domain.
            </AlertDescription>
          </Alert>
        </div>

        {/* Registration Result */}
        {result && result.success && (
          <div className='space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
            <div className='flex items-center gap-2'>
              <CheckCircle2 className='w-5 h-5 text-green-600 dark:text-green-400' />
              <h3 className='text-lg font-semibold'>Issuer Registered Successfully</h3>
            </div>

            <div className='space-y-3'>
              <div className='space-y-1'>
                <Label className='text-xs text-muted-foreground'>DID</Label>
                <div className='flex items-center gap-2'>
                  <code className='text-sm flex-1 break-all bg-gray-50 dark:bg-gray-900 p-2 rounded'>
                    {result.did}
                  </code>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => copyToClipboard(result.did, 'DID')}>
                    <Copy className='w-3 h-3' />
                  </Button>
                </div>
              </div>

              <div className='space-y-1'>
                <Label className='text-xs text-muted-foreground'>Public Key (Hex)</Label>
                <div className='flex items-center gap-2'>
                  <code className='text-xs flex-1 break-all bg-gray-50 dark:bg-gray-900 p-2 rounded'>
                    {result.publicKey}
                  </code>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => copyToClipboard(result.publicKey, 'Public Key')}>
                    <Copy className='w-3 h-3' />
                  </Button>
                </div>
              </div>

              {result.metadata?.organizationName && (
                <div className='space-y-1'>
                  <Label className='text-xs text-muted-foreground'>Organization</Label>
                  <p className='text-sm'>{result.metadata.organizationName}</p>
                </div>
              )}

              {result.instructions && (
                <div className='space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3'>
                  <Label className='text-xs font-semibold'>Hosting Files</Label>
                  <div className='space-y-2'>
                    <div className='text-xs text-muted-foreground'>
                      <strong>DID document URL:</strong>{' '}
                      <code className='px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded'>
                        {result.instructions.url}
                      </code>
                    </div>
                    <div className='text-xs text-muted-foreground'>
                      <strong>DID document Content-Type:</strong> {result.instructions.contentType}
                    </div>
                    <details className='mt-2'>
                      <summary className='cursor-pointer text-xs text-blue-600 dark:text-blue-400 hover:underline'>
                        View DID Document JSON
                      </summary>
                      <div className='mt-2 bg-gray-50 dark:bg-gray-900 rounded p-3 max-h-[300px] overflow-auto'>
                        <pre className='text-xs'>{JSON.stringify(result.didDocument, null, 2)}</pre>
                      </div>
                    </details>
                  </div>
                </div>
              )}

              <div className='space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3'>
                <Label className='text-xs font-semibold'>Authorized Wallets</Label>
                <div className='space-y-2'>
                  <div className='text-xs text-muted-foreground'>
                    Add wallet addresses that can issue using this DID.
                  </div>
                  <div className='flex flex-col sm:flex-row gap-2'>
                    <Input
                      type='text'
                      placeholder={connectedAccount?.address ? 'Use connected wallet' : 'SS58 address'}
                      value={authorizeAddress}
                      onChange={(e) => setAuthorizeAddress(e.target.value)}
                      disabled={isAuthorizing}
                    />
                    <Button
                      onClick={handleAuthorize}
                      disabled={isAuthorizing || (!authorizeAddress.trim() && !connectedAccount?.address)}
                      className='min-w-[160px]'
                    >
                      {isAuthorizing ? 'Adding…' : 'Add Wallet'}
                    </Button>
                  </div>
                  {result.polkadotAccountsDocument && (
                    <details className='mt-2'>
                      <summary className='cursor-pointer text-xs text-blue-600 dark:text-blue-400 hover:underline'>
                        View Current Wallet List
                      </summary>
                      <div className='mt-2 bg-gray-50 dark:bg-gray-900 rounded p-3 max-h-[300px] overflow-auto'>
                        <pre className='text-xs'>
                          {JSON.stringify(result.polkadotAccountsDocument, null, 2)}
                        </pre>
                      </div>
                    </details>
                  )}
                </div>
              </div>

              {result.polkadotAccountsInstructions && (
                <div className='space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3'>
                  <div className='space-y-2'>
                    <div className='text-xs text-muted-foreground'>
                      <strong>Polkadot accounts URL:</strong>{' '}
                      <code className='px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded'>
                        {result.polkadotAccountsInstructions.url}
                      </code>
                    </div>
                    <div className='text-xs text-muted-foreground'>
                      <strong>Polkadot accounts Content-Type:</strong>{' '}
                      {result.polkadotAccountsInstructions.contentType}
                    </div>
                    <details className='mt-2'>
                      <summary className='cursor-pointer text-xs text-blue-600 dark:text-blue-400 hover:underline'>
                        View Polkadot Accounts JSON
                      </summary>
                      <div className='mt-2 bg-gray-50 dark:bg-gray-900 rounded p-3 max-h-[300px] overflow-auto'>
                        <pre className='text-xs'>
                          {JSON.stringify(result.polkadotAccountsDocument ?? result.polkadotAccountsInstructions.content, null, 2)}
                        </pre>
                      </div>
                    </details>
                    <p className='text-xs text-muted-foreground'>
                      Update this file when you add or remove authorized wallets.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );

  if (noCard) {
    return (
      <div className='space-y-6'>
        <div>
          <h2 className='text-2xl font-medium mb-2'>Register Issuer (did:web)</h2>
          <p className='text-sm text-muted-foreground'>
            Register your organization to obtain a did:web identity for UNTP-compliant VC issuance.
            This enables wallet-agnostic passport creation (supports sr25519, ed25519, etc.).
          </p>
        </div>
        {content}
      </div>
    );
  }

  return (
    <Card className='bg-gray-200/70 dark:bg-white/5 border-none shadow-none'>
      <CardHeader className='pb-4'>
        <CardTitle className='text-2xl font-medium'>Register Issuer (did:web)</CardTitle>
        <p className='text-sm text-muted-foreground'>
          Register your organization to obtain a did:web identity for UNTP-compliant VC issuance.
          This enables wallet-agnostic passport creation (supports sr25519, ed25519, etc.).
        </p>
      </CardHeader>
      <CardContent className='space-y-6'>
        {content}
      </CardContent>
    </Card>
  );
}
