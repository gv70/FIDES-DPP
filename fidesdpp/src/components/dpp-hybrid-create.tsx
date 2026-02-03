/**
 * DPP Hybrid Creation Component
 * 
 * Two-phase passport creation with browser-side VC signing
 * 
 * @license Apache-2.0
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, Info, Upload, FileText, Sparkles } from 'lucide-react';
import { useHybridPassport } from '@/hooks/use-hybrid-passport';
import type { Granularity } from '@/lib/chain/ChainAdapter';
import type { CreatePassportFormInput } from '@/lib/application/hybrid-types';
import { testProducts, loadProductFromJson, exportProductToJson, type TestProduct } from '@/data/test-products';
import { useTypink } from 'typink';
import { appendTxLog } from '@/lib/tx/tx-log';
import { usePilotContext } from '@/hooks/use-pilot-context';
import { toast } from 'sonner';
import { getIPFSGatewayURL } from '@/lib/ipfs-utils';
import { PassportUpdateModal } from '@/components/passport-update-modal';
import type { IssuerDirectoryEntry } from '@/lib/issuer/issuer-directory';
import { normalizeH160 } from '@/lib/issuer/issuer-directory';

interface DppHybridCreateProps {
  /** If true, removes Card wrapper (for use in Dialog) */
  noCard?: boolean;
  /** Optional pre-filled issuer DID (useful for Pilot Mode) */
  initialIssuerDid?: string;
  /** If true, disables editing issuer DID and keeps it locked */
  lockIssuerDid?: boolean;
}

