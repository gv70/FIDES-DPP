/**
 * DPP Hybrid Creation Component
 * 
 * Two-phase passport creation with browser-side VC signing
 * 
 * @license Apache-2.0
 */

'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, Info, Upload, FileText, Sparkles } from 'lucide-react';
import { useHybridPassport } from '@/hooks/use-hybrid-passport';
import type { Granularity } from '@/lib/chain/ChainAdapter';
import { testProducts, loadProductFromJson, exportProductToJson, type TestProduct } from '@/data/test-products';
import { useTypink } from 'typink';

interface DppHybridCreateProps {
  /** If true, removes Card wrapper (for use in Dialog) */
  noCard?: boolean;
}

export function DppHybridCreate({ noCard = false }: DppHybridCreateProps) {
  const { phase, preparedData, result, error, createPassport, reset } = useHybridPassport();
  const { connectedAccount } = useTypink();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode] = useState<'template' | 'upload' | 'manual'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');

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
    issuerDid: '',
  });

  // Load template product
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = testProducts.find((p) => p.id === templateId);
    if (template && connectedAccount) {
      const annex = (template.data as any).annexIII || {};
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
        issuerDid: normalizeDidWebInput(template.data.issuerDid || ''),
      });
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
        const productData = loadProductFromJson(jsonString);
        
        if (!productData) {
          setUploadError('Invalid product data. Required fields: productId, productName, granularity, manufacturer.name, manufacturer.identifier');
          return;
        }

        if (connectedAccount) {
          const annex = (productData as any).annexIII || {};
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
            issuerDid: normalizeDidWebInput(productData.issuerDid || ''),
          });
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
    const parseUrls = (text: string): string[] =>
      text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

    const complianceDocUrls = parseUrls(formData.annexComplianceDocUrls);
    const userInfoUrls = parseUrls(formData.annexUserInfoUrls);
    const hasAnnex =
      !!formData.annexGtin ||
      !!formData.annexTaricCode ||
      !!formData.annexImporterEori ||
      !!formData.annexImporterName ||
      !!formData.annexImporterCountry ||
      !!formData.annexResponsibleName ||
      !!formData.annexResponsibleOperatorId ||
      complianceDocUrls.length > 0 ||
      userInfoUrls.length > 0;

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
      },
      ...(hasAnnex && {
        annexIII: {
          ...(formData.overrideUniqueProductId &&
            formData.uniqueProductIdOverride && {
              uniqueProductId: formData.uniqueProductIdOverride,
            }),
          gtin: formData.annexGtin || undefined,
          taricCode: formData.annexTaricCode || undefined,
          ...(complianceDocUrls.length > 0 && {
            complianceDocs: complianceDocUrls.map((url) => ({ type: 'other', url })),
          }),
          ...(userInfoUrls.length > 0 && {
            userInformation: userInfoUrls.map((url) => ({ type: 'manual', url })),
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
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-${formData.productId.replace(/[^a-zA-Z0-9]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parseUrls = (text: string): string[] =>
      text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

    const complianceDocUrls = parseUrls(formData.annexComplianceDocUrls);
    const userInfoUrls = parseUrls(formData.annexUserInfoUrls);
    const hasAnnex =
      !!formData.annexGtin ||
      !!formData.annexTaricCode ||
      !!formData.annexImporterEori ||
      !!formData.annexImporterName ||
      !!formData.annexImporterCountry ||
      !!formData.annexResponsibleName ||
      !!formData.annexResponsibleOperatorId ||
      complianceDocUrls.length > 0 ||
      userInfoUrls.length > 0;

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
      },
      ...(hasAnnex && {
        annexIII: {
          ...(formData.overrideUniqueProductId &&
            formData.uniqueProductIdOverride && {
              uniqueProductId: formData.uniqueProductIdOverride,
            }),
          gtin: formData.annexGtin || undefined,
          taricCode: formData.annexTaricCode || undefined,
          complianceDocs: complianceDocUrls.map((url) => ({ type: 'other', url })),
          userInformation: userInfoUrls.map((url) => ({ type: 'manual', url })),
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
              <span className='text-sm'>Phase 1: Server preparing (no signing)...</span>
            </>
          )}
          {phase === 'signing' && (
            <>
              <Loader2 className='w-4 h-4 animate-spin text-blue-600' />
              <span className='text-sm'>Phase 2: Browser signing VC-JWT...</span>
            </>
          )}
          {phase === 'finalizing' && (
            <>
              <Loader2 className='w-4 h-4 animate-spin text-blue-600' />
              <span className='text-sm'>Phase 3: Server finalizing (IPFS + on-chain)...</span>
            </>
          )}
          {phase === 'complete' && (
            <>
              <CheckCircle className='w-4 h-4 text-green-600' />
              <span className='text-sm'>✓ Passport created successfully!</span>
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
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success Display */}
        {phase === 'complete' && result && (
          <Alert className='bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'>
            <CheckCircle className='h-4 w-4 text-green-600' />
            <AlertTitle>Success!</AlertTitle>
            <AlertDescription className='space-y-1 mt-2'>
	              <div><strong>Token ID:</strong> {result.tokenId}</div>
	              <div><strong>IPFS CID:</strong> {result.ipfsCid}</div>
	              <div><strong>Tx Hash:</strong> <code className='text-xs'>{result.txHash}</code></div>
	              <div><strong>Block:</strong> {result.blockNumber}</div>
	              {result.verifyUrl && (
	                <div>
	                  <strong>Verify URL:</strong>{' '}
	                  <a className='underline' href={result.verifyUrl} target='_blank' rel='noreferrer'>
	                    {result.verifyUrl}
	                  </a>
	                </div>
	              )}
	            </AlertDescription>
	          </Alert>
	        )}

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
                    Connect your wallet first to use templates
                  </p>
                )}
              </div>
            )}

            {/* JSON Upload */}
            {inputMode === 'upload' && (
              <div className='space-y-2 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg'>
                <Label className='text-sm font-semibold'>Upload Product JSON</Label>
                <p className='text-xs text-muted-foreground mb-3'>
                  Upload a JSON file with product data. Required fields: productId, productName, granularity, manufacturer.name, manufacturer.identifier
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
                    <Button
                      type='button'
                      variant='outline'
                      onClick={handleExportJson}
                      disabled={isLoading}>
                      <FileText className='w-4 h-4 mr-2' />
                      Export Current as JSON
                    </Button>
                  )}
                </div>
                {uploadError && (
                  <Alert variant='destructive' className='mt-2'>
                    <XCircle className='h-4 w-4' />
                    <AlertDescription className='text-xs'>{uploadError}</AlertDescription>
                  </Alert>
                )}
	                {!connectedAccount && (
	                  <p className='text-xs text-amber-600 dark:text-amber-400 mt-2'>
	                    Connect your wallet to upload products
	                  </p>
	                )}
              </div>
            )}
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
                <Label>Country</Label>
                <Input
                  value={formData.manufacturerCountry}
                  onChange={(e) => setFormData({ ...formData, manufacturerCountry: e.target.value })}
                  placeholder='e.g., US (ISO 3166-1 alpha-2)'
                  disabled={isLoading}
                />
              </div>
              <div className='space-y-2'>
                <Label>Facility</Label>
                <Input
                  value={formData.manufacturerFacility}
                  onChange={(e) => setFormData({ ...formData, manufacturerFacility: e.target.value })}
                  placeholder='Facility name'
                  disabled={isLoading}
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
                    disabled={isLoading}
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
            <h4 className='text-sm font-semibold mb-2'>Prepared Data (Preview)</h4>
            <div className='text-xs space-y-1'>
              <div><strong>Product:</strong> {preparedData.untpPreview.productName}</div>
              <div><strong>Granularity:</strong> {preparedData.untpPreview.granularityLevel}</div>
              <div><strong>Dataset Type:</strong> {preparedData.chainPreview.datasetType}</div>
              {preparedData.chainPreview.subjectIdHash && (
                <div><strong>Subject ID Hash:</strong> <code className='text-xs'>{preparedData.chainPreview.subjectIdHash}</code></div>
              )}
            </div>
          </div>
        )}

        {/* Info Alert */}
        <Alert>
          <Info className='h-4 w-4' />
          <AlertDescription className='text-xs'>
            <strong>Hybrid Flow:</strong> This component uses a two-phase creation process where private keys never leave the browser.
            <br />
            Phase 1: Server prepares VC payload (no signing)
            <br />
            Phase 2: Browser signs VC using Polkadot wallet
            <br />
            Phase 3: Server uploads to IPFS and registers on-chain
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
          Create Passport (Hybrid v0.2 + VC)
        </CardTitle>
        <p className='text-sm text-muted-foreground'>
          Two-phase creation: server prepares → browser signs VC → server finalizes
        </p>
      </CardHeader>
      <CardContent className='space-y-6'>
        {content}
      </CardContent>
    </Card>
  );
}
