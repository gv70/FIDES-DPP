'use client';

import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';

export type PassportLookupGranularity = 'ProductClass' | 'Batch' | 'Item';

export function PassportTokenLookup({
  disabled,
  defaultOpen = false,
  title = 'Find by product identifier (SKU/GTIN)',
  onResolvedTokenId,
}: {
  disabled?: boolean;
  defaultOpen?: boolean;
  title?: string;
  onResolvedTokenId: (tokenId: string) => void;
}) {
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string>('');
  const [productLookup, setProductLookup] = useState<{
    productId: string;
    granularity: PassportLookupGranularity;
    batchNumber: string;
    serialNumber: string;
  }>({
    productId: '',
    granularity: 'ProductClass',
    batchNumber: '',
    serialNumber: '',
  });

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

      onResolvedTokenId(String(json.tokenId));
    } catch (e: any) {
      setLookupError(e?.message || 'Lookup failed');
    } finally {
      setLookupBusy(false);
    }
  };

  const needsSecondaryKey =
    (productLookup.granularity === 'Batch' && !productLookup.batchNumber.trim()) ||
    (productLookup.granularity === 'Item' && !productLookup.serialNumber.trim());

  return (
    <details
      className='bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-4'
      open={defaultOpen}
    >
      <summary className='cursor-pointer text-sm font-semibold'>{title}</summary>
      <div className='mt-3 space-y-3'>
        <div className='text-xs text-muted-foreground'>
          Use the same identifier format used when the passport was created (e.g. <code>GTIN:0123456789012</code> or
          your internal SKU).
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
          <div className='space-y-1 md:col-span-2'>
            <Label className='text-xs text-muted-foreground'>Product identifier</Label>
            <Input
              value={productLookup.productId}
              onChange={(e) => setProductLookup((p) => ({ ...p, productId: e.target.value }))}
              placeholder='e.g., GTIN:0123456789012'
              disabled={disabled || lookupBusy}
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
                  granularity: e.target.value as PassportLookupGranularity,
                  batchNumber: '',
                  serialNumber: '',
                }))
              }
              disabled={disabled || lookupBusy}
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
              disabled={disabled || lookupBusy}
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
              disabled={disabled || lookupBusy}
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
            type='button'
            onClick={() => void findByProductId()}
            disabled={disabled || lookupBusy || !productLookup.productId.trim() || needsSecondaryKey}
          >
            {lookupBusy ? 'Searching…' : 'Find passport'}
          </Button>
        </div>
      </div>
    </details>
  );
}

