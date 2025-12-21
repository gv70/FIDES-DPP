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
                ? `VC version matches on-chain version (${onChainVersion})`
                : `VC version (${vcVersion}) does not match on-chain version (${onChainVersion})`,
          }
        : {
            passed: true,
            message: `On-chain version is ${onChainVersion}. VC does not include version metadata.`,
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
              ? 'VC tokenId matches the requested token'
              : `VC tokenId (${vcTokenId}) does not match requested token (${tokenId})`,
        }
      : {
          passed: true,
          message: 'VC does not include tokenId metadata',
        };

  const verifyToken = async (tokenIdToVerify: string) => {
    const normalizedTokenId = String(tokenIdToVerify || '').trim();
    if (!normalizedTokenId) {
      setError('Please enter a token ID');
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

  useEffect(() => {
    const tokenIdFromQuery = searchParams.get('tokenId');
    if (!tokenIdFromQuery) return;

    if (tokenIdFromQuery !== tokenId) {
      setTokenId(tokenIdFromQuery);
    }

    // Always auto-verify when tokenId is present in the URL (e.g., user clicks from list).
    void verifyToken(tokenIdFromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

        {/* Input Section */}
        <div className='space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
          <div className='space-y-2'>
            <Label>Token ID</Label>
            <div className='flex flex-col sm:flex-row gap-2'>
              <Input
                type='number'
                placeholder='Enter token ID to verify'
                value={tokenId}
                onChange={(e) => setTokenId(e.target.value)}
                disabled={isVerifying}
              />
              <Button
                onClick={() => void verifyToken(tokenId)}
                disabled={isVerifying || !tokenId}
                className='min-w-[120px]'>
                {isVerifying ? 'Verifying...' : 'Verify'}
              </Button>
              <Button asChild variant='outline' disabled={!tokenId}>
                <Link href={renderHref} target='_blank' rel='noreferrer'>
                  <ExternalLink className='w-4 h-4 mr-2' />
                  View
                </Link>
              </Button>
            </div>
          </div>
          
          <Alert>
            <AlertCircle className='h-4 w-4' />
            <AlertDescription className='text-xs'>
              This page verifies on-chain data, IPFS retrieval, and integrity checks. Signature verification depends on DID document availability.
            </AlertDescription>
          </Alert>
        </div>

        {/* Results Section */}
        {result && (
          <>
            {/* Overall Status */}
            <div className={`p-4 rounded-lg border-2 ${
              result.valid 
                ? 'bg-green-50 dark:bg-green-950/20 border-green-500' 
                : 'bg-red-50 dark:bg-red-950/20 border-red-500'
            }`}>
              <div className='flex items-center gap-2'>
                {result.valid ? (
                  <CheckCircle2 className='w-6 h-6 text-green-600 dark:text-green-400' />
                ) : (
                  <XCircle className='w-6 h-6 text-red-600 dark:text-red-400' />
                )}
                <div>
                  <h3 className='text-lg font-semibold'>
                    {result.valid ? 'Passport Valid' : 'Passport Invalid'}
                  </h3>
                  <p className='text-sm text-muted-foreground'>
                    {result.valid 
                      ? 'All verification checks passed' 
                      : 'One or more checks failed'}
                  </p>
                </div>
              </div>
            </div>

            {/* Verification Checks */}
            <div className='space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
              <h3 className='text-lg font-semibold'>Verification Checks</h3>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                <CheckItem
                  icon={<FileJson className='w-5 h-5 text-blue-500' />}
                  label='Passport Exists On-Chain'
                  check={result.checks.passportExists}
                />
                <CheckItem
                  icon={<Shield className='w-5 h-5 text-purple-500' />}
                  label='Status: Not Revoked'
                  check={result.checks.notRevoked}
                />
                <CheckItem
                  icon={<ExternalLink className='w-5 h-5 text-cyan-500' />}
                  label='Dataset Retrieved from IPFS'
                  check={result.checks.datasetRetrieved}
                />
                <CheckItem
                  icon={<Hash className='w-5 h-5 text-orange-500' />}
                  label='Payload Hash Matches'
                  check={result.checks.hashMatches}
                />
                <CheckItem
                  icon={<User className='w-5 h-5 text-green-500' />}
                  label='Issuer Matches'
                  check={result.checks.issuerMatches}
                />
                <CheckItem
                  icon={<Shield className='w-5 h-5 text-indigo-500' />}
                  label='VC Signature Valid'
                  check={result.checks.vcSignature}
                />
                <CheckItem
                  icon={<Code className='w-5 h-5 text-slate-600' />}
                  label='VC Version Metadata'
                  check={versionMetadataCheck}
                />
                <CheckItem
                  icon={<Code className='w-5 h-5 text-slate-600' />}
                  label='VC Token Metadata'
                  check={tokenIdMetadataCheck}
                />
              </div>
            </div>

            {/* On-Chain Data */}
            {result.onChainData && (
              <div className='space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
                <h3 className='text-lg font-semibold'>On-Chain Data</h3>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-1'>
                    <Label className='text-xs text-muted-foreground'>Token ID</Label>
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
                    <Label className='text-xs text-muted-foreground'>VC Version Linkage</Label>
                    <div className='text-xs text-muted-foreground space-y-1'>
                      <div>
                        <strong>VC version:</strong>{' '}
                        <code className='mx-1'>{typeof vcVersion === 'number' ? vcVersion : 'N/A'}</code>
                        <strong>On-chain:</strong>{' '}
                        <code className='mx-1'>{typeof onChainVersion === 'number' ? onChainVersion : 'N/A'}</code>
                      </div>
                      {(vcPreviousPayloadHash || vcPreviousDatasetUri) && (
                        <div className='space-y-1'>
                          {vcPreviousPayloadHash && (
                            <div>
                              <strong>Previous payload hash:</strong>{' '}
                              <code className='break-all'>{String(vcPreviousPayloadHash)}</code>
                            </div>
                          )}
                          {vcPreviousDatasetUri && (
                            <div>
                              <strong>Previous dataset URI:</strong>{' '}
                              <code className='break-all'>{String(vcPreviousDatasetUri)}</code>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className='space-y-1 col-span-2'>
                    <Label className='text-xs text-muted-foreground'>Issuer Account</Label>
                    <div className='flex items-center gap-2'>
                      <code className='text-xs break-all'>{vcIssuerAccount || 'N/A'}</code>
                      {vcIssuerAccount && getExplorerAccountUrl(vcIssuerAccount) ? (
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => window.open(getExplorerAccountUrl(vcIssuerAccount)!, '_blank', 'noopener,noreferrer')}
                        >
                          <ExternalLink className='w-3 h-3' />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className='space-y-1 col-span-2'>
                    <Label className='text-xs text-muted-foreground'>Dataset URI</Label>
                    <div className='flex items-center gap-2'>
                      <code className='text-xs break-all flex-1'>{result.onChainData.datasetUri}</code>
                      {result.onChainData.datasetUri?.startsWith('ipfs://') && (
                        <Button
                          size='sm'
                          variant='outline'
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
                        <Label className='text-xs text-muted-foreground'>IPFS CID:</Label>
                        <code className='text-xs break-all ml-1 font-mono text-blue-600 dark:text-blue-400'>
                          {result.onChainData.datasetUri.replace('ipfs://', '')}
                        </code>
                      </div>
                    )}
                  </div>
                  <div className='space-y-1 col-span-2'>
                    <Label className='text-xs text-muted-foreground'>Payload Hash</Label>
                    <code className='text-xs break-all'>{result.onChainData.payloadHash}</code>
                  </div>
                  {result.onChainData.subjectIdHash && (
                    <div className='space-y-1 col-span-2'>
                      <Label className='text-xs text-muted-foreground'>Subject ID Hash (v0.2)</Label>
                      <code className='text-xs break-all'>{result.onChainData.subjectIdHash}</code>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dataset history */}
            <div className='space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
              <h3 className='text-lg font-semibold flex items-center gap-2'>
                <Hash className='w-5 h-5' />
                Dataset History
              </h3>
              <p className='text-sm text-muted-foreground'>
                Each update publishes a new VC-JWT dataset to IPFS. The latest VC links to the previous one.
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
                              Hash: {entry.payloadHash}
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
                                Render
                              </Button>
                              {ipfsUrl ? (
                                <Button
                                  size='sm'
                                  variant='outline'
                                  onClick={() => window.open(ipfsUrl, '_blank', 'noopener,noreferrer')}
                                >
                                  <ExternalLink className='w-3 h-3 mr-2' />
                                  Open
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

            {/* VC Data */}
            {result.vcData && (
              <div className='space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
                <h3 className='text-lg font-semibold flex items-center gap-2'>
                  <FileJson className='w-5 h-5' />
                  Verifiable Credential (VC-JWT)
                </h3>
                
                {/* Raw JWT */}
                {result.vcData.jwt && (
                  <details className='border border-gray-200 dark:border-gray-700 rounded-lg'>
                    <summary className='cursor-pointer p-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-t-lg flex items-center gap-2'>
                      <Code className='w-4 h-4' />
                      View Raw JWT
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
                      View Decoded Header
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
                      View Decoded Payload
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
                      Note: Signature is shown for display only. Cryptographic verification is performed separately.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* DPP Data */}
            {result.dppData && (
              <div className='space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
                <div className='flex items-center justify-between'>
                  <h3 className='text-lg font-semibold flex items-center gap-2'>
                    <FileJson className='w-5 h-5' />
                    Digital Product Passport (UNTP)
                  </h3>
                  {result.onChainData?.datasetUri?.startsWith('ipfs://') && (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        const cid = result.onChainData!.datasetUri.replace('ipfs://', '');
                        window.open(getIPFSGatewayURL(cid), '_blank');
                      }}
                      className='flex items-center gap-2'>
                      <ExternalLink className='w-3 h-3' />
                      View on IPFS
                    </Button>
                  )}
                </div>
                <div className='bg-gray-50 dark:bg-gray-900 rounded p-4 max-h-[500px] overflow-auto border border-gray-200 dark:border-gray-700'>
                  <pre className='text-xs whitespace-pre-wrap'>{JSON.stringify(result.dppData, null, 2)}</pre>
                </div>
                {result.onChainData?.datasetUri?.startsWith('ipfs://') && (
                  <div className='text-xs text-muted-foreground'>
                    <strong>IPFS CID:</strong>{' '}
                    <code className='font-mono text-blue-600 dark:text-blue-400'>
                      {result.onChainData.datasetUri.replace('ipfs://', '')}
                    </code>
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </CardContent>
    </Card>
  );
}