export function DppHybridCreate({
  noCard = false,
  initialIssuerDid,
  lockIssuerDid = false,
}: DppHybridCreateProps) {
  const { phase, preparedData, result, error, createPassport, reset } = useHybridPassport();
  const { connectedAccount } = useTypink();
  const { pilotId } = usePilotContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const complianceDocsInputRef = useRef<HTMLInputElement>(null);
  const userInfoDocsInputRef = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode] = useState<'template' | 'upload' | 'manual'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadedJsonPreview, setUploadedJsonPreview] = useState<any>(null);

  type UploadedImage = {
    cid: string;
    uri: string; // ipfs://<cid>
    url: string; // gateway URL
    hash: string;
    size: number;
    contentType?: string;
    name?: string;
    alt?: string;
    kind?: 'primary' | 'gallery';
  };

  type UploadedDocument = {
    cid: string;
    uri: string; // ipfs://<cid>
    url: string; // gateway URL
    hash: string;
    size: number;
    contentType?: string;
    name?: string;
    title?: string;
    kind: 'compliance' | 'user-info';
    docType: 'declaration-of-conformity' | 'technical-documentation' | 'conformity-certificate' | 'other' | 'manual' | 'instructions' | 'warnings' | 'safety';
    language?: string;
  };

  type ComplianceDocType = NonNullable<
    NonNullable<CreatePassportFormInput['annexIII']>['complianceDocs']
  >[number]['type'];
  type UserInformationType = NonNullable<
    NonNullable<CreatePassportFormInput['annexIII']>['userInformation']
  >[number]['type'];

  const [productImages, setProductImages] = useState<UploadedImage[]>([]);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [docUploadBusy, setDocUploadBusy] = useState(false);
  const [complianceDocs, setComplianceDocs] = useState<UploadedDocument[]>([]);
  const [userInfoDocs, setUserInfoDocs] = useState<UploadedDocument[]>([]);

  const downloadJson = (data: unknown, filename: string) => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const parseUrls = (text: string): string[] =>
    String(text || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

  const fileTitleFromName = (filename?: string): string => {
    const base = String(filename || '').trim();
    if (!base) return '';
    return base.replace(/\.[a-z0-9]+$/i, '');
  };

  const toComplianceDocType = (docType: UploadedDocument['docType']): ComplianceDocType => {
    if (docType === 'declaration-of-conformity') return 'declaration-of-conformity';
    if (docType === 'technical-documentation') return 'technical-documentation';
    if (docType === 'conformity-certificate') return 'conformity-certificate';
    return 'other';
  };

  const toUserInformationType = (docType: UploadedDocument['docType']): UserInformationType => {
    if (docType === 'instructions') return 'instructions';
    if (docType === 'warnings') return 'warnings';
    if (docType === 'safety') return 'safety';
    return 'manual';
  };

  const uploadDocumentsToIpfs = async (
    files: FileList | null,
    kind: UploadedDocument['kind'],
    defaults: Pick<UploadedDocument, 'docType' | 'language'>
  ) => {
    if (!files || files.length === 0) return;
    setDocUploadBusy(true);
    try {
      const uploaded: UploadedDocument[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set('file', file, file.name);
        const res = await fetch('/api/ipfs/upload', { method: 'POST', body: fd });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.cid || !json?.url) {
          throw new Error(json?.error || 'Failed to upload document');
        }

        const cid = String(json.cid);
        const name = String(json.name || file.name || '');
        uploaded.push({
          cid,
          uri: `ipfs://${cid}`,
          url: String(json.url),
          hash: String(json.hash || ''),
          size: Number(json.size || 0),
          contentType: String(json.contentType || file.type || ''),
          name,
          title: fileTitleFromName(name),
          kind,
          docType: defaults.docType,
          language: defaults.language || undefined,
        });
      }

      if (kind === 'compliance') {
        setComplianceDocs((prev) => [...prev, ...uploaded]);
      } else {
        setUserInfoDocs((prev) => [...prev, ...uploaded]);
      }

      toast.success(`Uploaded ${uploaded.length} document(s)`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to upload documents');
    } finally {
      setDocUploadBusy(false);
    }
  };

  const inferGranularityFromUntp = (
    granularityLevel: unknown,
    batchNumber?: string,
    serialNumber?: string
  ): Granularity => {
    const g = String(granularityLevel || '').trim().toLowerCase();
    if (g === 'item') return 'Item';
    if (g === 'batch') return 'Batch';
    if (g === 'model' || g === 'productclass') return 'ProductClass';
    if (serialNumber) return 'Item';
    if (batchNumber) return 'Batch';
    return 'Batch';
  };

  const unwrapUntpDppFromJson = (raw: any): { dpp: any; issuerDid: string } | null => {
    if (!raw || typeof raw !== 'object') return null;
    const vc = raw?.vc && typeof raw.vc === 'object' ? raw.vc : raw;
    const issuerDid = String(vc?.issuer?.id || vc?.issuer || raw?.iss || raw?.issuer?.id || raw?.issuer || '').trim();
    const subject = vc?.credentialSubject ?? raw?.credentialSubject ?? raw?.vc?.credentialSubject ?? null;
    if (!subject) return null;
    const dpp = subject && typeof subject === 'object' && subject['@type'] === 'DigitalProductPassport' ? subject : null;
    if (!dpp) return null;
    return { dpp, issuerDid };
  };

  const mapUntpDppToFormData = (dpp: any) => {
    const product = dpp?.product || {};
    const manufacturer = dpp?.manufacturer || {};
    const facilityObj =
      manufacturer?.facility && typeof manufacturer.facility === 'object' ? manufacturer.facility : null;
    const facilityName = facilityObj ? String(facilityObj?.name || '') : String(manufacturer?.facility || '');
    const facilityId = facilityObj ? String(facilityObj?.identifier || '') : '';

    const batchNumber = String(product?.batchNumber || '').trim();
    const serialNumber = String(product?.serialNumber || '').trim();
    const granularity = inferGranularityFromUntp(dpp?.granularityLevel, batchNumber, serialNumber);

    const annexRaw = dpp?.annexIII?.public || dpp?.annexIII || null;
    const annex = annexRaw && typeof annexRaw === 'object' ? annexRaw : null;

    const complianceDocs = Array.isArray(annex?.complianceDocs) ? annex.complianceDocs : [];
    const userInfo = Array.isArray(annex?.userInformation) ? annex.userInformation : [];
    const importer = annex?.importer || {};
    const responsible = annex?.responsibleEconomicOperator || {};
    const facilities = Array.isArray(annex?.facilities) ? annex.facilities : [];
    const firstFacility = facilities[0] || {};

    const complianceDocUrls = complianceDocs
      .map((d: any) => String(d?.url || d?.href || '').trim())
      .filter(Boolean)
      .join('\n');
    const userInfoUrls = userInfo
      .map((d: any) => String(d?.url || d?.href || '').trim())
      .filter(Boolean)
      .join('\n');

    const images = Array.isArray(annex?.productImages) ? annex.productImages : [];
    const parsedImages: UploadedImage[] = images
      .map((img: any, idx: number): UploadedImage => {
        const cid = String(
          img?.cid || (typeof img?.uri === 'string' ? String(img.uri).replace(/^ipfs:\/\//, '') : '')
        ).trim();
        const url = String(img?.url || (cid ? getIPFSGatewayURL(cid) : '')).trim();
        return {
          cid,
          uri: String(img?.uri || (cid ? `ipfs://${cid}` : '')),
          url,
          hash: String(img?.hash || ''),
          size: Number(img?.size || 0),
          contentType: String(img?.contentType || ''),
          name: String(img?.name || ''),
          alt: String(img?.alt || ''),
          kind: img?.kind === 'primary' || idx === 0 ? 'primary' : 'gallery',
        };
      })
      .filter((i: UploadedImage) => i.cid && i.url);

    return {
      formDataPatch: {
        productId: String(product?.identifier || '').trim(),
        productName: String(product?.name || '').trim(),
        productDescription: String(product?.description || '').trim(),
        granularity,
        batchNumber,
        serialNumber,
        manufacturerName: String(manufacturer?.name || '').trim(),
        manufacturerIdentifier: String(manufacturer?.identifier || '').trim(),
        manufacturerCountry: String(manufacturer?.addressCountry || manufacturer?.country || '').trim(),
        manufacturerFacility: facilityName.trim(),
        manufacturerFacilityId: String(facilityId || firstFacility?.facilityId || '').trim(),
        facilityCountry: String(firstFacility?.country || '').trim(),
        facilityCity: String(firstFacility?.city || '').trim(),
        facilityAddress: String(firstFacility?.address || '').trim(),
        annexGtin: String(annex?.gtin || '').trim(),
        annexTaricCode: String(annex?.taricCode || '').trim(),
        annexImporterEori: String(importer?.eori || '').trim(),
        annexImporterName: String(importer?.name || '').trim(),
        annexImporterCountry: String(importer?.addressCountry || '').trim(),
        annexResponsibleName: String(responsible?.name || '').trim(),
        annexResponsibleOperatorId: String(responsible?.operatorId || '').trim(),
        annexComplianceDocUrls: complianceDocUrls,
        annexUserInfoUrls: userInfoUrls,
      },
      productImages: parsedImages,
    };
  };

  useEffect(() => {
    if (phase !== 'complete') return;
    if (!result?.txHash) return;
    if (!connectedAccount?.address) return;
    appendTxLog({
      address: connectedAccount.address,
      action: 'passport_create',
      tokenId: result?.tokenId != null ? String(result.tokenId) : undefined,
      txHash: String(result.txHash),
      network: 'assethub-westend',
      pilotId: pilotId || undefined,
    });
  }, [phase, result?.txHash, result?.tokenId, connectedAccount?.address, pilotId]);

  const normalizeDidWebInput = (raw: string): string => {
    const value = raw.trim();
    if (!value) return '';
    if (value.startsWith('did:web:')) return value;
    if (value.startsWith('did:')) return value;

    // Allow pasting URLs like https://example.com/path
    const withoutScheme = value.replace(/^https?:\/\//i, '');
    const cleaned = withoutScheme.replace(/\/+$/, '');
    const [host, ...pathParts] = cleaned.split('/').filter(Boolean);
    if (!host) return value;

    const didWeb = `did:web:${host}${pathParts.length ? `:${pathParts.join(':')}` : ''}`;
    return didWeb;
  };

  const [formData, setFormData] = useState({
    productId: '',
    productName: '',
    productDescription: '',
    granularity: 'Batch' as Granularity,
    batchNumber: '',
    serialNumber: '',
    manufacturerName: '',
    manufacturerIdentifier: '',
    manufacturerCountry: '',
    manufacturerFacility: '',
    manufacturerFacilityId: '',
    facilityCountry: '',
    facilityCity: '',
    facilityAddress: '',
    // Optional extended fields (off-chain)
    overrideUniqueProductId: false,
    uniqueProductIdOverride: '',
    annexGtin: '',
    annexTaricCode: '',
    annexImporterEori: '',
    annexImporterName: '',
    annexImporterCountry: '',
    annexResponsibleName: '',
    annexResponsibleOperatorId: '',
    annexComplianceDocUrls: '',
    annexUserInfoUrls: '',
    // did:web support
    useDidWeb: true,
    issuerDid: initialIssuerDid ? normalizeDidWebInput(initialIssuerDid) : '',
  });

  useEffect(() => {
    if (!initialIssuerDid) return;
    if (!lockIssuerDid && formData.issuerDid) return;
    const normalized = normalizeDidWebInput(initialIssuerDid);
    setFormData((prev) => ({
      ...prev,
      useDidWeb: true,
      issuerDid: normalized,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIssuerDid, lockIssuerDid]);

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
          hash: String(json.hash || ''),
          size: Number(json.size || 0),
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

  const normalizeProductImagesForAnnex = (images: UploadedImage[]) =>
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

  // Load template product
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = testProducts.find((p) => p.id === templateId);
    if (template && connectedAccount) {
      const annex = (template.data as any).annexIII || {};
      const firstFacility = Array.isArray(annex.facilities) ? annex.facilities[0] || {} : {};
      const uniqueProductIdFromJson = annex.uniqueProductId || '';
      const shouldOverrideUniqueProductId =
        !!uniqueProductIdFromJson && uniqueProductIdFromJson !== template.data.productId;
      setFormData({
        productId: template.data.productId,
        productName: template.data.productName,
        productDescription: template.data.productDescription || '',
        granularity: template.data.granularity,
        batchNumber: template.data.batchNumber || '',
        serialNumber: template.data.serialNumber || '',
        manufacturerName: template.data.manufacturer.name,
        manufacturerIdentifier: template.data.manufacturer.identifier || '',
        manufacturerCountry: template.data.manufacturer.country || '',
        manufacturerFacility: template.data.manufacturer.facility || '',
        manufacturerFacilityId: String((template.data.manufacturer as any).facilityId || firstFacility?.facilityId || ''),
        facilityCountry: String(firstFacility?.country || template.data.manufacturer.country || ''),
        facilityCity: String(firstFacility?.city || ''),
        facilityAddress: String(firstFacility?.address || ''),
        overrideUniqueProductId: shouldOverrideUniqueProductId,
        uniqueProductIdOverride: shouldOverrideUniqueProductId ? uniqueProductIdFromJson : '',
        annexGtin: annex.gtin || '',
        annexTaricCode: annex.taricCode || '',
        annexImporterEori: annex.importer?.eori || '',
        annexImporterName: annex.importer?.name || '',
        annexImporterCountry: annex.importer?.addressCountry || '',
        annexResponsibleName: annex.responsibleEconomicOperator?.name || '',
        annexResponsibleOperatorId: annex.responsibleEconomicOperator?.operatorId || '',
        annexComplianceDocUrls: Array.isArray(annex.complianceDocs)
          ? annex.complianceDocs.map((d: any) => d?.url).filter(Boolean).join('\n')
          : '',
        annexUserInfoUrls: Array.isArray(annex.userInformation)
          ? annex.userInformation.map((d: any) => d?.url).filter(Boolean).join('\n')
          : '',
        useDidWeb: true,
        issuerDid:
          lockIssuerDid && initialIssuerDid
            ? normalizeDidWebInput(initialIssuerDid)
            : normalizeDidWebInput(template.data.issuerDid || ''),
      });
      const images = Array.isArray(annex.productImages)
        ? annex.productImages
        : Array.isArray(annex.public?.productImages)
          ? annex.public.productImages
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
                hash: String(img?.hash || ''),
                size: Number(img?.size || 0),
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
      setUploadError('');
    }
  };

  // Handle JSON file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setUploadError('Please upload a JSON file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonString = e.target?.result as string;
        const rawParsed = JSON.parse(jsonString);
        setUploadedJsonPreview(rawParsed);

        const productData = loadProductFromJson(jsonString);
        
        if (!productData) {
          const untp = unwrapUntpDppFromJson(rawParsed);
          if (!untp?.dpp) {
            setUploadError(
              'Unrecognized JSON format. Upload either: (1) the app create-input JSON (productId/productName/granularity/manufacturer...), or (2) a UNTP DPP VC JSON-LD (credentialSubject.@type="DigitalProductPassport").'
            );
            return;
          }

          if (!connectedAccount) return;
          const mapped = mapUntpDppToFormData(untp.dpp);
          setFormData((prev) => ({
            ...prev,
            ...mapped.formDataPatch,
            useDidWeb: true,
            issuerDid:
              lockIssuerDid && initialIssuerDid
                ? normalizeDidWebInput(initialIssuerDid)
                : normalizeDidWebInput(String(untp.issuerDid || prev.issuerDid || '')),
          }));
          setProductImages(mapped.productImages);
          setUploadError('');
          setInputMode('manual');
          return;
        }

        if (connectedAccount) {
          const annex = (productData as any).annexIII || {};
          const firstFacility = Array.isArray(annex.facilities) ? annex.facilities[0] || {} : {};
          const uniqueProductIdFromJson = annex.uniqueProductId || '';
          const shouldOverrideUniqueProductId =
            !!uniqueProductIdFromJson && uniqueProductIdFromJson !== productData.productId;
          setFormData({
            productId: productData.productId,
            productName: productData.productName,
            productDescription: productData.productDescription || '',
            granularity: productData.granularity,
            batchNumber: productData.batchNumber || '',
            serialNumber: productData.serialNumber || '',
            manufacturerName: productData.manufacturer.name,
            manufacturerIdentifier: productData.manufacturer.identifier || '',
            manufacturerCountry: productData.manufacturer.country || '',
            manufacturerFacility: productData.manufacturer.facility || '',
            manufacturerFacilityId: String((productData.manufacturer as any)?.facilityId || firstFacility?.facilityId || ''),
            facilityCountry: String(firstFacility?.country || productData.manufacturer.country || ''),
            facilityCity: String(firstFacility?.city || ''),
            facilityAddress: String(firstFacility?.address || ''),
            overrideUniqueProductId: shouldOverrideUniqueProductId,
            uniqueProductIdOverride: shouldOverrideUniqueProductId ? uniqueProductIdFromJson : '',
            annexGtin: annex.gtin || '',
            annexTaricCode: annex.taricCode || '',
            annexImporterEori: annex.importer?.eori || '',
            annexImporterName: annex.importer?.name || '',
            annexImporterCountry: annex.importer?.addressCountry || '',
            annexResponsibleName: annex.responsibleEconomicOperator?.name || '',
            annexResponsibleOperatorId: annex.responsibleEconomicOperator?.operatorId || '',
            annexComplianceDocUrls: Array.isArray(annex.complianceDocs)
              ? annex.complianceDocs.map((d: any) => d?.url).filter(Boolean).join('\n')
              : '',
            annexUserInfoUrls: Array.isArray(annex.userInformation)
              ? annex.userInformation.map((d: any) => d?.url).filter(Boolean).join('\n')
              : '',
            useDidWeb: true,
            issuerDid:
              lockIssuerDid && initialIssuerDid
                ? normalizeDidWebInput(initialIssuerDid)
                : normalizeDidWebInput(productData.issuerDid || ''),
          });
          const images = Array.isArray(annex.productImages)
            ? annex.productImages
            : Array.isArray(annex.public?.productImages)
              ? annex.public.productImages
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
                    hash: String(img?.hash || ''),
                    size: Number(img?.size || 0),
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
          setUploadError('');
          setInputMode('manual'); // Switch to manual mode after upload
        }
      } catch (error: any) {
        setUploadError(`Failed to parse JSON: ${error.message}`);
      }
    };
    reader.readAsText(file);
  };

  // Export current form data as JSON
  const handleExportJson = () => {
    const complianceDocUrls = parseUrls(formData.annexComplianceDocUrls);
    const userInfoUrls = parseUrls(formData.annexUserInfoUrls);
    const imagesForAnnex = normalizeProductImagesForAnnex(productImages);
    const complianceDocsFromUploads = complianceDocs.map((d) => ({
      type: toComplianceDocType(d.docType),
      title: d.title || d.name || undefined,
      url: d.url,
      sha256: d.hash || undefined,
    }));
    const userInfoFromUploads = userInfoDocs.map((d) => ({
      type: toUserInformationType(d.docType),
      title: d.title || d.name || undefined,
      language: d.language || undefined,
      url: d.url,
      sha256: d.hash || undefined,
    }));
    const hasAnnex =
      !!formData.annexGtin ||
      !!formData.annexTaricCode ||
      !!formData.annexImporterEori ||
      !!formData.annexImporterName ||
      !!formData.annexImporterCountry ||
      !!formData.annexResponsibleName ||
      !!formData.annexResponsibleOperatorId ||
      !!formData.manufacturerFacilityId ||
      !!formData.facilityCountry ||
      !!formData.facilityCity ||
      !!formData.facilityAddress ||
      complianceDocsFromUploads.length > 0 ||
      userInfoFromUploads.length > 0 ||
      complianceDocUrls.length > 0 ||
      userInfoUrls.length > 0 ||
      imagesForAnnex.length > 0;

    const exportData = {
      productId: formData.productId,
      productName: formData.productName,
      productDescription: formData.productDescription,
      granularity: formData.granularity,
      batchNumber: formData.batchNumber,
      serialNumber: formData.serialNumber,
      manufacturer: {
        name: formData.manufacturerName,
        identifier: formData.manufacturerIdentifier,
        country: formData.manufacturerCountry,
        facility: formData.manufacturerFacility,
        facilityId: formData.manufacturerFacilityId || undefined,
      },
      ...(hasAnnex && {
        annexIII: {
          ...(formData.overrideUniqueProductId &&
            formData.uniqueProductIdOverride && {
              uniqueProductId: formData.uniqueProductIdOverride,
            }),
          gtin: formData.annexGtin || undefined,
          taricCode: formData.annexTaricCode || undefined,
          facilities:
            formData.manufacturerFacilityId || formData.facilityCountry || formData.facilityCity || formData.facilityAddress
              ? [
                  {
                    facilityId: formData.manufacturerFacilityId || 'unknown',
                    name: formData.manufacturerFacility || undefined,
                    country: formData.facilityCountry || undefined,
                    city: formData.facilityCity || undefined,
                    address: formData.facilityAddress || undefined,
                  },
                ]
              : undefined,
          ...((complianceDocUrls.length > 0 || complianceDocsFromUploads.length > 0) && {
            complianceDocs: [
              ...complianceDocsFromUploads,
              ...complianceDocUrls.map((url) => ({ type: 'other' as const, url })),
            ],
          }),
          ...((userInfoUrls.length > 0 || userInfoFromUploads.length > 0) && {
            userInformation: [
              ...userInfoFromUploads,
              ...userInfoUrls.map((url) => ({ type: 'manual' as const, url })),
            ],
          }),
          ...(imagesForAnnex.length > 0 && {
            productImages: imagesForAnnex,
          }),
          ...((formData.annexImporterEori ||
            formData.annexImporterName ||
            formData.annexImporterCountry) && {
            importer: {
              eori: formData.annexImporterEori || undefined,
              name: formData.annexImporterName || undefined,
              addressCountry: formData.annexImporterCountry || undefined,
            },
          }),
          ...((formData.annexResponsibleName || formData.annexResponsibleOperatorId) && {
            responsibleEconomicOperator: {
              name: formData.annexResponsibleName || undefined,
              operatorId: formData.annexResponsibleOperatorId || undefined,
            },
          }),
        },
      }),
      useDidWeb: true,
      issuerDid: formData.issuerDid,
    };
    
    downloadJson(exportData, `dpp-input-${formData.productId.replace(/[^a-zA-Z0-9]/g, '-')}.json`);
  };

  const handleExportUntpCredentialSubject = () => {
    const subject = preparedData?.vcSignablePayload?.payload?.vc?.credentialSubject;
    if (!subject) {
      toast.error('Prepare the passport first to generate the UNTP credentialSubject preview.');
      return;
    }
    const productId = String(formData.productId || 'passport').replace(/[^a-zA-Z0-9]/g, '-');
    downloadJson(subject, `dpp-untp-credentialSubject-${productId}.json`);
  };

  const handleExportUntpVcJsonLd = () => {
    const vc = preparedData?.vcSignablePayload?.payload?.vc;
    if (!vc) {
      toast.error('Prepare the passport first to generate the UNTP VC JSON-LD preview.');
      return;
    }
    const productId = String(formData.productId || 'passport').replace(/[^a-zA-Z0-9]/g, '-');
    downloadJson(vc, `dpp-untp-vc-${productId}.json`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const requiredMissing: string[] = [];
    if (!String(formData.productId || '').trim()) requiredMissing.push('Product ID');
    if (!String(formData.productName || '').trim()) requiredMissing.push('Product name');
    if (!String(formData.manufacturerName || '').trim()) requiredMissing.push('Manufacturer name');
    if (!String(formData.manufacturerIdentifier || '').trim()) requiredMissing.push('Manufacturer operator ID');
    if (!String(formData.manufacturerCountry || '').trim()) requiredMissing.push('Manufacturer country');
    if (!String(formData.manufacturerFacility || '').trim()) requiredMissing.push('Facility name');
    if (!String(formData.manufacturerFacilityId || '').trim()) requiredMissing.push('Facility ID');
    if (!String(formData.facilityCountry || '').trim()) requiredMissing.push('Facility country');
    if (!String(formData.facilityCity || '').trim()) requiredMissing.push('Facility city');
    if (!String(formData.facilityAddress || '').trim()) requiredMissing.push('Facility address');

    if (requiredMissing.length > 0) {
      toast.error(`Missing required fields: ${requiredMissing.join(', ')}`);
      return;
    }

    const complianceDocUrls = parseUrls(formData.annexComplianceDocUrls);
    const userInfoUrls = parseUrls(formData.annexUserInfoUrls);
    const imagesForAnnex = normalizeProductImagesForAnnex(productImages);
    const complianceDocsFromUploads = complianceDocs.map((d) => ({
      type: toComplianceDocType(d.docType),
      title: d.title || d.name || undefined,
      url: d.url,
      sha256: d.hash || undefined,
    }));
    const userInfoFromUploads = userInfoDocs.map((d) => ({
      type: toUserInformationType(d.docType),
      title: d.title || d.name || undefined,
      language: d.language || undefined,
      url: d.url,
      sha256: d.hash || undefined,
    }));
    const hasAnnex =
      !!formData.annexGtin ||
      !!formData.annexTaricCode ||
      !!formData.annexImporterEori ||
      !!formData.annexImporterName ||
      !!formData.annexImporterCountry ||
      !!formData.annexResponsibleName ||
      !!formData.annexResponsibleOperatorId ||
      !!formData.manufacturerFacilityId ||
      !!formData.facilityCountry ||
      !!formData.facilityCity ||
      !!formData.facilityAddress ||
      complianceDocsFromUploads.length > 0 ||
      userInfoFromUploads.length > 0 ||
      complianceDocUrls.length > 0 ||
      userInfoUrls.length > 0 ||
      imagesForAnnex.length > 0;

    await createPassport({
      productId: formData.productId,
      productName: formData.productName,
      productDescription: formData.productDescription || undefined,
      granularity: formData.granularity,
      batchNumber: formData.batchNumber || undefined,
      serialNumber: formData.serialNumber || undefined,
      manufacturer: {
        name: formData.manufacturerName,
        identifier: formData.manufacturerIdentifier || undefined,
        country: formData.manufacturerCountry || undefined,
        facility: formData.manufacturerFacility || undefined,
        facilityId: formData.manufacturerFacilityId || undefined,
      },
      ...(hasAnnex && {
        annexIII: {
          ...(formData.overrideUniqueProductId &&
            formData.uniqueProductIdOverride && {
              uniqueProductId: formData.uniqueProductIdOverride,
            }),
          gtin: formData.annexGtin || undefined,
          taricCode: formData.annexTaricCode || undefined,
          facilities: [
            {
              facilityId: formData.manufacturerFacilityId,
              name: formData.manufacturerFacility || undefined,
              country: formData.facilityCountry || undefined,
              city: formData.facilityCity || undefined,
              address: formData.facilityAddress || undefined,
            },
          ],
          complianceDocs: [
            ...complianceDocsFromUploads,
            ...complianceDocUrls.map((url) => ({ type: 'other' as const, url })),
          ],
          userInformation: [
            ...userInfoFromUploads,
            ...userInfoUrls.map((url) => ({ type: 'manual' as const, url })),
          ],
          ...(imagesForAnnex.length > 0 && {
            productImages: imagesForAnnex,
          }),
          ...((formData.annexImporterEori ||
            formData.annexImporterName ||
            formData.annexImporterCountry) && {
            importer: {
              eori: formData.annexImporterEori || undefined,
              name: formData.annexImporterName || undefined,
              addressCountry: formData.annexImporterCountry || undefined,
            },
          }),
          ...((formData.annexResponsibleName || formData.annexResponsibleOperatorId) && {
            responsibleEconomicOperator: {
              name: formData.annexResponsibleName || undefined,
              operatorId: formData.annexResponsibleOperatorId || undefined,
            },
          }),
        },
      }),
      // did:web support
      useDidWeb: true,
      issuerDid: formData.issuerDid || undefined,
    });
  };

  const isLoading = phase === 'preparing' || phase === 'signing' || phase === 'finalizing';
  const existingTokenIdMatch = typeof error === 'string' ? error.match(/Passport ID:\s*(\d+)/i) : null;
  const existingTokenId = existingTokenIdMatch?.[1] || '';
  const [updateExistingTokenId, setUpdateExistingTokenId] = useState<string | null>(null);
  const [issuerDirectory, setIssuerDirectory] = useState<IssuerDirectoryEntry[] | null>(null);

  const managedIssuerMatch =
    typeof error === 'string' ? error.match(/managed by issuer\s+(0x[a-fA-F0-9]{40,})/i) : null;
  const managedIssuerH160 = managedIssuerMatch?.[1] ? normalizeH160(managedIssuerMatch[1]) : '';
  const managedIssuerEntry =
    managedIssuerH160 && issuerDirectory
      ? issuerDirectory.find((e) => Array.isArray((e as any).issuerH160s) && (e as any).issuerH160s.includes(managedIssuerH160))
      : null;
  const managedIssuerLabel = managedIssuerEntry?.organizationName || managedIssuerEntry?.domain || managedIssuerEntry?.did || '';

  // Offer the "Update existing" action whenever we have the existing tokenId.
  // Disable it when we know the passport is managed by a different issuer-of-record.
  const canOfferUpdateExisting = !!existingTokenId;
  const canUpdateExisting = !!existingTokenId && !String(error || '').includes('managed by issuer');

  useEffect(() => {
    if (!existingTokenId) return;
    if (issuerDirectory) return;
    void (async () => {
      try {
        const res = await fetch('/api/issuer/directory', { method: 'GET' });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success && Array.isArray(json.issuers)) {
          setIssuerDirectory(json.issuers as IssuerDirectoryEntry[]);
        } else {
          setIssuerDirectory([]);
        }
      } catch {
        setIssuerDirectory([]);
      }
    })();
  }, [existingTokenId, issuerDirectory]);

  const content = (
    <div className='space-y-6'>
        {/* Phase Indicator */}
        <div className='flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800'>
          {phase === 'idle' && (
            <>
              <Info className='w-4 h-4 text-blue-600' />
              <span className='text-sm'>Ready to create passport</span>
            </>
          )}
          {phase === 'preparing' && (
            <>
              <Loader2 className='w-4 h-4 animate-spin text-blue-600' />
              <span className='text-sm'>Step 1: Preparing the passport (no signing)...</span>
            </>
          )}
          {phase === 'signing' && (
            <>
              <Loader2 className='w-4 h-4 animate-spin text-blue-600' />
              <span className='text-sm'>Step 2: Signing the product credential...</span>
            </>
          )}
          {phase === 'finalizing' && (
            <>
              <Loader2 className='w-4 h-4 animate-spin text-blue-600' />
              <span className='text-sm'>Step 3: Publishing the record (advanced)...</span>
            </>
          )}
          {phase === 'complete' && (
            <>
              <CheckCircle className='w-4 h-4 text-green-600' />
              <span className='text-sm'>Passport created</span>
            </>
          )}
          {phase === 'error' && (
            <>
              <XCircle className='w-4 h-4 text-red-600' />
              <span className='text-sm'>✗ Error occurred</span>
            </>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant='destructive'>
            <XCircle className='h-4 w-4' />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="space-y-3">
              <div>{error}</div>
              {managedIssuerH160 ? (
                <div className="text-sm">
                  Managed by:{' '}
                  <span className="font-medium">{managedIssuerLabel || managedIssuerH160.substring(0, 10) + '...'}</span>
                </div>
              ) : null}
              {existingTokenId ? (
                <div className="flex flex-wrap gap-2">
                  {canOfferUpdateExisting ? (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={!canUpdateExisting}
                      title={canUpdateExisting ? 'Update the existing passport' : 'Only the issuer-of-record can update'}
                      onClick={() => setUpdateExistingTokenId(existingTokenId)}
                    >
                      Update existing passport
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => window.open(`/render/${encodeURIComponent(existingTokenId)}`, '_blank')}
                  >
                    View existing passport
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => (window.location.href = '/passports#list')}
                  >
                    Go to Passports list
                  </Button>
                </div>
              ) : null}
            </AlertDescription>
          </Alert>
        )}

        {/* Success Display */}
        {phase === 'complete' && result && (
          <Alert className='bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'>
            <CheckCircle className='h-4 w-4 text-green-600' />
            <AlertTitle>Created</AlertTitle>
            <AlertDescription className='space-y-1 mt-2'>
	              <div><strong>Passport ID:</strong> {result.tokenId}</div>
	              <div><strong>Record ID:</strong> {result.ipfsCid}</div>
	              <div><strong>Transaction (advanced):</strong> <code className='text-xs'>{result.txHash}</code></div>
	              <div><strong>Block (advanced):</strong> {result.blockNumber}</div>
	              {result.verifyUrl && (
	                <div>
	                  <strong>Verification link:</strong>{' '}
	                  <a className='underline' href={result.verifyUrl} target='_blank' rel='noreferrer'>
	                    {result.verifyUrl}
	                  </a>
	                </div>
	              )}
	            </AlertDescription>
	          </Alert>
        )}

        <PassportUpdateModal
          open={updateExistingTokenId != null}
          tokenId={updateExistingTokenId || undefined}
          onOpenChange={(open) => setUpdateExistingTokenId(open ? updateExistingTokenId : null)}
          onSuccess={() => {
            setUpdateExistingTokenId(null);
            toast.success('Passport updated');
          }}
          initialIssuerDid={lockIssuerDid ? formData.issuerDid : undefined}
          lockIssuerDid={lockIssuerDid}
        />

        {/* Input Mode Selector */}
        {phase !== 'complete' && (
          <div className='space-y-4'>
            <div className='flex gap-2 border-b'>
              <button
                type='button'
                onClick={() => setInputMode('template')}
                disabled={isLoading}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  inputMode === 'template'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                <Sparkles className='w-4 h-4 inline mr-2' />
                Use Template
              </button>
              <button
                type='button'
                onClick={() => setInputMode('upload')}
                disabled={isLoading}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  inputMode === 'upload'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                <Upload className='w-4 h-4 inline mr-2' />
                Upload JSON
              </button>
              <button
                type='button'
                onClick={() => setInputMode('manual')}
                disabled={isLoading}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  inputMode === 'manual'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                <FileText className='w-4 h-4 inline mr-2' />
                Manual Entry
              </button>
            </div>

            {/* Template Selector */}
            {inputMode === 'template' && (
              <div className='space-y-2 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg'>
                <Label className='text-sm font-semibold'>Select a Test Product Template</Label>
                <p className='text-xs text-muted-foreground mb-3'>
                  Choose a pre-defined product to quickly test passport creation
                </p>
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  disabled={isLoading || !connectedAccount}
                  className='w-full p-2 border rounded-md bg-background'>
                  <option value=''>-- Select a template --</option>
                  {testProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} - {product.description}
                    </option>
                  ))}
                </select>
                {!connectedAccount && (
                  <p className='text-xs text-amber-600 dark:text-amber-400 mt-2'>
                    Connect your account first to use templates
                  </p>
                )}
              </div>
            )}

            {/* JSON Upload */}
            {inputMode === 'upload' && (
              <div className='space-y-2 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg'>
                <Label className='text-sm font-semibold'>Upload Product JSON</Label>
                <p className='text-xs text-muted-foreground mb-3'>
                  Upload either (1) the app create-input JSON or (2) a UNTP DPP VC JSON-LD (credentialSubject.@type="DigitalProductPassport").
                </p>
                <div className='flex gap-2'>
                  <input
                    ref={fileInputRef}
                    type='file'
                    accept='.json'
                    onChange={handleFileUpload}
                    disabled={isLoading || !connectedAccount}
                    className='hidden'
                  />
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading || !connectedAccount}>
                    <Upload className='w-4 h-4 mr-2' />
                    Choose JSON File
                  </Button>
                  {formData.productId && (
                    <>
                      <Button type='button' variant='outline' onClick={handleExportJson} disabled={isLoading}>
                        <FileText className='w-4 h-4 mr-2' />
                        Export input JSON
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        onClick={handleExportUntpCredentialSubject}
                        disabled={isLoading || !preparedData}>
                        <FileText className='w-4 h-4 mr-2' />
                        Export UNTP subject
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        onClick={handleExportUntpVcJsonLd}
                        disabled={isLoading || !preparedData}>
                        <FileText className='w-4 h-4 mr-2' />
                        Export UNTP VC (JSON-LD)
                      </Button>
                    </>
                  )}
                </div>
                {uploadError && (
                  <Alert variant='destructive' className='mt-2'>
                    <XCircle className='h-4 w-4' />
                    <AlertDescription className='text-xs'>{uploadError}</AlertDescription>
                  </Alert>
                )}
                {uploadedJsonPreview && (
                  <details className='mt-3'>
                    <summary className='cursor-pointer text-xs font-medium'>Uploaded JSON (preview)</summary>
                    <pre className='mt-2 max-h-64 overflow-auto border bg-background p-3 text-xs'>
                      {JSON.stringify(uploadedJsonPreview, null, 2)}
                    </pre>
                  </details>
                )}
	                {!connectedAccount && (
	                  <p className='text-xs text-amber-600 dark:text-amber-400 mt-2'>
	                    Connect your account to upload products
	                  </p>
	                )}
              </div>
            )}
          </div>
        )}

        {/* UNTP JSON preview (server-prepared, before signing) */}
        {phase !== 'complete' && preparedData?.vcSignablePayload?.payload?.vc && (
          <div className='space-y-2'>
            <div className='space-y-2 p-4 bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-lg'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <div className='text-sm font-semibold'>UNTP preview (what will be signed)</div>
                  <p className='text-xs text-muted-foreground'>
                    This is the UNTP VC JSON-LD generated by the server during “Prepare”, before signing and publishing.
                  </p>
                </div>
                <div className='flex gap-2'>
                  <Button type='button' variant='outline' onClick={handleExportUntpCredentialSubject}>
                    <FileText className='w-4 h-4 mr-2' />
                    Download subject
                  </Button>
                  <Button type='button' variant='outline' onClick={handleExportUntpVcJsonLd}>
                    <FileText className='w-4 h-4 mr-2' />
                    Download VC
                  </Button>
                </div>
              </div>
              <details>
                <summary className='cursor-pointer text-xs font-medium'>VC JSON-LD</summary>
                <pre className='mt-2 max-h-72 overflow-auto border bg-background p-3 text-xs'>
                  {JSON.stringify(preparedData.vcSignablePayload.payload.vc, null, 2)}
                </pre>
              </details>
              <details>
                <summary className='cursor-pointer text-xs font-medium'>credentialSubject</summary>
                <pre className='mt-2 max-h-72 overflow-auto border bg-background p-3 text-xs'>
                  {JSON.stringify(preparedData.vcSignablePayload.payload.vc.credentialSubject, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}

        {/* Form */}
        {phase !== 'complete' && (
          <form onSubmit={handleSubmit} className='space-y-6'>
            {/* Granularity Selector */}
            <div className='space-y-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4'>
              <div className='space-y-2'>
                <Label className='text-sm font-semibold'>Granularity Level (v0.2) *</Label>
                <p className='text-xs text-muted-foreground'>
                  Choose the level of specificity for this passport
                </p>
                <div className='grid grid-cols-3 gap-2'>
                  {(['ProductClass', 'Batch', 'Item'] as Granularity[]).map((g) => (
                    <button
                      key={g}
                      type='button'
                      onClick={() => setFormData({ ...formData, granularity: g })}
                      disabled={isLoading}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        formData.granularity === g
                          ? 'border-blue-600 bg-blue-100 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-700 hover:border-blue-400'
                      }`}>
                      <div className='font-semibold text-sm'>{g}</div>
                      <div className='text-xs text-muted-foreground'>
                        {g === 'ProductClass' && 'Model/SKU'}
                        {g === 'Batch' && 'Production lot'}
                        {g === 'Item' && 'Serialized unit'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Product Fields */}
            <div className='grid grid-cols-2 gap-4'>
              <div className='space-y-2'>
                <Label>Product ID *</Label>
                <Input
                  value={formData.productId}
                  onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
                  placeholder='e.g., GTIN: 0123456789012'
                  disabled={isLoading}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label>Product Name *</Label>
                <Input
                  value={formData.productName}
                  onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                  placeholder='e.g., Wood Table'
                  disabled={isLoading}
                  required
                />
              </div>
              <div className='space-y-2 col-span-2'>
                <Label>Description</Label>
                <Input
                  value={formData.productDescription}
                  onChange={(e) => setFormData({ ...formData, productDescription: e.target.value })}
                  placeholder='Product description'
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Product Images */}
            <div className='space-y-3 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-4'>
              <div className='flex items-start justify-between gap-3'>
                <div className='space-y-1'>
                  <div className='text-sm font-semibold'>Product images (optional)</div>
                  <div className='text-xs text-muted-foreground'>
                    These are shown on the customer page. Images are uploaded to IPFS and referenced in the passport.
                  </div>
                </div>
                <input
                  ref={imageInputRef}
                  type='file'
                  accept='image/*'
                  multiple
                  className='hidden'
                  onChange={async (e) => {
                    const files = e.currentTarget.files;
                    await uploadImagesToIpfs(files);
                    e.currentTarget.value = '';
                  }}
                  disabled={isLoading || imageUploadBusy || !connectedAccount}
                />
              </div>

              <div className='flex flex-wrap gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => imageInputRef.current?.click()}
                  disabled={isLoading || imageUploadBusy || !connectedAccount}>
                  {imageUploadBusy ? (
                    <>
                      <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className='w-4 h-4 mr-2' />
                      Upload images
                    </>
                  )}
                </Button>
                {productImages.length > 0 && (
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => setProductImages([])}
                    disabled={isLoading || imageUploadBusy}>
                    Remove all
                  </Button>
                )}
              </div>

              {!connectedAccount && (
                <div className='text-xs text-amber-600 dark:text-amber-400'>
                  Connect your account to upload images.
                </div>
              )}

              {productImages.length === 0 ? (
                <div className='text-xs text-muted-foreground'>No images uploaded yet.</div>
              ) : (
                <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'>
                      {productImages.map((img, idx) => (
                    <div key={`${img.cid}-${idx}`} className='space-y-2'>
                      <div className='relative'>
                        <img
                          src={img.url || getIPFSGatewayURL(img.cid)}
                          alt={img.alt || img.name || 'Product image'}
                          className='w-full aspect-square object-cover rounded-md border border-gray-200 dark:border-gray-800'
                        />
                        {img.kind === 'primary' && (
                          <div className='absolute top-2 left-2 text-[10px] font-semibold px-2 py-1 rounded-full bg-black/70 text-white'>
                            Cover
                          </div>
                        )}
                      </div>
                      <div className='flex gap-2'>
                        {img.kind !== 'primary' ? (
                          <Button
                            type='button'
                            variant='outline'
                            className='flex-1'
                            onClick={() =>
                              setProductImages((prev) =>
                                prev.map((p, i) => ({
                                  ...p,
                                  kind: i === idx ? 'primary' : 'gallery',
                                }))
                              )
                            }
                            disabled={isLoading || imageUploadBusy}>
                            Set as cover
                          </Button>
                        ) : (
                          <Button type='button' variant='outline' className='flex-1' disabled>
                            Cover image
                          </Button>
                        )}
                        <Button
                          type='button'
                          variant='outline'
                          onClick={() =>
                            setProductImages((prev) => {
                              const next = prev.filter((_, i) => i !== idx);
                              if (!next.some((i) => i.kind === 'primary') && next.length > 0) {
                                next[0] = { ...next[0], kind: 'primary' };
                              }
                              return next;
                            })
                          }
                          disabled={isLoading || imageUploadBusy}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Documents (IPFS) */}
            <div className='space-y-3 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-4'>
              <div className='space-y-1'>
                <div className='text-sm font-semibold'>Documents (optional)</div>
                <div className='text-xs text-muted-foreground'>
                  Upload PDFs and documents to IPFS. They will be referenced in Annex III as compliance docs and user information.
                </div>
              </div>

              <input
                ref={complianceDocsInputRef}
                type='file'
                accept='.pdf,.doc,.docx,.txt,.md,.json'
                multiple
                className='hidden'
                onChange={async (e) => {
                  const files = e.currentTarget.files;
                  await uploadDocumentsToIpfs(files, 'compliance', { docType: 'other', language: undefined });
                  e.currentTarget.value = '';
                }}
                disabled={isLoading || docUploadBusy || !connectedAccount}
              />
              <input
                ref={userInfoDocsInputRef}
                type='file'
                accept='.pdf,.doc,.docx,.txt,.md,.json'
                multiple
                className='hidden'
                onChange={async (e) => {
                  const files = e.currentTarget.files;
                  await uploadDocumentsToIpfs(files, 'user-info', { docType: 'manual', language: 'en' });
                  e.currentTarget.value = '';
                }}
                disabled={isLoading || docUploadBusy || !connectedAccount}
              />

              <div className='flex flex-wrap gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => complianceDocsInputRef.current?.click()}
                  disabled={isLoading || docUploadBusy || !connectedAccount}>
                  {docUploadBusy ? (
                    <>
                      <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className='w-4 h-4 mr-2' />
                      Upload compliance docs
                    </>
                  )}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => userInfoDocsInputRef.current?.click()}
                  disabled={isLoading || docUploadBusy || !connectedAccount}>
                  {docUploadBusy ? (
                    <>
                      <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className='w-4 h-4 mr-2' />
                      Upload manuals / instructions
                    </>
                  )}
                </Button>
                {(complianceDocs.length > 0 || userInfoDocs.length > 0) && (
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => {
                      setComplianceDocs([]);
                      setUserInfoDocs([]);
                    }}
                    disabled={isLoading || docUploadBusy}>
                    Remove all
                  </Button>
                )}
              </div>

              {!connectedAccount && (
                <div className='text-xs text-amber-600 dark:text-amber-400'>
                  Connect your account to upload documents.
                </div>
              )}

              {complianceDocs.length === 0 && userInfoDocs.length === 0 ? (
                <div className='text-xs text-muted-foreground'>No documents uploaded yet.</div>
              ) : (
                <div className='space-y-3'>
                  {complianceDocs.length > 0 && (
                    <div className='space-y-2'>
                      <div className='text-xs font-semibold'>Compliance documents</div>
                      <div className='space-y-2'>
                        {complianceDocs.map((doc, idx) => (
                          <div
                            key={`${doc.cid}-${idx}`}
                            className='flex flex-wrap items-center justify-between gap-2 border bg-background p-2 text-xs'>
                            <div className='min-w-0'>
                              <div className='font-medium truncate'>{doc.title || doc.name || doc.cid}</div>
                              <div className='text-muted-foreground truncate'>
                                {doc.contentType || 'document'} · {Math.max(0, doc.size)} bytes
                              </div>
                            </div>
                            <div className='flex items-center gap-2'>
                              <a className='underline' href={doc.url} target='_blank' rel='noreferrer'>
                                Open
                              </a>
                              <Button
                                type='button'
                                variant='outline'
                                onClick={() => setComplianceDocs((prev) => prev.filter((_, i) => i !== idx))}
                                disabled={isLoading || docUploadBusy}>
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {userInfoDocs.length > 0 && (
                    <div className='space-y-2'>
                      <div className='text-xs font-semibold'>Manuals / instructions</div>
                      <div className='space-y-2'>
                        {userInfoDocs.map((doc, idx) => (
                          <div
                            key={`${doc.cid}-${idx}`}
                            className='flex flex-wrap items-center justify-between gap-2 border bg-background p-2 text-xs'>
                            <div className='min-w-0'>
                              <div className='font-medium truncate'>{doc.title || doc.name || doc.cid}</div>
                              <div className='text-muted-foreground truncate'>
                                {doc.contentType || 'document'} · {Math.max(0, doc.size)} bytes
                              </div>
                            </div>
                            <div className='flex items-center gap-2'>
                              <a className='underline' href={doc.url} target='_blank' rel='noreferrer'>
                                Open
                              </a>
                              <Button
                                type='button'
                                variant='outline'
                                onClick={() => setUserInfoDocs((prev) => prev.filter((_, i) => i !== idx))}
                                disabled={isLoading || docUploadBusy}>
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Granularity-specific Fields */}
            <div className='grid grid-cols-2 gap-4'>
              <div className='space-y-2'>
                <Label>
                  Batch Number {formData.granularity === 'Batch' && <span className='text-red-500'>*</span>}
                </Label>
                <Input
                  value={formData.batchNumber}
                  onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                  placeholder={
                    formData.granularity === 'Batch'
                      ? 'Required for Batch granularity'
                      : 'Leave empty if not applicable'
                  }
                  disabled={isLoading}
                  required={formData.granularity === 'Batch'}
                  className={
                    formData.granularity === 'Batch' && !formData.batchNumber
                      ? 'border-red-500'
                      : ''
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label>
                  Serial Number {formData.granularity === 'Item' && <span className='text-red-500'>*</span>}
                </Label>
                <Input
                  value={formData.serialNumber}
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                  placeholder={
                    formData.granularity === 'Item'
                      ? 'Required for Item granularity'
                      : 'Leave empty if not applicable'
                  }
                  disabled={isLoading}
                  required={formData.granularity === 'Item'}
                  className={
                    formData.granularity === 'Item' && !formData.serialNumber
                      ? 'border-red-500'
                      : ''
                  }
                />
              </div>
            </div>

            {/* Manufacturer Fields */}
            <div className='grid grid-cols-2 gap-4'>
              <div className='space-y-2'>
                <Label>Manufacturer Name *</Label>
                <Input
                  value={formData.manufacturerName}
                  onChange={(e) => setFormData({ ...formData, manufacturerName: e.target.value })}
                  placeholder='e.g., Oak Furniture Co'
                  disabled={isLoading}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label>Manufacturer ID *</Label>
                <Input
                  value={formData.manufacturerIdentifier}
                  onChange={(e) => setFormData({ ...formData, manufacturerIdentifier: e.target.value })}
                  placeholder='e.g., VAT-123456'
                  disabled={isLoading}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label>Manufacturer country *</Label>
                <Input
                  value={formData.manufacturerCountry}
                  onChange={(e) => setFormData({ ...formData, manufacturerCountry: e.target.value })}
                  placeholder='e.g., US (ISO 3166-1 alpha-2)'
                  disabled={isLoading}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label>Facility name *</Label>
                <Input
                  value={formData.manufacturerFacility}
                  onChange={(e) => setFormData({ ...formData, manufacturerFacility: e.target.value })}
                  placeholder='Facility name'
                  disabled={isLoading}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label>Facility ID *</Label>
                <Input
                  value={formData.manufacturerFacilityId}
                  onChange={(e) => setFormData({ ...formData, manufacturerFacilityId: e.target.value })}
                  placeholder='e.g., FAC-IT-MI-001'
                  disabled={isLoading}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label>Facility country *</Label>
                <Input
                  value={formData.facilityCountry}
                  onChange={(e) => setFormData({ ...formData, facilityCountry: e.target.value })}
                  placeholder='e.g., IT (ISO 3166-1 alpha-2)'
                  disabled={isLoading}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label>Facility city *</Label>
                <Input
                  value={formData.facilityCity}
                  onChange={(e) => setFormData({ ...formData, facilityCity: e.target.value })}
                  placeholder='e.g., Milan'
                  disabled={isLoading}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label>Facility address *</Label>
                <Input
                  value={formData.facilityAddress}
                  onChange={(e) => setFormData({ ...formData, facilityAddress: e.target.value })}
                  placeholder='Street and number'
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            {/* Optional extended fields (off-chain) */}
            <div className='space-y-4 bg-gray-50 dark:bg-gray-900 rounded-lg p-4'>
              <div className='space-y-1'>
                <div className='text-sm font-semibold'>Optional Fields</div>
                <div className='text-xs text-muted-foreground'>
                  Public fields stay readable. Restricted fields are stored encrypted inside the VC and can be decrypted with the verify link key.
                </div>
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <Label>Unique Product ID (derived)</Label>
                  <Input value={formData.productId} disabled className='opacity-80' />
                </div>
                <div className='space-y-2'>
                  <Label>Manufacturer Operator ID (derived)</Label>
                  <Input value={formData.manufacturerIdentifier} disabled className='opacity-80' />
                </div>
              </div>

              <div className='space-y-2'>
                <div className='flex items-center gap-2'>
                  <input
                    type='checkbox'
                    id='overrideUniqueProductId'
                    checked={formData.overrideUniqueProductId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        overrideUniqueProductId: e.target.checked,
                        uniqueProductIdOverride: e.target.checked ? formData.uniqueProductIdOverride : '',
                      })
                    }
                    disabled={isLoading}
                    className='rounded'
                  />
                  <Label htmlFor='overrideUniqueProductId' className='text-xs cursor-pointer'>
                    Override unique product ID
                  </Label>
                </div>
                {formData.overrideUniqueProductId && (
                  <Input
                    value={formData.uniqueProductIdOverride}
                    onChange={(e) => setFormData({ ...formData, uniqueProductIdOverride: e.target.value })}
                    placeholder='e.g., URN:..., GTIN:..., SKU:...'
                    disabled={isLoading}
                  />
                )}
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <Label>GTIN</Label>
                  <Input
                    value={formData.annexGtin}
                    onChange={(e) => setFormData({ ...formData, annexGtin: e.target.value })}
                    placeholder='Digits only (8/12/13/14)'
                    disabled={isLoading}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>TARIC Code</Label>
                  <Input
                    value={formData.annexTaricCode}
                    onChange={(e) => setFormData({ ...formData, annexTaricCode: e.target.value })}
                    placeholder='10 digits'
                    disabled={isLoading}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Importer EORI</Label>
                  <Input
                    value={formData.annexImporterEori}
                    onChange={(e) => setFormData({ ...formData, annexImporterEori: e.target.value })}
                    placeholder='e.g., DE1234567890123'
                    disabled={isLoading}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Importer Name</Label>
                  <Input
                    value={formData.annexImporterName}
                    onChange={(e) => setFormData({ ...formData, annexImporterName: e.target.value })}
                    placeholder='Optional'
                    disabled={isLoading}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Importer Country</Label>
                  <Input
                    value={formData.annexImporterCountry}
                    onChange={(e) => setFormData({ ...formData, annexImporterCountry: e.target.value })}
                    placeholder='ISO 3166-1 alpha-2'
                    disabled={isLoading}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>EU Responsible Operator</Label>
                  <Input
                    value={formData.annexResponsibleName}
                    onChange={(e) => setFormData({ ...formData, annexResponsibleName: e.target.value })}
                    placeholder='Name'
                    disabled={isLoading}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Responsible Operator ID</Label>
                  <Input
                    value={formData.annexResponsibleOperatorId}
                    onChange={(e) => setFormData({ ...formData, annexResponsibleOperatorId: e.target.value })}
                    placeholder='Optional'
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <Label>Compliance Docs (one URL per line)</Label>
                  <textarea
                    value={formData.annexComplianceDocUrls}
                    onChange={(e) => setFormData({ ...formData, annexComplianceDocUrls: e.target.value })}
                    placeholder={'https://...\nhttps://...'}
                    disabled={isLoading}
                    className='w-full min-h-[84px] rounded-md border bg-background p-2 text-sm'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>User Info (one URL per line)</Label>
                  <textarea
                    value={formData.annexUserInfoUrls}
                    onChange={(e) => setFormData({ ...formData, annexUserInfoUrls: e.target.value })}
                    placeholder={'https://...\nhttps://...'}
                    disabled={isLoading}
                    className='w-full min-h-[84px] rounded-md border bg-background p-2 text-sm'
                  />
                </div>
              </div>
            </div>

            {/* did:web Issuer Selection */}
            <div className='space-y-4 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4'>
              <div className='space-y-2'>
                <div className='space-y-2'>
                  <Label htmlFor='issuerDid' className='text-sm font-semibold'>
                    Issuer DID (did:web)
                  </Label>
                  <p className='text-xs text-muted-foreground'>
                    Use an organizational did:web identity. You can paste a domain (e.g. <code>example.com</code>) or a URL
                    (e.g. <code>https://example.com</code>) and it will be normalized.
                  </p>
                  <Input
                    id='issuerDid'
                    value={formData.issuerDid}
                    onChange={(e) => setFormData({ ...formData, issuerDid: normalizeDidWebInput(e.target.value) })}
                    placeholder='example.com'
                    disabled={isLoading || lockIssuerDid}
                    className='text-sm'
                    required
                  />
                </div>
              </div>
            </div>

            {/* Submit Buttons */}
            <div className='flex gap-2'>
              <Button
                type='submit'
                disabled={isLoading}
                className='flex-1'>
                {isLoading ? (
                  <>
                    <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                    {phase === 'preparing' && 'Preparing...'}
                    {phase === 'signing' && 'Signing...'}
                    {phase === 'finalizing' && 'Finalizing...'}
                  </>
                ) : (
                  'Create Passport (Hybrid)'
                )}
              </Button>
              {phase !== 'idle' && (
                <Button
                  type='button'
                  variant='outline'
                  onClick={reset}
                  disabled={isLoading}>
                  Reset
                </Button>
              )}
            </div>
          </form>
        )}

        {/* Prepared Data Preview */}
        {preparedData && phase !== 'complete' && (
          <div className='mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg'>
            <h4 className='text-sm font-semibold mb-2'>Preview</h4>
            <div className='text-xs space-y-1'>
              <div><strong>Product:</strong> {preparedData.untpPreview.productName}</div>
              <div><strong>Level:</strong> {preparedData.untpPreview.granularityLevel}</div>
              <div><strong>Record format (advanced):</strong> {preparedData.chainPreview.datasetType}</div>
              {preparedData.chainPreview.subjectIdHash && (
                <div><strong>Subject identifier hash (advanced):</strong> <code className='text-xs'>{preparedData.chainPreview.subjectIdHash}</code></div>
              )}
            </div>
          </div>
        )}

        {/* Info Alert */}
        <Alert>
          <Info className='h-4 w-4' />
          <AlertDescription className='text-xs'>
            <strong>Privacy-preserving flow:</strong> Signing happens in the browser—private keys never leave your device.
            <br />
            Step 1: Server prepares the credential payload (no signing)
            <br />
            Step 2: Browser signs using your account
            <br />
            Step 3: Server publishes the record and registers the public reference
          </AlertDescription>
        </Alert>
    </div>
  );

  if (noCard) {
    return (
      <div className='space-y-6'>
        {content}
      </div>
    );
  }

  return (
    <Card className='bg-gray-200/70 dark:bg-white/5 border-none shadow-none'>
      <CardHeader className='pb-4'>
        <CardTitle className='text-2xl font-medium'>
          Create a product passport
        </CardTitle>
        <p className='text-sm text-muted-foreground'>
          Guided creation: prepare → sign → publish
        </p>
      </CardHeader>
      <CardContent className='space-y-6'>
        {content}
      </CardContent>
    </Card>
  );
}
