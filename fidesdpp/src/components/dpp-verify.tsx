'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { type ReactNode, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, ExternalLink, FileJson, Shield, Hash, User, Code } from 'lucide-react';
import { getIPFSGatewayURL } from '@/lib/ipfs-utils';
import { useSearchParams } from 'next/navigation';
import { CONTRACT_ADDRESS, WESTEND_ASSET_HUB } from '@/lib/config';
import Link from 'next/link';

type IssuerDirectoryEntry = {
  did: string;
  domain?: string;
  organizationName?: string;
  status?: string;
  issuerH160s: string[];
};

function normalizeH160(value: string): string {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  if (!v.startsWith('0x')) return v;
  return `0x${v.slice(2).padStart(40, '0')}`;
}

interface VerificationResult {
  valid: boolean;
  checks: {
    passportExists: { passed: boolean; message: string };
    notRevoked: { passed: boolean; message: string };
    datasetRetrieved: { passed: boolean; message: string };
    hashMatches: { passed: boolean; message: string };
    issuerMatches: { passed: boolean; message: string };
    vcSignature: { passed: boolean; message: string };
    schemaValid?: { passed: boolean; message: string };
  };
  onChainData?: {
    tokenId: string;
    issuer: string;
    datasetUri: string;
    payloadHash: string;
    datasetType: string;
    granularity?: string;
    subjectIdHash?: string;
    status: string;
    version: number;
    createdAt: number;
    updatedAt: number;
  };
  vcData?: {
    jwt: string | null;
    header: any;
    payload: any;
    signature: string | null;
  };
  dppData?: any;
  schemaValidation?: {
    valid: boolean;
    errors?: any[];
    errorSummary?: string;
    schemaMeta?: any;
  };
}

function getBlockExplorerBaseUrl(): string | null {
  const url = WESTEND_ASSET_HUB?.blockExplorerUrls?.[0];
  return typeof url === 'string' && url.length > 0 ? url.replace(/\/$/, '') : null;
}

function getExplorerAccountUrl(address: string): string | null {
  const base = getBlockExplorerBaseUrl();
  if (!base || !address) return null;
  return `${base}/account/${address}`;
}

/**
 * DPP Verification (UI)
 *
 * Reads on-chain anchor data, retrieves the off-chain VC-JWT payload, and verifies integrity.
 */
