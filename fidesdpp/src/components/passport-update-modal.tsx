'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useTypink, txToaster } from 'typink';
import { useContractAddress } from '@/hooks/use-contract-address';
import { Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { OnChainPassport } from '@/lib/chain/ChainAdapter';
import { useMemo } from 'react';
import { Contract } from 'dedot/contracts';
import { ContractId, deployments } from '@/contracts/deployments';
import type { DppContractContractApi } from '@/contracts/types/dpp-contract';
import { appendTxLog } from '@/lib/tx/tx-log';
import { usePilotContext } from '@/hooks/use-pilot-context';
import { getIPFSGatewayURL } from '@/lib/ipfs-utils';
import { PassportTokenLookup } from '@/components/shared/passport-token-lookup';

interface PassportUpdateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId?: string;
  onSuccess?: () => void;
  /** Optional pre-filled issuer DID (useful for Pilot Mode) */
  initialIssuerDid?: string;
  /** If true, disables editing issuer DID and keeps it locked */
  lockIssuerDid?: boolean;
}

export function PassportUpdateModal({
  open,
  onOpenChange,
  tokenId: initialTokenId,
  onSuccess,
  initialIssuerDid,
  lockIssuerDid = false,
}: PassportUpdateModalProps) {
  const { connectedAccount, client, network } = useTypink();
  const { activeAddress: contractAddress } = useContractAddress();
  const { pilotId } = usePilotContext();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPassport, setIsLoadingPassport] = useState(false);
  const [isLoadingDataset, setIsLoadingDataset] = useState(false);
  const [passport, setPassport] = useState<OnChainPassport | null>(null);
  const [currentDpp, setCurrentDpp] = useState<any | null>(null);
  const [error, setError] = useState<string>('');
  const [tokenId, setTokenId] = useState(initialTokenId || '');
  const [tokenIdInput, setTokenIdInput] = useState('');
  const [issuerDid, setIssuerDid] = useState('');
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [manufacturerName, setManufacturerName] = useState('');
  const [manufacturerIdentifier, setManufacturerIdentifier] = useState('');
  const [manufacturerCountry, setManufacturerCountry] = useState('');
  const [manufacturerFacility, setManufacturerFacility] = useState('');
  const [traceabilityEventRefs, setTraceabilityEventRefs] = useState('');
  const [overrideUniqueProductId, setOverrideUniqueProductId] = useState(false);
  const [uniqueProductIdOverride, setUniqueProductIdOverride] = useState('');
  const [advancedPatchJson, setAdvancedPatchJson] = useState('');
  const [advancedPatchError, setAdvancedPatchError] = useState<string>('');
  const [preparedUpdate, setPreparedUpdate] = useState<any | null>(null);

  type UploadedImage = {
    cid: string;
    uri: string; // ipfs://<cid>
    url: string; // gateway URL
    contentType?: string;
    name?: string;
    alt?: string;
    kind?: 'primary' | 'gallery';
  };

  const [productImages, setProductImages] = useState<UploadedImage[]>([]);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);

  const normalizeProductImagesForPublic = (images: UploadedImage[]) =>
    images
      .map((img) => {
        const cid = String(img?.cid || '').trim();
        if (!cid) return null;
        const url = String(img?.url || (cid ? getIPFSGatewayURL(cid) : '')).trim();
        if (!url) return null;
        return {
          cid,
          uri: String(img?.uri || `ipfs://${cid}`),
          url,
          contentType: img?.contentType || undefined,
          name: img?.name || undefined,
          alt: img?.alt || undefined,
          kind: img?.kind || 'gallery',
        } as const;
      })
      .filter(Boolean) as Array<{
      cid: string;
      uri: string;
      url: string;
      contentType?: string;
      name?: string;
      alt?: string;
      kind?: 'primary' | 'gallery';
    }>;

  const uploadImagesToIpfs = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImageUploadBusy(true);
    try {
      const uploaded: UploadedImage[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set('file', file, file.name);
        const res = await fetch('/api/ipfs/upload', { method: 'POST', body: fd });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.cid || !json?.url) {
          throw new Error(json?.error || 'Failed to upload image');
        }
        uploaded.push({
          cid: String(json.cid),
          uri: `ipfs://${String(json.cid)}`,
          url: String(json.url),
          contentType: String(json.contentType || file.type || ''),
          name: String(json.name || file.name || ''),
          alt: String(file.name || '').replace(/\.[a-z0-9]+$/i, ''),
          kind: 'gallery',
        });
      }

      setProductImages((prev) => {
        const next = [...prev, ...uploaded];
        if (!next.some((i) => i.kind === 'primary') && next.length > 0) {
          next[0] = { ...next[0], kind: 'primary' };
        }
        return next;
      });

      toast.success(`Uploaded ${uploaded.length} image(s)`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to upload images');
    } finally {
      setImageUploadBusy(false);
    }
  };

  const contract = useMemo(() => {
    if (!client) return null;
    if (!contractAddress) return null;
    if (!contractAddress.startsWith('0x')) return null;
    const deployment = deployments.find(d => d.id === ContractId.DPP_CONTRACT);
    if (!deployment?.metadata) return null;
    try {
      return new Contract<DppContractContractApi>(
        client,
        deployment.metadata as any,
        contractAddress as `0x${string}`
      );
    } catch (e) {
      console.error('[PassportUpdateModal] Failed to create contract instance:', e);
      return null;
    }
  }, [client, contractAddress]);

  // Reset tokenId when modal opens/closes or initialTokenId changes
  useEffect(() => {
    if (open) {
      setTokenId(initialTokenId || '');
      setTokenIdInput('');
      setPassport(null);
      setCurrentDpp(null);
      setError('');
      setIssuerDid(initialIssuerDid ? normalizeDidWeb(initialIssuerDid) : '');
      setProductName('');
      setProductDescription('');
      setBatchNumber('');
      setSerialNumber('');
      setManufacturerName('');
      setManufacturerIdentifier('');
      setManufacturerCountry('');
      setManufacturerFacility('');
      setTraceabilityEventRefs('');
      setOverrideUniqueProductId(false);
      setUniqueProductIdOverride('');
      setAdvancedPatchJson('');
      setAdvancedPatchError('');
      setPreparedUpdate(null);
      setProductImages([]);
      setImageUploadBusy(false);
    }
  }, [open, initialTokenId]);

  // If Pilot Mode is active and issuer is locked, keep it in sync when props change
  useEffect(() => {
    if (!open) return;
    if (!lockIssuerDid) return;
    if (!initialIssuerDid) return;
    setIssuerDid(normalizeDidWeb(initialIssuerDid));
  }, [open, lockIssuerDid, initialIssuerDid]);

  // If the modal is opened with a preselected tokenId (e.g. from list actions),
  // load immediately. Manual typing should not trigger network calls.
  useEffect(() => {
    if (!open) return;
    if (!initialTokenId) return;
    if (!contractAddress) return;
    void loadPassport(initialTokenId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTokenId, contractAddress]);

  // Load current VC/DPP when passport is loaded
  useEffect(() => {
    if (!open) return;
    if (!tokenId) return;
    if (!passport) return;
    if (!contractAddress) return;
    void loadCurrentDataset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passport, open, tokenId, contractAddress]);

  const loadPassport = async (requestedTokenId?: string) => {
    if (!contractAddress) {
      setError('Contract address not available');
      return;
    }

    const resolvedTokenId = String((requestedTokenId ?? tokenId) || '').trim();
    if (!resolvedTokenId) {
      setError('Please enter a passport ID');
      return;
    }

    setIsLoadingPassport(true);
    setError('');

    try {
      const response = await fetch('/api/passports/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: resolvedTokenId,
          // rpcUrl is optional; server falls back to POLKADOT_RPC_URL/RPC_URL
          contractAddress,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load passport');
      }

      setTokenId(resolvedTokenId);
      setPassport(data.passport);
    } catch (e: any) {
      setError(e.message || 'Failed to load passport');
    } finally {
      setIsLoadingPassport(false);
    }
  };

  const loadCurrentDataset = async () => {
    setIsLoadingDataset(true);
    setError('');

    try {
      const response = await fetch('/api/passports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load VC dataset');
      }

      const dpp = data?.export?.dataset?.vc?.credentialSubject || null;
      setCurrentDpp(dpp);

      if (dpp) {
        setProductName(String(dpp?.product?.name || ''));
        setProductDescription(String(dpp?.product?.description || ''));
        setBatchNumber(String(dpp?.product?.batchNumber || ''));
        setSerialNumber(String(dpp?.product?.serialNumber || ''));
        setManufacturerName(String(dpp?.manufacturer?.name || ''));
        setManufacturerIdentifier(String(dpp?.manufacturer?.identifier || ''));
        setManufacturerCountry(String(dpp?.manufacturer?.country || dpp?.manufacturer?.addressCountry || ''));
        setManufacturerFacility(String(dpp?.manufacturer?.facility || ''));

        const uniqueProductIdFromVc = dpp?.annexIII?.public?.uniqueProductId;
        const productIdentifier = String(dpp?.product?.identifier || '');
        const hasOverride =
          typeof uniqueProductIdFromVc === 'string' &&
          uniqueProductIdFromVc.length > 0 &&
          productIdentifier.length > 0 &&
          uniqueProductIdFromVc !== productIdentifier;
        setOverrideUniqueProductId(!!hasOverride);
        setUniqueProductIdOverride(hasOverride ? String(uniqueProductIdFromVc) : '');

        const traceability = Array.isArray(dpp?.traceabilityInformation) ? dpp.traceabilityInformation : [];
        const refs = traceability
          .map((t: any) => String(t?.eventReference || t?.event_ref || t?.ref || '').trim())
          .filter(Boolean)
          .join('\n');
        setTraceabilityEventRefs(refs);

        const images = Array.isArray((dpp as any)?.annexIII?.public?.productImages)
          ? (dpp as any).annexIII.public.productImages
          : [];
        if (Array.isArray(images) && images.length > 0) {
          setProductImages(
            images
              .map((img: any, idx: number): UploadedImage => {
                const cid = String(
                  img?.cid || (typeof img?.uri === 'string' ? String(img.uri).replace(/^ipfs:\/\//, '') : '')
                ).trim();
                const url = String(img?.url || (cid ? getIPFSGatewayURL(cid) : '')).trim();
                return {
                  cid,
                  uri: String(img?.uri || (cid ? `ipfs://${cid}` : '')),
                  url,
                  contentType: String(img?.contentType || ''),
                  name: String(img?.name || ''),
                  alt: String(img?.alt || ''),
                  kind: img?.kind === 'primary' || idx === 0 ? 'primary' : 'gallery',
                };
              })
              .filter((i) => i.cid && i.url)
          );
        } else {
          setProductImages([]);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load VC dataset');
    } finally {
      setIsLoadingDataset(false);
    }
  };

  const normalizeDidWeb = (raw: string): string => {
    const input = raw.trim();
    if (!input) return '';
    if (input.startsWith('did:web:')) return input;

    try {
      if (input.includes('://')) {
        const url = new URL(input);
        const hostname = url.hostname;
        const pathSegments = url.pathname
          .split('/')
          .map(s => s.trim())
          .filter(Boolean);
        return `did:web:${[hostname, ...pathSegments].join(':')}`;
      }
    } catch {
      // Fall through to non-URL path
    }

    const cleaned = input.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const [host, ...path] = cleaned.split('/').filter(Boolean);
    if (!host) return '';
    return `did:web:${[host, ...path].join(':')}`;
  };

  const handleUpdate = async () => {
    if (!tokenId) {
      setError('Please enter a token ID');
      return;
    }
    if (!connectedAccount) {
      setError('Account not connected');
      return;
    }
    if (!client) {
      setError('Client not available');
      return;
    }
    if (!contractAddress) {
      setError('Contract address not available');
      return;
    }
    if (!contract) {
      setError('Contract not available');
      return;
    }

    const normalizedIssuerDid = normalizeDidWeb(issuerDid);
    if (!normalizedIssuerDid) {
      setError('Issuer DID is required');
      return;
    }

    setIsLoading(true);
    setError('');
    setPreparedUpdate(null);

    try {
      const patch: any = {};

      const normalizedProductName = productName.trim();
      const normalizedProductDescription = productDescription.trim();
      const normalizedBatchNumber = batchNumber.trim();
      const normalizedSerialNumber = serialNumber.trim();
      const normalizedManufacturerName = manufacturerName.trim();
      const normalizedManufacturerIdentifier = manufacturerIdentifier.trim();
      const normalizedManufacturerCountry = manufacturerCountry.trim();
      const normalizedManufacturerFacility = manufacturerFacility.trim();

      if (normalizedProductName) patch.productName = normalizedProductName;
      if (normalizedProductDescription) patch.productDescription = normalizedProductDescription;

      const dppPatch: any = {};

      if (normalizedProductName || normalizedProductDescription || normalizedBatchNumber || normalizedSerialNumber) {
        dppPatch.product = {};
        if (normalizedProductName) dppPatch.product.name = normalizedProductName;
        if (normalizedProductDescription) dppPatch.product.description = normalizedProductDescription;
        if (normalizedBatchNumber) dppPatch.product.batchNumber = normalizedBatchNumber;
        if (normalizedSerialNumber) dppPatch.product.serialNumber = normalizedSerialNumber;
      }

      if (
        normalizedManufacturerName ||
        normalizedManufacturerIdentifier ||
        normalizedManufacturerCountry ||
        normalizedManufacturerFacility
      ) {
        dppPatch.manufacturer = {};
        if (normalizedManufacturerName) dppPatch.manufacturer.name = normalizedManufacturerName;
        if (normalizedManufacturerIdentifier) dppPatch.manufacturer.identifier = normalizedManufacturerIdentifier;
        if (normalizedManufacturerCountry) dppPatch.manufacturer.country = normalizedManufacturerCountry;
        if (normalizedManufacturerFacility) dppPatch.manufacturer.facility = normalizedManufacturerFacility;
      }

      const uniqueProductId = overrideUniqueProductId
        ? uniqueProductIdOverride.trim()
        : String(currentDpp?.product?.identifier || '').trim();

      if (uniqueProductId) {
        const imagesForPublic = normalizeProductImagesForPublic(productImages);
        dppPatch.annexIII = {
          public: {
            uniqueProductId,
            manufacturer: {
              ...(normalizedManufacturerName ? { name: normalizedManufacturerName } : {}),
              ...(normalizedManufacturerIdentifier ? { operatorId: normalizedManufacturerIdentifier } : {}),
            },
            issuerDid: normalizedIssuerDid,
            ...(imagesForPublic.length > 0 ? { productImages: imagesForPublic } : {}),
          },
        };
      }

      const parsedTraceability = traceabilityEventRefs
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const hadExistingTraceability = Array.isArray((currentDpp as any)?.traceabilityInformation);
      if (parsedTraceability.length > 0 || hadExistingTraceability) {
        dppPatch.traceabilityInformation = parsedTraceability.map((ref) => ({
          '@type': 'TraceabilityEvent',
          eventReference: ref,
        }));
      }

      if (Object.keys(dppPatch).length > 0) {
        patch.dppPatch = dppPatch;
      }

      const advancedJson = advancedPatchJson.trim();
      if (advancedJson) {
        try {
          const parsed = JSON.parse(advancedJson);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Advanced patch must be a JSON object');
          }
          patch.dppPatch = parsed;
          setAdvancedPatchError('');
        } catch (e: any) {
          const message = e.message || 'Invalid JSON';
          setAdvancedPatchError(message);
          throw new Error(`Advanced patch JSON invalid: ${message}`);
        }
      }

      const prepareResp = await fetch('/api/passports/update/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId,
          issuerDid: normalizedIssuerDid,
          issuerAddress: connectedAccount.address,
          network: (network as any)?.id || (network as any)?.name || 'asset-hub',
          patch,
        }),
      });

      const prepared = await prepareResp.json().catch(() => null);
      if (!prepareResp.ok || !prepared?.success) {
        throw new Error(prepared?.error || 'Failed to prepare passport update');
      }

      setPreparedUpdate(prepared.updateData);

      const toaster = txToaster();
      let capturedTxHash: string | undefined;
      const normalizeHex = (value: any, name: string): string => {
        const v = String(value || '').trim();
        const normalized = v.startsWith('0x') ? v : `0x${v}`;
        if (normalized.length !== 66) {
          throw new Error(`Invalid ${name} length: expected 66 chars (0x + 64 hex), got ${normalized.length}`);
        }
        return normalized;
      };

      const payloadHashHex = normalizeHex(prepared.updateData.payloadHash, 'payloadHash');
      const subjectIdHashHex =
        prepared.updateData.subjectIdHash && String(prepared.updateData.subjectIdHash).trim().length > 0
          ? normalizeHex(prepared.updateData.subjectIdHash, 'subjectIdHash')
          : undefined;

      const tx = (contract as any).tx.updateDataset(
        BigInt(tokenId),
        prepared.updateData.datasetUri,
        payloadHashHex,
        prepared.updateData.datasetType,
        subjectIdHashHex,
        {},
      );

      await tx
        .signAndSend(connectedAccount.address, (progress: any) => {
          try {
            const h = progress?.txHash?.toHex?.() || progress?.txHash?.toString?.() || '';
            if (h && !capturedTxHash) capturedTxHash = String(h);
          } catch {
            // ignore
          }
          toaster.onTxProgress(progress);
        })
        .untilFinalized();

      if (capturedTxHash) {
        appendTxLog({
          address: connectedAccount.address,
          action: 'passport_update',
          tokenId,
          txHash: capturedTxHash,
          network: 'assethub-westend',
          pilotId: pilotId || undefined,
        });
      }
      toast.success(`Passport ${tokenId} updated (v${prepared.updateData.nextVersion})`);
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      setError(e.message || 'Failed to update passport');
      toast.error(e.message || 'Failed to update passport');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadPassport = (requested?: string) => {
    const value = String((requested ?? tokenIdInput) || '').trim();
    if (!value) {
      setError('Please enter a passport ID');
      return;
    }
    void loadPassport(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Passport</DialogTitle>
        </DialogHeader>

        {!tokenId ? (
          <div className="space-y-4">
            <PassportTokenLookup
              defaultOpen
              disabled={isLoadingPassport}
              onResolvedTokenId={(foundTokenId) => {
                setError('');
                handleLoadPassport(foundTokenId);
              }}
            />

            <details className="bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
              <summary className="cursor-pointer text-sm font-semibold">Or enter passport ID (technical)</summary>
              <div className="mt-3 space-y-2">
                <Label htmlFor="update-token-id" className="text-xs text-muted-foreground">Passport ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="update-token-id"
                    placeholder="Enter passport ID"
                    value={tokenIdInput}
                    onChange={(e) => setTokenIdInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      handleLoadPassport();
                    }}
                  />
                  <Button onClick={() => handleLoadPassport()} disabled={!tokenIdInput.trim() || isLoadingPassport}>
                    {isLoadingPassport ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Load'
                    )}
                  </Button>
                </div>
              </div>
            </details>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        ) : isLoadingPassport ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading passport data...</span>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : passport ? (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This updates the off-chain VC-JWT (IPFS) and then anchors the new CID/hash on-chain
                via <code className="px-1 py-0.5 bg-muted rounded">updateDataset</code>.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Passport ID</Label>
              <div className="p-3 bg-muted rounded-md font-mono text-sm">{tokenId}</div>
            </div>

            <div className="space-y-2">
              <Label>Current Status</Label>
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm">
                  <div><strong>Status:</strong> {passport.status}</div>
                  <div><strong>Version:</strong> {passport.version}</div>
                  <div><strong>Granularity:</strong> {passport.granularity}</div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="update-issuer-did">Issuer DID (did:web) *</Label>
              <Input
                id="update-issuer-did"
                placeholder="did:web:example.com"
                value={issuerDid}
                onChange={(e) => setIssuerDid(e.target.value)}
                disabled={isLoading || lockIssuerDid}
              />
              <p className="text-xs text-muted-foreground">
                You can enter either <code>did:web:example.com</code> or just <code>example.com</code>.
              </p>
            </div>

            {isLoadingDataset && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading current VC dataset...
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Product Identifier</Label>
                <Input value={String(currentDpp?.product?.identifier || '')} disabled className="opacity-80" />
              </div>
              <div className="space-y-2">
                <Label>Granularity</Label>
                <Input value={String(currentDpp?.granularityLevel || passport.granularity || '')} disabled className="opacity-80" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="update-product-name">Product Name</Label>
                <Input
                  id="update-product-name"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="update-product-description">Product Description</Label>
                <Input
                  id="update-product-description"
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="update-batch-number">Batch Number</Label>
                <Input
                  id="update-batch-number"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="update-serial-number">Serial Number</Label>
                <Input
                  id="update-serial-number"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="update-manufacturer-name">Manufacturer Name</Label>
                <Input
                  id="update-manufacturer-name"
                  value={manufacturerName}
                  onChange={(e) => setManufacturerName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="update-manufacturer-id">Manufacturer Identifier</Label>
                <Input
                  id="update-manufacturer-id"
                  value={manufacturerIdentifier}
                  onChange={(e) => setManufacturerIdentifier(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="update-manufacturer-country">Country</Label>
                <Input
                  id="update-manufacturer-country"
                  value={manufacturerCountry}
                  onChange={(e) => setManufacturerCountry(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="update-manufacturer-facility">Facility</Label>
                <Input
                  id="update-manufacturer-facility"
                  value={manufacturerFacility}
                  onChange={(e) => setManufacturerFacility(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-3 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold">Product images (optional)</div>
                <div className="text-xs text-muted-foreground">
                  These are shown on the customer page. Images are uploaded to IPFS and referenced in the passport.
                </div>
              </div>

              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                id="update-product-images"
                onChange={async (e) => {
                  const files = e.currentTarget.files;
                  await uploadImagesToIpfs(files);
                  e.currentTarget.value = '';
                }}
                disabled={isLoading || imageUploadBusy || !connectedAccount}
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('update-product-images')?.click()}
                  disabled={isLoading || imageUploadBusy || !connectedAccount}
                >
                  {imageUploadBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    'Upload images'
                  )}
                </Button>
                {productImages.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setProductImages([])}
                    disabled={isLoading || imageUploadBusy}
                  >
                    Remove all
                  </Button>
                )}
              </div>

              {productImages.length === 0 ? (
                <div className="text-xs text-muted-foreground">No images uploaded yet.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {productImages.map((img, idx) => (
                    <div key={`${img.cid}-${idx}`} className="space-y-2">
                      <div className="relative">
                        <img
                          src={img.url || getIPFSGatewayURL(img.cid)}
                          alt={img.alt || img.name || 'Product image'}
                          className="w-full aspect-square object-cover rounded-md border border-gray-200 dark:border-gray-800"
                        />
                        {img.kind === 'primary' && (
                          <div className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-1 rounded-full bg-black/70 text-white">
                            Cover
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {img.kind !== 'primary' ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1"
                            onClick={() =>
                              setProductImages((prev) =>
                                prev.map((p, i) => ({
                                  ...p,
                                  kind: i === idx ? 'primary' : 'gallery',
                                }))
                              )
                            }
                            disabled={isLoading || imageUploadBusy}
                          >
                            Set as cover
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" className="flex-1" disabled>
                            Cover image
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setProductImages((prev) => {
                              const next = prev.filter((_, i) => i !== idx);
                              if (!next.some((i) => i.kind === 'primary') && next.length > 0) {
                                next[0] = { ...next[0], kind: 'primary' };
                              }
                              return next;
                            })
                          }
                          disabled={isLoading || imageUploadBusy}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="update-traceability">Traceability (DTE references) — optional</Label>
              <Textarea
                id="update-traceability"
                value={traceabilityEventRefs}
                onChange={(e) => setTraceabilityEventRefs(e.target.value)}
                placeholder={'bafy...\nipfs://bafy...\nhttps://gateway.example/ipfs/bafy...'}
                disabled={isLoading}
                className="min-h-[90px]"
              />
              <p className="text-xs text-muted-foreground">
                One reference per line. Recommended flow is resolver-first (DTEs indexed by product ID); this is only a manual fallback.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Unique Product ID</Label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={overrideUniqueProductId}
                  onChange={(e) => setOverrideUniqueProductId(e.target.checked)}
                  disabled={isLoading}
                />
                Use a different unique ID than the product identifier
              </label>
              {overrideUniqueProductId && (
                <Input
                  value={uniqueProductIdOverride}
                  onChange={(e) => setUniqueProductIdOverride(e.target.value)}
                  disabled={isLoading}
                />
              )}
              {!overrideUniqueProductId && (
                <p className="text-xs text-muted-foreground">
                  Uses <code>{String(currentDpp?.product?.identifier || '')}</code>
                </p>
              )}
            </div>

            <details className="border border-gray-200 dark:border-gray-800 rounded-md p-3 bg-white/40 dark:bg-gray-950">
              <summary className="cursor-pointer text-sm font-medium">Advanced: Additional DPP JSON Patch</summary>
              <div className="mt-3 space-y-2">
                  <Label htmlFor="update-advanced-patch" className="text-xs text-muted-foreground">
                    JSON object merged into the current credentialSubject (arrays are replaced if provided)
                  </Label>
                  <textarea
                    id="update-advanced-patch"
                    className="w-full min-h-[140px] font-mono text-xs p-3 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
                    placeholder='e.g. { "conformityClaim": [{ "id": "urn:...", "conformance": true, "conformityTopic": "governance.compliance" }] }'
                    value={advancedPatchJson}
                    onChange={(e) => {
                      setAdvancedPatchJson(e.target.value);
                      setAdvancedPatchError('');
                    }}
                    disabled={isLoading}
                  />
                  {advancedPatchError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Invalid JSON</AlertTitle>
                      <AlertDescription>{advancedPatchError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              </details>

              {preparedUpdate && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>
                    <strong>Prepared datasetUri:</strong> <code>{preparedUpdate.datasetUri}</code>
                  </div>
                  <div>
                    <strong>Prepared payloadHash:</strong> <code>{preparedUpdate.payloadHash}</code>
                  </div>
                  <div>
                    <strong>Next version:</strong> <code>{preparedUpdate.nextVersion}</code>
                  </div>
                </div>
              )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {tokenId && (
            <Button variant="outline" onClick={() => { setTokenId(''); setPassport(null); setError(''); }}>
              Change Token ID
            </Button>
          )}
          <Button onClick={handleUpdate} disabled={isLoading || !passport}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              'Update Passport'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
