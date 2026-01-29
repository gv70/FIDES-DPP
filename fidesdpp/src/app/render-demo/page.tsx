import Link from 'next/link';
import { guessEventTime, guessEventType } from '@/lib/dte/dte-indexing';
import type { PassportRenderData, RenderDteDetails } from '@/lib/render/getPassportRenderData';
import RenderPassportClient from '../render/[tokenId]/render-passport-client';

import passport103576 from '../../../examples/passport.rmb.103576.trc-20250210.json';
import dte103576 from '../../../examples/dte.rmb.103576.trc-20250210.events.json';
import passportEbag from '../../../examples/passport.rmb.EBAG93N0672L.trc-20250206.json';
import dteEbag from '../../../examples/dte.rmb.EBAG93N0672L.trc-20250206.events.json';

export const dynamic = 'force-dynamic';

function extractEvidenceLinks(obj: any): Array<{ href: string; label?: string }> {
  const out: Array<{ href: string; label?: string }> = [];
  const add = (href: any, label?: any) => {
    const url = typeof href === 'string' ? href.trim() : '';
    if (!url) return;
    out.push({ href: url, ...(label ? { label: String(label) } : {}) });
  };

  const candidates = [obj?.evidence, obj?.supportingDocuments, obj?.documents, obj?.links];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') add(item);
        else add(item?.id || item?.url || item?.href, item?.title || item?.name || item?.label);
      }
    }
  }
  return out;
}

function eventSummary(ev: any, locale: 'en' | 'it'): string {
  const parts: string[] = [];
  const input = Array.isArray(ev?.inputEPCList) ? ev.inputEPCList.length : 0;
  const output = Array.isArray(ev?.outputEPCList) ? ev.outputEPCList.length : 0;
  const qtyIn = Array.isArray(ev?.inputQuantityList) ? ev.inputQuantityList.length : 0;
  const qtyOut = Array.isArray(ev?.outputQuantityList) ? ev.outputQuantityList.length : 0;
  if (input) parts.push(`${locale === 'it' ? 'componenti' : 'components'}: ${input}`);
  if (output) parts.push(`${locale === 'it' ? 'output' : 'outputs'}: ${output}`);
  if (qtyIn) parts.push(`${locale === 'it' ? 'quantità componenti' : 'component quantities'}: ${qtyIn}`);
  if (qtyOut) parts.push(`${locale === 'it' ? 'quantità prodotta' : 'output quantities'}: ${qtyOut}`);
  return parts.join(' · ');
}

function toDemoRenderData(input: {
  tokenId: string;
  passport: any;
  events: any[];
  issuerName: string;
  issuerDid?: string;
  locale?: 'en' | 'it';
}): PassportRenderData {
  const locale = input.locale || 'en';
  const productId = String(input.passport?.productId || '').trim() || 'DEMO-SKU';
  const productName = String(input.passport?.productName || '').trim() || 'Demo product';
  const productDescription = String(input.passport?.productDescription || '').trim() || undefined;
  const batchNumber = String(input.passport?.batchNumber || '').trim() || undefined;
  const serialNumber = String(input.passport?.serialNumber || '').trim() || undefined;

  const manufacturer = input.passport?.manufacturer || {};
  const manufacturerName = String(manufacturer?.name || '').trim() || input.issuerName;
  const manufacturerId = String(manufacturer?.identifier || '').trim() || '';
  const manufacturerCountry = String(manufacturer?.country || '').trim() || '';

  const dpp: any = {
    '@type': 'DigitalProductPassport',
    granularityLevel: String(input.passport?.granularity || 'Batch').toLowerCase(),
    product: {
      '@type': 'Product',
      identifier: productId,
      name: productName,
      ...(productDescription ? { description: productDescription } : {}),
      ...(batchNumber ? { batchNumber } : {}),
      ...(serialNumber ? { serialNumber } : {}),
    },
    manufacturer: {
      '@type': 'Organization',
      name: manufacturerName,
      ...(manufacturerId ? { identifier: manufacturerId } : {}),
      ...(manufacturerCountry ? { country: manufacturerCountry } : {}),
    },
  };

  if (input.passport?.annexIII) {
    dpp.annexIII = { public: input.passport.annexIII };
  }

  const dte: RenderDteDetails = {
    cid: `demo:${input.tokenId}:dte-1`,
    href: '#',
    title: 'Product history (demo)',
    issuerDid: input.issuerDid || 'urn:demo:issuer',
    issuerName: input.issuerName,
    preview: true,
    events: (Array.isArray(input.events) ? input.events : []).map((ev: any) => ({
      eventType: guessEventType(ev),
      eventTime: guessEventTime(ev),
      summary: eventSummary(ev, locale),
      evidence: extractEvidenceLinks(ev),
      raw: ev,
    })),
  };

  const out: PassportRenderData = {
    tokenId: input.tokenId,
    onChainData: {
      tokenId: input.tokenId,
      issuer: '0x0000000000000000000000000000000000000000',
      datasetUri: 'demo://local',
      payloadHash: '0x' + '0'.repeat(64),
      datasetType: 'vc+jwt',
      granularity: String(input.passport?.granularity || 'Batch'),
      status: 'active',
      version: 1,
    },
    datasetUri: 'demo://local',
    dpp,
    issuerIdentity: null,
    dtes: [dte],
  };
  (out as any).__demoLocale = locale;
  return out;
}

export default async function RenderDemoPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = (await props.searchParams) || {};
  const demoRaw = searchParams.demo;
  const demo = (Array.isArray(demoRaw) ? demoRaw[0] : demoRaw) || 'ebag';

  const demos: Record<string, { label: string; data: PassportRenderData }> = {
    ebag: {
      label: 'EBAG93N0672L (demo)',
      data: toDemoRenderData({
        tokenId: 'DEMO-EBAG93N0672L',
        passport: passportEbag,
        events: Array.isArray(dteEbag) ? dteEbag : [],
        issuerName: 'RMB',
        issuerDid: 'did:web:rmb.example',
        locale: 'it',
      }),
    },
    tool: {
      label: '103576 (demo)',
      data: toDemoRenderData({
        tokenId: 'DEMO-103576',
        passport: passport103576,
        events: Array.isArray(dte103576) ? dte103576 : [],
        issuerName: 'RMB',
        issuerDid: 'did:web:rmb.example',
        locale: 'it',
      }),
    },
  };

  const selected = demos[demo] || demos.ebag;

  return (
    <div className='space-y-4'>
      <div className='mx-auto max-w-6xl px-6 pt-6'>
        <div className='rounded-xl border bg-muted/30 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3'>
          <div>
            <div className='text-sm font-medium'>Demo cliente</div>
            <div className='text-xs text-muted-foreground'>
              Questa pagina mostra un’anteprima per il cliente finale usando esempi di DPP + DTE inclusi nel progetto (senza blockchain/IPFS).
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            {Object.entries(demos).map(([key, cfg]) => (
              <Link
                key={key}
                href={`/render-demo?demo=${encodeURIComponent(key)}`}
                className={[
                  'px-3 py-2 text-sm rounded-md border transition',
                  (demo === key ? 'bg-foreground text-background border-foreground' : 'bg-background hover:bg-muted'),
                ].join(' ')}
              >
                {cfg.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <RenderPassportClient data={selected.data} />
    </div>
  );
}