export function DppVerify() {
  const searchParams = useSearchParams();
  const [tokenId, setTokenId] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string>('');
  const [issuerDirectory, setIssuerDirectory] = useState<IssuerDirectoryEntry[] | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string>('');
  const [productLookup, setProductLookup] = useState<{
    productId: string;
    granularity: 'ProductClass' | 'Batch' | 'Item';
    batchNumber: string;
    serialNumber: string;
  }>({
    productId: '',
    granularity: 'ProductClass',
    batchNumber: '',
    serialNumber: '',
  });
  const [history, setHistory] = useState<
    Array<{
      derivedVersion: number;
      vcVersion?: number;
      datasetUri: string;
      ipfsCid?: string;
      payloadHash?: string;
    }>
  >([]);
  const [historyError, setHistoryError] = useState<string>('');
  const tokenIdFromQuery = (searchParams.get('tokenId') || '').trim();
  const isCustomerMode = tokenIdFromQuery.length > 0;
  const verificationKey = searchParams.get('key') || '';
  const renderHref = tokenId
    ? `/render/${encodeURIComponent(tokenId)}${verificationKey ? `?key=${encodeURIComponent(verificationKey)}` : ''}`
    : '';

  const onChainVersion = result?.onChainData?.version;
  const vcCredentialSubject =
    result?.vcData?.payload?.vc?.credentialSubject || result?.vcData?.payload?.credentialSubject;
  const vcChainAnchor = vcCredentialSubject?.chainAnchor;
  const vcTokenId = vcChainAnchor?.tokenId;
  const vcVersion = vcChainAnchor?.version;
  const vcPreviousPayloadHash = vcChainAnchor?.previousPayloadHash;
  const vcPreviousDatasetUri = vcChainAnchor?.previousDatasetUri;
  const vcIssuerAccount = typeof vcChainAnchor?.issuerAccount === 'string' ? vcChainAnchor.issuerAccount : '';

  const versionMetadataCheck =
    typeof onChainVersion === 'number' && onChainVersion > 0
      ? typeof vcVersion === 'number'
        ? {
            passed: vcVersion === onChainVersion,
            message:
              vcVersion === onChainVersion
                ? `Credential version matches the public reference (${onChainVersion})`
                : `Credential version (${vcVersion}) does not match the public reference (${onChainVersion})`,
          }
        : {
            passed: true,
            message: `Public reference version is ${onChainVersion}. Credential does not include version metadata.`,
          }
      : {
          passed: true,
          message: 'Version metadata unavailable',
        };

  const tokenIdMetadataCheck =
    vcTokenId && tokenId
      ? {
          passed: String(vcTokenId) === String(tokenId),
          message:
            String(vcTokenId) === String(tokenId)
              ? 'Credential metadata matches the requested passport'
              : `Credential metadata (${vcTokenId}) does not match the requested passport (${tokenId})`,
        }
      : {
          passed: true,
          message: 'Credential does not include passport metadata',
        };

  const verifyToken = async (tokenIdToVerify: string) => {
    const normalizedTokenId = String(tokenIdToVerify || '').trim();
    if (!normalizedTokenId) {
      setError('Please enter a passport ID');
      return;
    }

    setIsVerifying(true);
    setError('');
    setResult(null);
    setHistory([]);
    setHistoryError('');

    try {
      // Simulate API call
      const response = await fetch('/api/passport/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId: normalizedTokenId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        const errorMessage = errorData.message || errorData.error || response.statusText;
        throw new Error(`Verification failed: ${errorMessage}${errorData.details ? `\nDetails: ${JSON.stringify(errorData.details, null, 2)}` : ''}`);
      }

      const verificationResult: VerificationResult = await response.json();
      setResult(verificationResult);

      try {
        const historyResp = await fetch(`/api/passports/history?tokenId=${encodeURIComponent(normalizedTokenId)}`);
        const historyJson = await historyResp.json().catch(() => null);
        if (historyResp.ok && historyJson?.success && Array.isArray(historyJson.history)) {
          setHistory(historyJson.history);
        } else if (historyJson?.error) {
          setHistoryError(String(historyJson.error));
        }
      } catch (historyFetchError: any) {
        setHistoryError(historyFetchError?.message || 'Failed to load history');
      }
    } catch (e: any) {
      console.error('Verification error:', e);
      setError(e.message || 'Failed to verify passport');
      
      // Show partial result for demo purposes
      setResult({
        valid: false,
        checks: {
          passportExists: { passed: false, message: 'Verification endpoint not yet implemented' },
          notRevoked: { passed: false, message: 'N/A' },
          datasetRetrieved: { passed: false, message: 'N/A' },
          hashMatches: { passed: false, message: 'N/A' },
          issuerMatches: { passed: false, message: 'N/A' },
          vcSignature: { passed: false, message: 'N/A' },
          schemaValid: { passed: false, message: 'N/A' },
        },
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const findByProductId = async () => {
    setLookupBusy(true);
    setLookupError('');

    try {
      const body: any = {
        productId: productLookup.productId.trim(),
        granularity: productLookup.granularity,
      };
      if (productLookup.granularity === 'Batch') body.batchNumber = productLookup.batchNumber.trim();
      if (productLookup.granularity === 'Item') body.serialNumber = productLookup.serialNumber.trim();

      const res = await fetch('/api/passports/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Lookup failed');
      }
      if (!json?.found || !json?.tokenId) {
        setLookupError('No passport found for this product identifier.');
        return;
      }

      const foundTokenId = String(json.tokenId);
      setTokenId(foundTokenId);
      await verifyToken(foundTokenId);
    } catch (e: any) {
      setLookupError(e?.message || 'Lookup failed');
    } finally {
      setLookupBusy(false);
    }
  };

  const dpp = result?.dppData || null;
  const dppProduct = (dpp as any)?.product || null;
  const dppManufacturer = (dpp as any)?.manufacturer || null;

  const productName = String(dppProduct?.name || '').trim();
  const manufacturerName = String(dppManufacturer?.name || '').trim();
  const issuerH160 = normalizeH160(String(result?.onChainData?.issuer || ''));
  const directoryIssuer =
    issuerH160 && issuerDirectory ? issuerDirectory.find((e) => e.issuerH160s.includes(issuerH160)) : undefined;
  const issuerDisplayName =
    String(directoryIssuer?.organizationName || directoryIssuer?.domain || manufacturerName || '').trim() || '—';
  const productIdentifier = String((dppProduct as any)?.registeredId || dppProduct?.identifier || '').trim();
  const batchNumber = String(dppProduct?.batchNumber || '').trim();
  const serialNumber = String(dppProduct?.serialNumber || '').trim();

  const dppImagesRaw = (dpp as any)?.annexIII?.public?.productImages;
  const dppImages = Array.isArray(dppImagesRaw) ? dppImagesRaw : [];
  const normalizedImages = dppImages
    .map((img: any, idx: number) => {
      const cid = String(
        img?.cid || (typeof img?.uri === 'string' ? String(img.uri).replace(/^ipfs:\/\//, '') : '')
      ).trim();
      const url = String(img?.url || (cid ? getIPFSGatewayURL(cid) : '')).trim();
      if (!cid || !url) return null;
      return {
        cid,
        url,
        alt: String(img?.alt || img?.name || productName || 'Product image'),
        kind: img?.kind === 'primary' || idx === 0 ? ('primary' as const) : ('gallery' as const),
      };
    })
    .filter(Boolean) as Array<{ cid: string; url: string; alt: string; kind: 'primary' | 'gallery' }>;
  const coverImage = normalizedImages.find((i) => i.kind === 'primary') || normalizedImages[0] || null;

  const materialsCount = Array.isArray((dpp as any)?.materialsProvenance) ? (dpp as any).materialsProvenance.length : 0;
  const claimsCount = Array.isArray((dpp as any)?.conformityClaim) ? (dpp as any).conformityClaim.length : 0;
  const eventsCount = Array.isArray((dpp as any)?.traceabilityInformation) ? (dpp as any).traceabilityInformation.length : 0;

  useEffect(() => {
    if (!tokenIdFromQuery) return;

    if (tokenIdFromQuery !== tokenId) {
      setTokenId(tokenIdFromQuery);
    }

    // Always auto-verify when tokenId is present in the URL (e.g., user clicks from list).
    void verifyToken(tokenIdFromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenIdFromQuery]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/issuer/directory');
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.success && Array.isArray(json.issuers)) {
          setIssuerDirectory(json.issuers as IssuerDirectoryEntry[]);
        } else {
          setIssuerDirectory(null);
        }
      } catch {
        if (!cancelled) setIssuerDirectory(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const CheckItem = ({ 
    icon, 
    label, 
    check 
  }: { 
    icon: ReactNode;
    label: string; 
    check: { passed: boolean; message: string } 
  }) => (
    <div className='flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900'>
      <div className='shrink-0 mt-0.5'>{icon}</div>
      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-2'>
          <span className='text-sm font-medium'>{label}</span>
          {check.passed ? (
            <CheckCircle2 className='w-4 h-4 text-green-600 dark:text-green-400' />
          ) : (
            <XCircle className='w-4 h-4 text-red-600 dark:text-red-400' />
          )}
        </div>
        <p className='text-xs text-muted-foreground mt-1'>{check.message}</p>
      </div>
    </div>
  );

  return (
    <Card id='verify-passport-section' className='bg-gray-200/70 dark:bg-white/5 border-none shadow-none'>
      <CardContent className='space-y-6'>
        {error && (
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Input / Context */}
        <div className='space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
          {isCustomerMode ? (
            <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
              <div className='space-y-1'>
                <div className='text-sm font-semibold'>Passport verification</div>
                <div className='text-xs text-muted-foreground'>
                  Passport ID: <code className='break-all'>{tokenIdFromQuery}</code>
                </div>
              </div>
              <div className='flex gap-2 flex-wrap'>
                <Button onClick={() => void verifyToken(tokenIdFromQuery)} disabled={isVerifying || !tokenIdFromQuery}>
                  {isVerifying ? 'Re-checking…' : 'Re-check'}
                </Button>
                <Button asChild variant='outline' disabled={!tokenIdFromQuery}>
                  <Link href={renderHref} target='_blank' rel='noreferrer'>
                    <ExternalLink className='w-4 h-4 mr-2' />
                    View passport
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className='space-y-2'>
                <Label>Passport ID</Label>
                <div className='flex flex-col sm:flex-row gap-2'>
                  <Input
                    type='number'
                    placeholder='Enter passport ID'
                    value={tokenId}
                    onChange={(e) => setTokenId(e.target.value)}
                    disabled={isVerifying}
                  />
                  <Button
                    onClick={() => void verifyToken(tokenId)}
                    disabled={isVerifying || !tokenId}
                    className='min-w-[120px]'>
                    {isVerifying ? 'Checking…' : 'Check'}
                  </Button>
                  <Button asChild variant='outline' disabled={!tokenId}>
                    <Link href={renderHref} target='_blank' rel='noreferrer'>
                      <ExternalLink className='w-4 h-4 mr-2' />
                      View passport
                    </Link>
                  </Button>
                </div>
              </div>
              <div className='text-xs text-muted-foreground'>
                Tip: this ID is usually printed on a QR label or packaging.
              </div>
            </>
          )}
        </div>

        {/* Lookup by Product ID (operator use) */}
        {!isCustomerMode && (
          <details className='bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
            <summary className='cursor-pointer text-sm font-semibold'>Find by product identifier (SKU/GTIN)</summary>
            <div className='mt-3 space-y-3'>
              <div className='text-xs text-muted-foreground'>
                Use the same identifier format used when the passport was created (e.g. <code>GTIN:0123456789012</code> or your internal SKU).
              </div>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                <div className='space-y-1 md:col-span-2'>
                  <Label className='text-xs text-muted-foreground'>Product identifier</Label>
                  <Input
                    value={productLookup.productId}
                    onChange={(e) => setProductLookup((p) => ({ ...p, productId: e.target.value }))}
                    placeholder='e.g., GTIN:0123456789012'
                    disabled={lookupBusy || isVerifying}
                  />
                </div>
                <div className='space-y-1'>
                  <Label className='text-xs text-muted-foreground'>Level</Label>
                  <select
                    className='w-full h-10 rounded-md border border-gray-200 dark:border-gray-800 bg-background px-3 text-sm'
                    value={productLookup.granularity}
                    onChange={(e) =>
                      setProductLookup((p) => ({
                        ...p,
                        granularity: e.target.value as any,
                        batchNumber: '',
                        serialNumber: '',
                      }))
                    }
                    disabled={lookupBusy || isVerifying}
                  >
                    <option value='ProductClass'>Model / SKU</option>
                    <option value='Batch'>Batch / Lot</option>
                    <option value='Item'>Serialized item</option>
                  </select>
                </div>
              </div>

              {productLookup.granularity === 'Batch' && (
                <div className='space-y-1'>
                  <Label className='text-xs text-muted-foreground'>Batch / Lot number</Label>
                  <Input
                    value={productLookup.batchNumber}
                    onChange={(e) => setProductLookup((p) => ({ ...p, batchNumber: e.target.value }))}
                    placeholder='e.g., LOT-2024-001'
                    disabled={lookupBusy || isVerifying}
                  />
                </div>
              )}

              {productLookup.granularity === 'Item' && (
                <div className='space-y-1'>
                  <Label className='text-xs text-muted-foreground'>Serial number</Label>
                  <Input
                    value={productLookup.serialNumber}
                    onChange={(e) => setProductLookup((p) => ({ ...p, serialNumber: e.target.value }))}
                    placeholder='e.g., SN-000123'
                    disabled={lookupBusy || isVerifying}
                  />
                </div>
              )}

              {lookupError ? (
                <Alert variant='destructive'>
                  <AlertCircle className='h-4 w-4' />
                  <AlertTitle>Not found</AlertTitle>
                  <AlertDescription>{lookupError}</AlertDescription>
                </Alert>
              ) : null}

              <div className='flex gap-2 flex-wrap'>
                <Button
                  onClick={() => void findByProductId()}
                  disabled={
                    lookupBusy ||
                    isVerifying ||
                    !productLookup.productId.trim() ||
                    (productLookup.granularity === 'Batch' && !productLookup.batchNumber.trim()) ||
                    (productLookup.granularity === 'Item' && !productLookup.serialNumber.trim())
                  }
                >
                  {lookupBusy ? 'Searching…' : 'Find passport'}
                </Button>
              </div>
            </div>
          </details>
        )}

        {/* Results Section */}
        {result && (
          <>
            {/* Overall Status */}
            <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
              <div className={`lg:col-span-2 p-5 rounded-lg border-2 ${
                result.valid
                  ? 'bg-green-50 dark:bg-green-950/20 border-green-500'
                  : 'bg-red-50 dark:bg-red-950/20 border-red-500'
              }`}>
                <div className='flex items-start gap-3'>
                  {result.valid ? (
                    <CheckCircle2 className='w-7 h-7 text-green-600 dark:text-green-400 mt-0.5' />
                  ) : (
                    <XCircle className='w-7 h-7 text-red-600 dark:text-red-400 mt-0.5' />
                  )}
                  <div className='space-y-1 min-w-0'>
                    <h3 className='text-xl font-semibold leading-tight'>
                      {result.valid ? 'Authenticity confirmed' : 'Could not confirm authenticity'}
                    </h3>
                    <p className='text-sm text-muted-foreground'>
                      {result.valid
                        ? 'This passport matches its digital proof at the time of this check.'
                        : 'This check failed or was incomplete. Avoid relying on this passport until it passes.'}
                    </p>
                    <div className='flex gap-2 flex-wrap mt-3'>
                      <Button asChild variant='outline' disabled={!tokenId}>
                        <Link href={renderHref} target='_blank' rel='noreferrer'>
                          <ExternalLink className='w-4 h-4 mr-2' />
                          View passport
                        </Link>
                      </Button>
                      <Button onClick={() => void verifyToken(tokenId)} disabled={isVerifying || !tokenId}>
                        {isVerifying ? 'Checking…' : 'Re-check'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className='p-5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white/40 dark:bg-gray-950'>
                <div className='text-sm font-semibold'>What was checked</div>
                <div className='mt-3 space-y-2 text-sm'>
                  <div className='flex items-center justify-between gap-3'>
                    <span className='text-muted-foreground'>Record exists</span>
                    {result.checks.passportExists.passed ? (
                      <CheckCircle2 className='w-4 h-4 text-green-600' />
                    ) : (
                      <XCircle className='w-4 h-4 text-red-600' />
                    )}
                  </div>
                  <div className='flex items-center justify-between gap-3'>
                    <span className='text-muted-foreground'>Not revoked</span>
                    {result.checks.notRevoked.passed ? (
                      <CheckCircle2 className='w-4 h-4 text-green-600' />
                    ) : (
                      <XCircle className='w-4 h-4 text-red-600' />
                    )}
                  </div>
                  <div className='flex items-center justify-between gap-3'>
                    <span className='text-muted-foreground'>Integrity match</span>
                    {result.checks.hashMatches.passed ? (
                      <CheckCircle2 className='w-4 h-4 text-green-600' />
                    ) : (
                      <XCircle className='w-4 h-4 text-red-600' />
                    )}
                  </div>
                  <div className='flex items-center justify-between gap-3'>
                    <span className='text-muted-foreground'>Issuer confirmed</span>
                    {result.checks.issuerMatches.passed ? (
                      <CheckCircle2 className='w-4 h-4 text-green-600' />
                    ) : (
                      <XCircle className='w-4 h-4 text-red-600' />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {(productName || manufacturerName || productIdentifier) && (
              <div className='space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
                <h3 className='text-lg font-semibold'>Product summary</h3>
                <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                  <div className='md:col-span-1'>
                    {coverImage?.url ? (
                      <img
                        src={coverImage.url}
                        alt={coverImage.alt}
                        className='w-full aspect-square object-cover rounded-lg border border-gray-200 dark:border-gray-800 bg-white'
                      />
                    ) : (
                      <div className='w-full aspect-square rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center justify-center text-xs text-muted-foreground'>
                        No image
                      </div>
                    )}
                  </div>
                  <div className='space-y-1'>
                    <Label className='text-xs text-muted-foreground'>Product</Label>
                    <div className='text-sm font-medium'>{productName || '—'}</div>
                    {productIdentifier ? (
                      <div className='text-xs text-muted-foreground'>
                        Identifier: <code className='break-all'>{productIdentifier}</code>
                      </div>
                    ) : null}
                  </div>
                  <div className='space-y-1'>
                    <Label className='text-xs text-muted-foreground'>Issued by</Label>
                    <div className='text-sm font-medium'>{issuerDisplayName}</div>
                    {String(dppManufacturer?.identifier || '').trim() ? (
                      <div className='text-xs text-muted-foreground'>
                        Org ID: <code className='break-all'>{String(dppManufacturer.identifier).trim()}</code>
                      </div>
                    ) : null}
                  </div>
                  <div className='space-y-1'>
                    <Label className='text-xs text-muted-foreground'>What you can learn</Label>
                    <div className='text-sm'>
                      <span className='font-medium'>{eventsCount}</span> history event(s) ·{' '}
                      <span className='font-medium'>{claimsCount}</span> claim(s)
                    </div>
                    {batchNumber || serialNumber ? (
                      <div className='text-xs text-muted-foreground'>
                        {batchNumber ? <>Batch: <code>{batchNumber}</code></> : null}
                        {batchNumber && serialNumber ? ' · ' : null}
                        {serialNumber ? <>Serial: <code>{serialNumber}</code></> : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* Verification Checks */}
            <details className='bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
              <summary className='cursor-pointer text-lg font-semibold'>Verification details</summary>
              <div className='mt-2 text-sm text-muted-foreground'>
                These checks explain why the passport is (or isn’t) considered trustworthy.
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3 mt-4'>
                <CheckItem
                  icon={<FileJson className='w-5 h-5 text-blue-500' />}
                  label='Public record exists'
                  check={result.checks.passportExists}
                />
                <CheckItem
                  icon={<Shield className='w-5 h-5 text-purple-500' />}
                  label='Passport is active (not revoked)'
                  check={result.checks.notRevoked}
                />
                <CheckItem
                  icon={<ExternalLink className='w-5 h-5 text-cyan-500' />}
                  label='Digital record retrieved'
                  check={result.checks.datasetRetrieved}
                />
                <CheckItem
                  icon={<Hash className='w-5 h-5 text-orange-500' />}
                  label='Data integrity confirmed'
                  check={result.checks.hashMatches}
                />
                <CheckItem
                  icon={<User className='w-5 h-5 text-green-500' />}
                  label='Issuer identity confirmed'
                  check={result.checks.issuerMatches}
                />
                <CheckItem
                  icon={<Shield className='w-5 h-5 text-indigo-500' />}
                  label='Issuer signature valid'
                  check={result.checks.vcSignature}
                />
                <CheckItem
                  icon={<Code className='w-5 h-5 text-slate-600' />}
                  label='Version metadata (optional)'
                  check={versionMetadataCheck}
                />
                <CheckItem
                  icon={<Code className='w-5 h-5 text-slate-600' />}
                  label='Passport metadata (optional)'
                  check={tokenIdMetadataCheck}
                />
              </div>
            </details>

            {/* On-Chain Data */}
            {result.onChainData && (
              <details className='bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
                <summary className='cursor-pointer text-lg font-semibold'>Technical details (for support)</summary>
                <div className='mt-4 space-y-4'>
                <h3 className='text-lg font-semibold'>Public integrity reference</h3>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-1'>
                    <Label className='text-xs text-muted-foreground'>Passport ID</Label>
                    <p className='text-sm font-mono'>{result.onChainData.tokenId}</p>
                  </div>
                  <div className='space-y-1'>
                    <Label className='text-xs text-muted-foreground'>Status</Label>
                    <p className='text-sm font-semibold'>{result.onChainData.status}</p>
                  </div>
                  <div className='space-y-1'>
                    <Label className='text-xs text-muted-foreground'>Granularity</Label>
                    <p className='text-sm'>{result.onChainData.granularity || 'N/A (v0.1)'}</p>
                  </div>
                  <div className='space-y-1'>
                    <Label className='text-xs text-muted-foreground'>Version</Label>
                    <p className='text-sm'>{result.onChainData.version}</p>
                  </div>
                  <div className='space-y-1 col-span-2'>
                    <Label className='text-xs text-muted-foreground'>Version linkage</Label>
                    <div className='text-xs text-muted-foreground space-y-1'>
                      <div>
                        <strong>Credential version:</strong>{' '}
                        <code className='mx-1'>{typeof vcVersion === 'number' ? vcVersion : 'N/A'}</code>
                        <strong>Public reference:</strong>{' '}
                        <code className='mx-1'>{typeof onChainVersion === 'number' ? onChainVersion : 'N/A'}</code>
                      </div>
                      {(vcPreviousPayloadHash || vcPreviousDatasetUri) && (
                        <div className='space-y-1'>
                          {vcPreviousPayloadHash && (
                            <div>
                              <strong>Previous fingerprint:</strong>{' '}
                              <code className='break-all'>{String(vcPreviousPayloadHash)}</code>
                            </div>
                          )}
                          {vcPreviousDatasetUri && (
                            <div>
                              <strong>Previous record link:</strong>{' '}
                              <code className='break-all'>{String(vcPreviousDatasetUri)}</code>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className='space-y-1 col-span-2'>
                    <Label className='text-xs text-muted-foreground'>Issued by</Label>
                    <div className='text-sm font-medium'>{issuerDisplayName === '—' ? 'N/A' : issuerDisplayName}</div>
                    <details className='mt-2'>
                      <summary className='cursor-pointer text-xs text-muted-foreground'>
                        Show technical issuer reference
                      </summary>
                      <div className='mt-2 flex items-center gap-2'>
                        <code className='text-xs break-all'>{vcIssuerAccount || 'N/A'}</code>
                        {vcIssuerAccount && getExplorerAccountUrl(vcIssuerAccount) ? (
                          <Button
                            size='sm'
                            variant='outline'
                            title='Open in block explorer (advanced)'
                            onClick={() =>
                              window.open(getExplorerAccountUrl(vcIssuerAccount)!, '_blank', 'noopener,noreferrer')
                            }>
                            <ExternalLink className='w-3 h-3' />
                          </Button>
                        ) : null}
                      </div>
                    </details>
                  </div>
                  <div className='space-y-1 col-span-2'>
                    <Label className='text-xs text-muted-foreground'>Digital record link</Label>
                    <div className='flex items-center gap-2'>
                      <code className='text-xs break-all flex-1'>{result.onChainData.datasetUri}</code>
                      {result.onChainData.datasetUri?.startsWith('ipfs://') && (
                        <Button
                          size='sm'
                          variant='outline'
                          title='Open digital record (stored on IPFS)'
                          onClick={() => {
                            const cid = result.onChainData!.datasetUri.replace('ipfs://', '');
                            window.open(getIPFSGatewayURL(cid), '_blank', 'noopener,noreferrer');
                          }}>
                          <ExternalLink className='w-3 h-3' />
                        </Button>
                      )}
                    </div>
                    {result.onChainData.datasetUri?.startsWith('ipfs://') && (
                      <div className='mt-1'>
                        <Label className='text-xs text-muted-foreground' title='The content-addressed identifier of the digital record (CID).'>Record ID:</Label>
                        <code className='text-xs break-all ml-1 font-mono text-blue-600 dark:text-blue-400'>
                          {result.onChainData.datasetUri.replace('ipfs://', '')}
                        </code>
                      </div>
                    )}
                  </div>
                  <div className='space-y-1 col-span-2'>
                    <Label className='text-xs text-muted-foreground'>Digital fingerprint</Label>
                    <code className='text-xs break-all'>{result.onChainData.payloadHash}</code>
                  </div>
                  {result.onChainData.subjectIdHash && (
                    <div className='space-y-1 col-span-2'>
                      <Label className='text-xs text-muted-foreground'>Subject identifier hash (v0.2)</Label>
                      <code className='text-xs break-all'>{result.onChainData.subjectIdHash}</code>
                    </div>
                  )}
                </div>
                </div>
              </details>
            )}

            {/* Dataset history */}
            <details className='bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
              <summary className='cursor-pointer text-lg font-semibold flex items-center gap-2'>
                <Hash className='w-5 h-5' />
                Record history (advanced)
              </summary>
              <div className='mt-4 space-y-4'>
                <p className='text-sm text-muted-foreground'>
                  Each update publishes a new signed record. The latest record links back to the previous one.
                </p>

              {historyError ? (
                <Alert variant='destructive'>
                  <AlertCircle className='h-4 w-4' />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{historyError}</AlertDescription>
                </Alert>
              ) : null}

                {history.length > 0 ? (
                  <div className='space-y-2'>
                    {history.map((entry) => {
                    const cid =
                      entry.ipfsCid ||
                      (entry.datasetUri.startsWith('ipfs://') ? entry.datasetUri.replace('ipfs://', '') : '');
                    const ipfsUrl = cid ? getIPFSGatewayURL(cid) : null;
                    const versionLabel =
                      typeof entry.vcVersion === 'number' ? `v${entry.vcVersion}` : `v${entry.derivedVersion}`;

                      return (
                        <div
                          key={`${entry.datasetUri}-${entry.derivedVersion}`}
                          className='flex items-start justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900 px-3 py-2'
                        >
                        <div className='min-w-0'>
                          <div className='text-sm font-medium'>{versionLabel}</div>
                          <div className='text-xs text-muted-foreground break-all mt-1'>{entry.datasetUri}</div>
                          {entry.payloadHash ? (
                            <div className='text-xs text-muted-foreground break-all mt-1'>
                              Fingerprint: {entry.payloadHash}
                            </div>
                          ) : null}
                        </div>
                          <div className='shrink-0'>
                            <div className='flex items-center gap-2'>
                              <Button
                                size='sm'
                                variant='outline'
                                onClick={() => {
                                  const qp = new URLSearchParams();
                                  qp.set('version', String(entry.derivedVersion));
                                  if (verificationKey) qp.set('key', verificationKey);
                                    window.open(`/render/${encodeURIComponent(tokenId)}?${qp.toString()}`, '_blank', 'noopener,noreferrer');
                                  }}
                                >
                                View passport
                              </Button>
                              {ipfsUrl ? (
                                <Button
                                  size='sm'
                                  variant='outline'
                                  title='Open digital record (stored on IPFS)'
                                  onClick={() => window.open(ipfsUrl, '_blank', 'noopener,noreferrer')}
                                >
                                  <ExternalLink className='w-3 h-3 mr-2' />
                                  Open record
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
              ) : (
                <div className='text-sm text-muted-foreground'>No history available.</div>
              )}
              </div>
            </details>

            {/* VC Data */}
            {result.vcData && (
              <details className='bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
                <summary className='cursor-pointer text-lg font-semibold flex items-center gap-2'>
                  <FileJson className='w-5 h-5' />
                  Signed credential (for support)
                </summary>
                <div className='mt-4 space-y-4'>
                
                {/* Raw JWT */}
                {result.vcData.jwt && (
                  <details className='border border-gray-200 dark:border-gray-700 rounded-lg'>
                    <summary className='cursor-pointer p-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-t-lg flex items-center gap-2'>
                      <Code className='w-4 h-4' />
                      View raw credential
                    </summary>
                    <div className='p-3 bg-gray-50 dark:bg-gray-900 rounded-b-lg max-h-[200px] overflow-auto border-t border-gray-200 dark:border-gray-700'>
                      <code className='text-xs break-all whitespace-pre-wrap'>{result.vcData.jwt}</code>
                    </div>
                  </details>
                )}

                {/* Decoded Header */}
                {result.vcData.header && (
                  <details className='border border-gray-200 dark:border-gray-700 rounded-lg'>
                    <summary className='cursor-pointer p-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-t-lg flex items-center gap-2'>
                      <FileJson className='w-4 h-4' />
                      View decoded header
                    </summary>
                    <div className='p-3 bg-gray-50 dark:bg-gray-900 rounded-b-lg max-h-[200px] overflow-auto border-t border-gray-200 dark:border-gray-700'>
                      <pre className='text-xs whitespace-pre-wrap'>{JSON.stringify(result.vcData.header, null, 2)}</pre>
                    </div>
                  </details>
                )}

                {/* Decoded Payload */}
                {result.vcData.payload && (
                  <details className='border border-gray-200 dark:border-gray-700 rounded-lg'>
                    <summary className='cursor-pointer p-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-t-lg flex items-center gap-2'>
                      <FileJson className='w-4 h-4' />
                      View decoded payload
                    </summary>
                    <div className='p-3 bg-gray-50 dark:bg-gray-900 rounded-b-lg max-h-[400px] overflow-auto border-t border-gray-200 dark:border-gray-700'>
                      <pre className='text-xs whitespace-pre-wrap'>{JSON.stringify(result.vcData.payload, null, 2)}</pre>
                    </div>
                  </details>
                )}

                {/* Signature (for display only) */}
                {result.vcData.signature && (
                  <div className='border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900'>
                    <div className='text-xs font-medium text-muted-foreground mb-1'>Signature (Base64URL)</div>
                    <code className='text-xs break-all'>{result.vcData.signature}</code>
                    <p className='text-xs text-muted-foreground mt-2'>
                      Signature is shown for reference only. Verification is performed by the checks above.
                    </p>
                  </div>
                )}
                </div>
              </details>
            )}

            {/* DPP Data */}
            {result.dppData && (
              <details className='bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
                <summary className='cursor-pointer text-lg font-semibold flex items-center gap-2'>
                  <FileJson className='w-5 h-5' />
                  Passport data (raw, for support)
                </summary>
                <div className='mt-4 space-y-4'>
                  {result.onChainData?.datasetUri?.startsWith('ipfs://') && (
                    <Button
                      size='sm'
                      variant='outline'
                      title='Open digital record (stored on IPFS)'
                      onClick={() => {
                        const cid = result.onChainData!.datasetUri.replace('ipfs://', '');
                        window.open(getIPFSGatewayURL(cid), '_blank');
                      }}
                      className='flex items-center gap-2'>
                      <ExternalLink className='w-3 h-3' />
                      Open record
                    </Button>
                  )}
                  <div className='bg-gray-50 dark:bg-gray-900 rounded p-4 max-h-[500px] overflow-auto border border-gray-200 dark:border-gray-700'>
                    <pre className='text-xs whitespace-pre-wrap'>{JSON.stringify(result.dppData, null, 2)}</pre>
                  </div>
                  {result.onChainData?.datasetUri?.startsWith('ipfs://') && (
                    <div className='text-xs text-muted-foreground'>
                      <strong title='The content-addressed identifier of the digital record (CID).'>Record ID:</strong>{' '}
                      <code className='font-mono text-blue-600 dark:text-blue-400'>
                        {result.onChainData.datasetUri.replace('ipfs://', '')}
                      </code>
                    </div>
                  )}
                </div>
              </details>
            )}

          </>
        )}
      </CardContent>
    </Card>
  );
}
