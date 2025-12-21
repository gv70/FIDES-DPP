'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, XCircle, RefreshCw, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface IssuerVerificationResult {
  success: boolean;
  status: 'UNKNOWN' | 'PENDING' | 'VERIFIED' | 'FAILED';
  message?: string;
  error?: string;
  lastError?: string;
  lastAttemptAt?: string;
}

interface IssuerVerificationProps {
  /** If true, removes Card wrapper (for use in Dialog) */
  noCard?: boolean;
}

export function IssuerVerification({ noCard = false }: IssuerVerificationProps) {
  const [domain, setDomain] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<IssuerVerificationResult | null>(null);
  const [error, setError] = useState('');

  const handleVerify = async () => {
    if (!domain) {
      setError('Domain is required');
      return;
    }

    setIsVerifying(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch(`/api/issuer/verify?domain=${encodeURIComponent(domain.trim())}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data: IssuerVerificationResult = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Verification failed');
      }

      setResult(data);
      
      if (data.success) {
        toast.success('Issuer verified successfully!');
      } else {
        toast.error(data.error || 'Verification failed');
      }
    } catch (e: any) {
      console.error('Verification error:', e);
      setError(e.message || 'Failed to verify issuer');
      toast.error(e.message || 'Failed to verify issuer');
    } finally {
      setIsVerifying(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />;
      case 'FAILED':
        return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
      case 'PENDING':
        return <RefreshCw className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
      default:
        return <Info className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return 'Issuer is verified. did.json is hosted and public key matches.';
      case 'FAILED':
        return 'Verification failed. Check that did.json is hosted correctly.';
      case 'PENDING':
        return 'Issuer is registered but not yet verified.';
      default:
        return 'Issuer status unknown.';
    }
  };

  const content = (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Verification Form */}
      <div className="space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
        <div className="space-y-2">
          <Label htmlFor="verify-domain">Domain *</Label>
          <Input
            id="verify-domain"
            type="text"
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            disabled={isVerifying}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isVerifying && domain) {
                handleVerify();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            Enter the domain of the registered issuer to verify. The system will check if{' '}
            <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">
              https://{domain || 'example.com'}/.well-known/did.json
            </code>{' '}
            is accessible and the public key matches.
          </p>
        </div>

        <Button
          onClick={handleVerify}
          disabled={isVerifying || !domain}
          className="w-full">
          {isVerifying ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Verify Issuer
            </>
          )}
        </Button>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Note:</strong> Verification checks that the DID document is hosted at the correct URL
            and that the public key in the hosted document matches the stored public key.
            <br />
            If verification fails, ensure that:
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>The did.json file is accessible at <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">/.well-known/did.json</code></li>
              <li>The Content-Type header is set to <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">application/did+json</code> (or <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">application/json</code>)</li>
              <li>The public key in the DID document matches the registered public key</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>

      {/* Verification Result */}
      {result && (
        <div className="space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-2">
            {getStatusIcon(result.status)}
            <h3 className="text-lg font-semibold">
              Verification {result.success ? 'Successful' : 'Failed'}
            </h3>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium px-2 py-1 rounded ${
                  result.status === 'VERIFIED' 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : result.status === 'FAILED'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                }`}>
                  {result.status}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Message</Label>
              <p className="text-sm">{result.message || getStatusMessage(result.status)}</p>
            </div>

            {result.error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Error Details</AlertTitle>
                <AlertDescription className="text-xs">{result.error}</AlertDescription>
              </Alert>
            )}

            {result.lastError && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Last Error</Label>
                <p className="text-xs text-red-600 dark:text-red-400">{result.lastError}</p>
              </div>
            )}

            {result.lastAttemptAt && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Last Attempt</Label>
                <p className="text-xs text-muted-foreground">
                  {new Date(result.lastAttemptAt).toLocaleString()}
                </p>
              </div>
            )}

            {result.status === 'FAILED' && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>To resolve this:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>Export the DID document using the CLI: <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">npm run cli issuer export --domain {domain}</code></li>
                    <li>Host it at <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">https://{domain}/.well-known/did.json</code></li>
                    <li>Also host <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">https://{domain}/.well-known/polkadot-accounts.json</code> for wallet authorization</li>
                    <li>Ensure the Content-Type header is <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">application/did+json</code> (or <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">application/json</code>)</li>
                    <li>Try verifying again</li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (noCard) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-medium mb-2">Verify Issuer (did:web)</h2>
          <p className="text-sm text-muted-foreground">
            Verify that a registered did:web issuer has correctly hosted the DID document
            and that the public key matches.
          </p>
        </div>
        {content}
      </div>
    );
  }

  return (
    <Card className="bg-gray-200/70 dark:bg-white/5 border-none shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl font-medium">Verify Issuer (did:web)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Verify that a registered did:web issuer has correctly hosted the DID document
          and that the public key matches.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {content}
      </CardContent>
    </Card>
  );
}
