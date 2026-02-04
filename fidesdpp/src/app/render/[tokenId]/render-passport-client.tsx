'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PassportRenderData, RenderDteDetails } from '@/lib/render/getPassportRenderData';
import { CheckCircle2, FileText, History, Package, Factory, ShieldCheck } from 'lucide-react';

type TabKey = 'overview' | 'components' | 'history' | 'trace' | 'documents';
type Locale = 'en' | 'it';
type MobileLevel = 'essential' | 'details' | 'documents';

function TabButton(props: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type='button'
      onClick={props.onClick}
      className={[
        'px-3 py-2 text-sm rounded-md border transition',
        props.active ? 'bg-foreground text-background border-foreground' : 'bg-background hover:bg-muted',
      ].join(' ')}
    >
      {props.label}
      {props.badge ? <span className='ml-2 text-xs opacity-80'>({props.badge})</span> : null}
    </button>
  );
}

function kv(value: any): string {
  const v = String(value ?? '').trim();
  return v || '—';
}

function clampText(text: string, maxLen: number): string {
  const s = String(text || '').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1).trimEnd() + '…';
}

function friendlyEventLabel(rawType: string, locale: Locale): string {
  const t = String(rawType || '').toLowerCase();
  if (t.includes('transformation')) return locale === 'it' ? 'Produzione / trasformazione' : 'Production / transformation';
  if (t.includes('association')) return locale === 'it' ? 'Assemblaggio / sostituzione' : 'Assembly / replacement';
  if (t.includes('aggregation')) return locale === 'it' ? 'Imballaggio / raggruppamento' : 'Packaging / aggregation';
  if (t.includes('transaction')) return locale === 'it' ? 'Spedizione / trasferimento' : 'Shipping / transfer';
  if (t.includes('object')) return locale === 'it' ? 'Controllo / intervento' : 'Inspection / service';
  if (t.includes('event')) return locale === 'it' ? 'Evento' : 'Event';
  return locale === 'it' ? 'Evento' : 'Event';
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitLot(id: string): { code: string; lot?: string } {
  let s = String(id || '').trim();
  if (!s) return { code: '' };

  // Prefer a friendly display for our normalized IDs (e.g. urn:product:SKU#LOT)
  if (s.startsWith('urn:product:')) {
    s = s.slice('urn:product:'.length);
    const [baseRaw, fragRaw] = s.split('#', 2);
    const code = decodeURIComponentSafe(baseRaw || '');
    const lot = fragRaw != null && fragRaw !== '' ? decodeURIComponentSafe(fragRaw) : undefined;
    return { code, lot };
  }

  if (s.startsWith('urn:component:')) {
    s = s.slice('urn:component:'.length);
    const [baseRaw, fragRaw] = s.split('#', 2);
    const code = decodeURIComponentSafe(baseRaw || '');
    const lot = fragRaw != null && fragRaw !== '' ? decodeURIComponentSafe(fragRaw) : undefined;
    return { code, lot };
  }

  const idx = s.indexOf('#');
  if (idx < 0) return { code: s };
  return { code: decodeURIComponentSafe(s.slice(0, idx)), lot: decodeURIComponentSafe(s.slice(idx + 1)) || undefined };
}

function collectComponentsFromDtes(dtes: RenderDteDetails[]): Array<{
  id: string;
  code: string;
  lot?: string;
  name?: string;
  seenIn: number;
}> {
  const map = new Map<string, { id: string; code: string; lot?: string; name?: string; seenIn: number }>();

  for (const dte of dtes || []) {
    for (const ev of dte.events || []) {
      const raw = ev.raw || {};
      const add = (idRaw: any, nameRaw: any) => {
        const id = String(idRaw || '').trim();
        if (!id) return;
        const { code, lot } = splitLot(id);
        const name = String(nameRaw || '').trim() || undefined;
        const existing = map.get(id);
        if (!existing) map.set(id, { id, code, lot, name, seenIn: 1 });
        else {
          existing.seenIn += 1;
          if (!existing.name && name) existing.name = name;
        }
      };

      // Serialized/identifier inputs
      const inputs = Array.isArray(raw?.inputEPCList) ? raw.inputEPCList : [];
      for (const it of inputs) add(it?.id || it, it?.name);

      // Bulk materials/components: in our importer these are `urn:component:...` in quantity lists
      const inputQty = Array.isArray(raw?.inputQuantityList) ? raw.inputQuantityList : [];
      for (const q of inputQty) {
        const pid = String(q?.productId || '').trim();
        if (!pid.startsWith('urn:component:')) continue;
        add(pid, q?.productName);
      }

      const qty = Array.isArray(raw?.quantityList) ? raw.quantityList : [];
      for (const q of qty) {
        const pid = String(q?.productId || '').trim();
        if (!pid.startsWith('urn:component:')) continue;
        add(pid, q?.productName);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code) || String(a.lot || '').localeCompare(String(b.lot || '')));
}

function collectEvidenceFromDtes(dtes: RenderDteDetails[]): Array<{ href: string; label?: string; count: number }> {
  const map = new Map<string, { href: string; label?: string; count: number }>();
  for (const dte of dtes || []) {
    for (const ev of dte.events || []) {
      for (const l of ev.evidence || []) {
        const href = String(l?.href || '').trim();
        if (!href) continue;
        const label = String(l?.label || '').trim() || undefined;
        const existing = map.get(href);
        if (!existing) map.set(href, { href, label, count: 1 });
        else {
          existing.count += 1;
          if (!existing.label && label) existing.label = label;
        }
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.count - a.count) || a.href.localeCompare(b.href));
}

type TraceRow = {
  dateTime: string;
  inventoryCode: string;
  inventoryLot?: string;
  inventoryName?: string;
  change: string;
  adjustment: string;
  process?: string;
  recordCid: string;
  recordHref: string;
  documents: number;
};

function formatIsoMinute(isoLike: string): string {
  const raw = String(isoLike || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  // stable & compact: YYYY-MM-DD HH:mm (UTC)
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function shortenId(raw: string, head = 10, tail = 6): string {
  const s = String(raw || '').trim();
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function toCsv(rows: Array<Record<string, any>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = String(v ?? '');
    const needs = /[",\n]/.test(s);
    const out = s.replace(/"/g, '""');
    return needs ? `"${out}"` : out;
  };
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))];
  return lines.join('\n') + '\n';
}

function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function RenderPassportClient(props: { data: PassportRenderData }) {
  const { data } = props;
  const locale: Locale = ((data as any)?.__demoLocale === 'it' ? 'it' : 'en') as Locale;

  const [tab, setTab] = useState<TabKey>('overview');
  const [mobileLevel, setMobileLevel] = useState<MobileLevel>('essential');

  const productName = kv((data.dpp as any)?.product?.name);
  const productId = kv((data.dpp.product as any)?.registeredId || (data.dpp as any)?.product?.identifier);
  const batchNumber = kv((data.dpp.product as any)?.batchNumber);
  const serialNumber = kv((data.dpp.product as any)?.serialNumber);
  const granularity = kv((data.dpp as any)?.granularityLevel || data.onChainData?.granularity);

  const manufacturerName = kv((data.dpp as any)?.manufacturer?.name);
  const manufacturerId = kv((data.dpp as any)?.manufacturer?.identifier);
  const manufacturerCountry = kv((data.dpp as any)?.manufacturer?.country || (data.dpp as any)?.manufacturer?.addressCountry);

  const status = kv(data.onChainData?.status);
  const version = kv(data.onChainData?.version);
  const datasetUri = kv(data.datasetUri || data.onChainData?.datasetUri);

  const components = useMemo(() => collectComponentsFromDtes(data.dtes || []), [data.dtes]);
  const evidenceLinks = useMemo(() => collectEvidenceFromDtes(data.dtes || []), [data.dtes]);

  const annexPublic = useMemo(() => {
    return (data.dpp as any)?.annexIII?.public || (data.dpp as any)?.annexIII || {};
  }, [data.dpp]);

  const productDocs = useMemo(() => {
    const toLink = (obj: any) => {
      const url = String(obj?.url || obj?.href || '').trim();
      if (!url) return null;
      const title = String(obj?.title || obj?.caption || obj?.name || '').trim() || undefined;
      const kind = String(obj?.type || '').trim() || undefined;
      const language = String(obj?.language || '').trim() || undefined;
      return { url, title, kind, language };
    };

    const complianceRaw = Array.isArray(annexPublic?.complianceDocs) ? annexPublic.complianceDocs : [];
    const userInfoRaw = Array.isArray(annexPublic?.userInformation) ? annexPublic.userInformation : [];

    const compliance = complianceRaw.map(toLink).filter(Boolean) as Array<{ url: string; title?: string; kind?: string; language?: string }>;
    const userInformation = userInfoRaw.map(toLink).filter(Boolean) as Array<{ url: string; title?: string; kind?: string; language?: string }>;

    return { compliance, userInformation };
  }, [annexPublic]);

  const traceRows = useMemo((): TraceRow[] => {
    const rows: TraceRow[] = [];

    for (const dte of data.dtes || []) {
      const recordCid = String(dte.cid || '').trim();
      const recordHref = String(dte.href || '').trim() || '#';

      for (const ev of dte.events || []) {
        const raw = ev.raw || {};
        const dateTime = formatIsoMinute(String(ev.eventTime || raw.eventTime || ''));
        const process = String(raw.processType || raw.bizStep || '').trim() || undefined;
        const docsCount =
          (Array.isArray(ev.evidence) ? ev.evidence.length : 0) +
          (Array.isArray(raw.supportingDocuments) ? raw.supportingDocuments.length : 0);

        const eventLabel = friendlyEventLabel(kv(ev.eventType), locale);

        const outQty = Array.isArray(raw.outputQuantityList) ? raw.outputQuantityList : [];
        const inQty = Array.isArray(raw.inputQuantityList) ? raw.inputQuantityList : [];
        const outEpc = Array.isArray(raw.outputEPCList) ? raw.outputEPCList : [];
        const inEpc = Array.isArray(raw.inputEPCList) ? raw.inputEPCList : [];

        const pushQty = (q: any, sign: '+' | '−') => {
          const pid = String(q?.productId || '').trim();
          if (!pid) return;
          const { code, lot } = splitLot(pid);
          const nm = String(q?.productName || '').trim() || undefined;
          const qty = q?.quantity;
          const uom = String(q?.uom || '').trim();
          const change =
            qty != null && uom
              ? `${sign} ${qty} ${uom}`
              : qty != null
                ? `${sign} ${qty}`
                : sign === '+'
                  ? '+ 1'
                  : '− 1';
          rows.push({
            dateTime,
            inventoryCode: code,
            inventoryLot: lot,
            inventoryName: nm,
            change,
            adjustment: eventLabel,
            process,
            recordCid,
            recordHref,
            documents: docsCount,
          });
        };

        if (outQty.length > 0 || inQty.length > 0) {
          for (const q of outQty) pushQty(q, '+');
          for (const q of inQty) pushQty(q, '−');
          continue;
        }

        const pushItem = (it: any, sign: '+' | '−') => {
          const pid = String(it?.id || it || '').trim();
          if (!pid) return;
          const { code, lot } = splitLot(pid);
          const nm = String(it?.name || '').trim() || undefined;
          rows.push({
            dateTime,
            inventoryCode: code,
            inventoryLot: lot,
            inventoryName: nm,
            change: sign === '+' ? '+ 1' : '− 1',
            adjustment: eventLabel,
            process,
            recordCid,
            recordHref,
            documents: docsCount,
          });
        };

        for (const it of outEpc) pushItem(it, '+');
        for (const it of inEpc) pushItem(it, '−');
      }
    }

    // Newest first
    return rows.sort((a, b) => String(b.dateTime).localeCompare(String(a.dateTime)) || a.inventoryCode.localeCompare(b.inventoryCode));
  }, [data.dtes, locale]);

  const images = useMemo(() => {
    const rawImages = annexPublic?.productImages;
    if (!Array.isArray(rawImages)) return [];
    return rawImages
      .map((img: any) => {
        const url = String(img?.url || '').trim();
        if (!url) return null;
        const alt = String(img?.alt || img?.name || productName || (locale === 'it' ? 'Immagine prodotto' : 'Product image')).trim();
        return { url, alt };
      })
      .filter(Boolean) as Array<{ url: string; alt: string }>;
  }, [annexPublic, locale, productName]);

  const dteCount = data.dtes?.length || 0;
  const eventsCount = (data.dtes || []).reduce((acc, d) => acc + (d.events?.length || 0), 0);

  const latestEventTime = useMemo(() => {
    let best: string | null = null;
    for (const d of data.dtes || []) {
      for (const ev of d.events || []) {
        const t = String(ev.eventTime || '').trim();
        if (!t) continue;
        if (!best || t > best) best = t;
      }
    }
    return best ? formatIsoMinute(best) : '';
  }, [data.dtes]);

  const headerSubtitle = useMemo(() => {
    const parts = [
      productId !== '—' ? `${locale === 'it' ? 'Codice' : 'Code'}: ${productId}` : '',
      batchNumber !== '—' ? `${locale === 'it' ? 'Lotto' : 'Batch'}: ${batchNumber}` : '',
      serialNumber !== '—' ? `${locale === 'it' ? 'Seriale' : 'Serial'}: ${serialNumber}` : '',
    ].filter(Boolean);
    return parts.join(' · ');
  }, [batchNumber, locale, productId, serialNumber]);

  const statusLabel = useMemo(() => {
    const s = String(status || '').toLowerCase();
    if (s === 'active') return locale === 'it' ? 'Verificato' : 'Verified';
    if (!s || s === '—') return '—';
    return locale === 'it' ? 'In revisione' : 'In review';
  }, [locale, status]);

  const statusClass = useMemo(() => {
    const s = String(status || '').toLowerCase();
    if (s === 'active') return 'border-emerald-300 text-emerald-700 bg-emerald-50';
    return 'border-muted';
  }, [status]);

  const trustBadges = useMemo(() => {
    const badges: Array<{ label: string }> = [];
    if (statusLabel && statusLabel !== '—') badges.push({ label: statusLabel });
    if (productDocs.compliance.length > 0) badges.push({ label: locale === 'it' ? 'Certificazioni' : 'Certificates' });
    if (eventsCount > 0) badges.push({ label: locale === 'it' ? 'Tracciabilità' : 'Traceability' });
    if (badges.length < 3 && evidenceLinks.length > 0) badges.push({ label: locale === 'it' ? 'Documenti' : 'Documents' });
    return badges.slice(0, 3);
  }, [evidenceLinks.length, eventsCount, locale, productDocs.compliance.length, statusLabel]);

  const productHeroImage = images[0] || null;
  const hasAnyDocuments = images.length > 0 || evidenceLinks.length > 0 || productDocs.compliance.length > 0 || productDocs.userInformation.length > 0;

  return (
    <div className='fidesdpp-render-square mx-auto max-w-6xl p-4 md:p-6 space-y-6'>
      <style jsx global>{`
        .fidesdpp-render-square,
        .fidesdpp-render-square * {
          border-radius: 0 !important;
        }
      `}</style>
      {/* Mobile-first hero + levels */}
      <div className='md:hidden space-y-4'>
        <Card>
          <CardContent className='p-4 space-y-3'>
            {productHeroImage ? (
              <div className='rounded-lg border overflow-hidden bg-muted'>
                <img src={productHeroImage.url} alt={productHeroImage.alt} className='w-full h-56 object-cover' />
              </div>
            ) : (
              <div className='rounded-lg border bg-muted/40 h-40 flex items-center justify-center text-muted-foreground text-sm'>
                {locale === 'it' ? 'Immagine non disponibile' : 'Image not available'}
              </div>
            )}

            <div className='space-y-1'>
              <div className='text-xs text-muted-foreground'>
                {locale === 'it' ? 'Passaporto Digitale del Prodotto' : 'Digital Product Passport'}
              </div>
              <div className='text-xl font-semibold leading-tight'>{productName}</div>
              <div className='text-sm text-muted-foreground'>{headerSubtitle || '—'}</div>
            </div>

            <div className='flex flex-wrap gap-2'>
              {trustBadges.map((b, idx) => (
                <span key={`${b.label}-${idx}`} className='inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs bg-background'>
                  <CheckCircle2 className='h-3.5 w-3.5 text-emerald-600' />
                  {b.label}
                </span>
              ))}
              {latestEventTime ? (
                <span className='inline-flex items-center rounded-full border px-3 py-1 text-xs bg-background text-muted-foreground'>
                  {locale === 'it' ? 'Aggiornato' : 'Updated'}: {latestEventTime}
                </span>
              ) : null}
            </div>

            <div className='flex gap-2'>
              <Button asChild type='button' variant='outline' size='sm' className='flex-1'>
                <Link href={`/verification?tokenId=${encodeURIComponent(String(data.tokenId))}`} target='_blank' rel='noreferrer'>
                  <ShieldCheck className='h-4 w-4 mr-2' />
                  {locale === 'it' ? 'Verifica' : 'Verify'}
                </Link>
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='flex-1'
                onClick={() => {
                  if (hasAnyDocuments) setMobileLevel('documents');
                  else setMobileLevel('essential');
                }}
              >
                <FileText className='h-4 w-4 mr-2' />
                {locale === 'it' ? 'Documenti' : 'Documents'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className='flex gap-2'>
          <button
            type='button'
            onClick={() => setMobileLevel('essential')}
            className={[
              'flex-1 px-3 py-2 text-sm rounded-md border transition',
              mobileLevel === 'essential' ? 'bg-foreground text-background border-foreground' : 'bg-background hover:bg-muted',
            ].join(' ')}
          >
            {locale === 'it' ? 'Essenziale' : 'Essential'}
          </button>
          <button
            type='button'
            onClick={() => setMobileLevel('details')}
            className={[
              'flex-1 px-3 py-2 text-sm rounded-md border transition',
              mobileLevel === 'details' ? 'bg-foreground text-background border-foreground' : 'bg-background hover:bg-muted',
            ].join(' ')}
          >
            {locale === 'it' ? 'Dettagli' : 'Details'}
          </button>
          <button
            type='button'
            onClick={() => setMobileLevel('documents')}
            className={[
              'flex-1 px-3 py-2 text-sm rounded-md border transition',
              mobileLevel === 'documents' ? 'bg-foreground text-background border-foreground' : 'bg-background hover:bg-muted',
            ].join(' ')}
          >
            {locale === 'it' ? 'Documenti' : 'Documents'}
          </button>
        </div>

        {mobileLevel === 'essential' && (
          <div className='space-y-4'>
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>{locale === 'it' ? 'In breve' : 'At a glance'}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                <div className='text-muted-foreground'>{locale === 'it' ? 'Descrizione' : 'Description'}</div>
                <div className='whitespace-pre-wrap'>
                  {kv(clampText(String((data.dpp as any)?.product?.description || ''), 360)) || '—'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>{locale === 'it' ? 'Materiali / Componenti' : 'Materials / BOM'}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2'>
                {components.length === 0 ? (
                  <div className='text-sm text-muted-foreground'>
                    {locale === 'it' ? 'Nessun componente disponibile per questo lotto.' : 'No components available for this batch.'}
                  </div>
                ) : (
                  <div className='space-y-2'>
                    {components.slice(0, 6).map((c) => (
                      <div key={c.id} className='rounded-lg border p-3'>
                        <div className='font-mono text-sm break-all'>{c.code}</div>
                        <div className='text-xs text-muted-foreground'>
                          {(locale === 'it' ? 'Lotto' : 'Lot')}: <span className='font-mono'>{kv(c.lot)}</span>
                        </div>
                        {c.name ? <div className='text-xs text-muted-foreground'>{c.name}</div> : null}
                      </div>
                    ))}
                    {components.length > 6 ? (
                      <div className='text-xs text-muted-foreground'>
                        {locale === 'it'
                          ? `Mostrati 6 su ${components.length}.`
                          : `Showing 6 of ${components.length}.`}
                      </div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>{locale === 'it' ? 'Tracciabilità' : 'Traceability'}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {traceRows.length === 0 ? (
                  <div className='text-sm text-muted-foreground'>
                    {locale === 'it' ? 'Nessun evento disponibile al momento.' : 'No events available yet.'}
                  </div>
                ) : (
                  <>
                    <div className='flex items-center justify-between gap-3'>
                      <div className='text-xs text-muted-foreground'>
                        {locale === 'it' ? 'Ultimi movimenti' : 'Latest movements'}
                      </div>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => {
                          const safe = String(productId || 'product').replace(/[^A-Za-z0-9_-]+/g, '_');
                          const csv = toCsv(
                            traceRows.map((r) => ({
                              dateTime: r.dateTime,
                              item: r.inventoryName ? `${r.inventoryCode} (${r.inventoryName})` : r.inventoryCode,
                              lot: r.inventoryLot || '',
                              change: r.change,
                              activity: r.adjustment,
                              process: r.process || '',
                              record: r.recordCid,
                              documents: r.documents,
                            }))
                          );
                          downloadTextFile(`${safe}-trace.csv`, csv, 'text/csv;charset=utf-8');
                        }}
                      >
                        {locale === 'it' ? 'CSV' : 'CSV'}
                      </Button>
                    </div>

                    <div className='space-y-2'>
                      {traceRows.slice(0, 8).map((r, idx) => (
                        <div key={`${r.recordCid}-${idx}`} className='rounded-lg border p-3 space-y-1'>
                          <div className='text-xs text-muted-foreground'>{r.dateTime || '—'}</div>
                          <div className='flex items-start justify-between gap-3'>
                            <div className='min-w-0'>
                              <div className='font-mono text-sm break-all'>{r.inventoryCode}</div>
                              {r.inventoryName ? <div className='text-xs text-muted-foreground'>{r.inventoryName}</div> : null}
                            </div>
                            <div className='font-mono text-sm whitespace-nowrap'>{r.change}</div>
                          </div>
                          <div className='flex flex-wrap items-center gap-2'>
                            <span className='inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-background'>
                              {r.adjustment}
                            </span>
                            <span className='text-xs text-muted-foreground'>
                              {(locale === 'it' ? 'Lotto' : 'Lot')}: <span className='font-mono'>{r.inventoryLot || '—'}</span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>{locale === 'it' ? 'Impatto & fine vita' : 'Impact & end-of-life'}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                <div className='text-muted-foreground'>
                  {locale === 'it'
                    ? 'Qui troverai informazioni su impatti, ricambi, riparazione e riciclo quando saranno disponibili.'
                    : 'You will find impact, spare parts, repair, and recycling info here when available.'}
                </div>
                <div className='flex flex-wrap gap-2 text-xs'>
                  <span className='rounded-full border px-2 py-1 bg-background'>{locale === 'it' ? 'Impatto' : 'Impacts'}</span>
                  <span className='rounded-full border px-2 py-1 bg-background'>{locale === 'it' ? 'Ricambi' : 'Spare parts'}</span>
                  <span className='rounded-full border px-2 py-1 bg-background'>{locale === 'it' ? 'Riparazione' : 'Repair'}</span>
                  <span className='rounded-full border px-2 py-1 bg-background'>{locale === 'it' ? 'Riciclo' : 'Recycling'}</span>
                </div>
              </CardContent>
            </Card>

            {productDocs.userInformation.length > 0 ? (
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-base'>{locale === 'it' ? 'Cura / Riparazione' : 'Care / Repair'}</CardTitle>
                </CardHeader>
                <CardContent className='space-y-2'>
                  {productDocs.userInformation.slice(0, 6).map((d) => (
                    <div key={d.url} className='flex items-center justify-between gap-3 rounded-lg border p-3'>
                      <div className='min-w-0'>
                        <div className='text-sm font-medium truncate'>
                          {d.title || (locale === 'it' ? 'Guida' : 'Guide')}
                        </div>
                        <div className='text-xs text-muted-foreground truncate'>{d.url}</div>
                      </div>
                      <Button asChild type='button' variant='outline' size='sm'>
                        <Link href={d.url} target='_blank' rel='noreferrer'>
                          {locale === 'it' ? 'Apri' : 'Open'}
                        </Link>
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}

        {mobileLevel === 'details' && (
          <div className='space-y-4'>
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>{locale === 'it' ? 'Produttore' : 'Manufacturer'}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                <div className='text-base font-semibold'>{manufacturerName}</div>
                <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Partita IVA / ID operatore' : 'VAT / operator ID'}</div>
                <div className='font-mono text-sm break-all'>{manufacturerId}</div>
                <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Paese' : 'Country'}</div>
                <div className='text-sm'>{manufacturerCountry}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>{locale === 'it' ? 'Identificazione' : 'Identification'}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Codice prodotto' : 'Product code'}</div>
                <div className='font-mono text-sm break-all'>{productId}</div>
                <div className='grid grid-cols-2 gap-3'>
                  <div>
                    <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Lotto' : 'Batch'}</div>
                    <div className='font-mono text-sm break-all'>{batchNumber}</div>
                  </div>
                  <div>
                    <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Seriale' : 'Serial'}</div>
                    <div className='font-mono text-sm break-all'>{serialNumber}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>{locale === 'it' ? 'Autenticità' : 'Authenticity'}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='text-muted-foreground'>
                    {locale === 'it' ? 'Stato' : 'Status'}:{' '}
                    <span className={['inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs', statusClass].join(' ')}>
                      <CheckCircle2 className='h-3.5 w-3.5' />
                      {statusLabel}
                    </span>
                  </div>
                  <Button asChild type='button' variant='outline' size='sm'>
                    <Link href={`/verification?tokenId=${encodeURIComponent(String(data.tokenId))}`} target='_blank' rel='noreferrer'>
                      {locale === 'it' ? 'Verifica' : 'Verify'}
                    </Link>
                  </Button>
                </div>
                <details className='text-xs text-muted-foreground'>
                  <summary className='cursor-pointer text-muted-foreground'>{locale === 'it' ? 'Dettagli tecnici' : 'Technical details'}</summary>
                  <div className='mt-2 space-y-2'>
                    <div>
                      <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'ID passaporto' : 'Passport ID'}</div>
                      <div className='font-mono text-sm'>{data.tokenId}</div>
                    </div>
                    <div>
                      <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'URI dataset' : 'Dataset URI'}</div>
                      <div className='font-mono text-xs break-all'>{datasetUri}</div>
                    </div>
                    <div>
                      <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Hash' : 'Hash'}</div>
                      <div className='font-mono text-xs break-all'>{kv(data.onChainData?.payloadHash)}</div>
                    </div>
                    <div>
                      <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Versione' : 'Version'}</div>
                      <div className='font-mono text-sm'>{version}</div>
                    </div>
                    <div>
                      <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Tipo' : 'Type'}</div>
                      <div className='font-mono text-sm'>{granularity}</div>
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>
          </div>
        )}

        {mobileLevel === 'documents' && (
          <div className='space-y-4'>
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>{locale === 'it' ? 'Documenti' : 'Documents'}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='space-y-2'>
                  <div className='text-sm font-medium'>{locale === 'it' ? 'Immagini' : 'Images'}</div>
                  {images.length === 0 ? (
                    <div className='text-sm text-muted-foreground'>{locale === 'it' ? 'Nessuna immagine disponibile.' : 'No images available.'}</div>
                  ) : (
                    <div className='grid grid-cols-2 gap-3'>
                      {images.slice(0, 4).map((img, idx) => (
                        <a key={`${img.url}-${idx}`} href={img.url} target='_blank' rel='noreferrer' className='rounded-lg border overflow-hidden bg-muted'>
                          <img src={img.url} alt={img.alt} className='w-full h-28 object-cover' />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {productDocs.compliance.length > 0 ? (
                  <div className='space-y-2'>
                    <div className='text-sm font-medium'>{locale === 'it' ? 'Certificazioni' : 'Certificates'}</div>
                    <div className='flex flex-col gap-2'>
                      {productDocs.compliance.slice(0, 10).map((d) => (
                        <div key={d.url} className='flex items-center justify-between gap-3 rounded-lg border p-3'>
                          <div className='min-w-0'>
                            <div className='text-sm font-medium truncate'>{d.title || (locale === 'it' ? 'Certificato' : 'Certificate')}</div>
                            <div className='text-xs text-muted-foreground truncate'>{d.url}</div>
                          </div>
                          <Button asChild type='button' variant='outline' size='sm'>
                            <Link href={d.url} target='_blank' rel='noreferrer'>
                              {locale === 'it' ? 'Apri' : 'Open'}
                            </Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {productDocs.userInformation.length > 0 ? (
                  <div className='space-y-2'>
                    <div className='text-sm font-medium'>{locale === 'it' ? 'Istruzioni' : 'Guides & instructions'}</div>
                    <div className='flex flex-col gap-2'>
                      {productDocs.userInformation.slice(0, 10).map((d) => (
                        <div key={d.url} className='flex items-center justify-between gap-3 rounded-lg border p-3'>
                          <div className='min-w-0'>
                            <div className='text-sm font-medium truncate'>{d.title || (locale === 'it' ? 'Documento' : 'Document')}</div>
                            <div className='text-xs text-muted-foreground truncate'>{d.url}</div>
                          </div>
                          <Button asChild type='button' variant='outline' size='sm'>
                            <Link href={d.url} target='_blank' rel='noreferrer'>
                              {locale === 'it' ? 'Apri' : 'Open'}
                            </Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className='space-y-2'>
                  <div className='text-sm font-medium'>
                    {locale === 'it' ? 'Documenti di lotto (eventi)' : 'Batch documents (events)'}
                  </div>
                  {evidenceLinks.length === 0 ? (
                    <div className='text-sm text-muted-foreground'>
                      {locale === 'it' ? 'Nessun documento di lotto trovato negli eventi.' : 'No batch documents found in events.'}
                    </div>
                  ) : (
                    <div className='flex flex-col gap-2'>
                      {evidenceLinks.slice(0, 10).map((l) => (
                        <div key={l.href} className='flex items-center justify-between gap-3 rounded-lg border p-3'>
                          <div className='min-w-0'>
                            <div className='text-sm font-medium truncate'>{l.label || (locale === 'it' ? 'Documento' : 'Document')}</div>
                            <div className='text-xs text-muted-foreground truncate'>{l.href}</div>
                          </div>
                          <Button asChild type='button' variant='outline' size='sm'>
                            <Link href={l.href} target='_blank' rel='noreferrer'>
                              {locale === 'it' ? 'Apri' : 'Open'}
                            </Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Desktop layout (tabs) */}
      <div className='hidden md:block space-y-6'>
        <div className='flex flex-col md:flex-row md:items-start md:justify-between gap-4'>
          <div className='space-y-1'>
            <div className='text-xs text-muted-foreground'>
              {locale === 'it' ? 'Passaporto Digitale del Prodotto' : 'Digital Product Passport'}
            </div>
            <div className='text-2xl font-semibold leading-tight'>{productName}</div>
            <div className='text-sm text-muted-foreground'>{headerSubtitle || '—'}</div>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <span className={['inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm', statusClass].join(' ')}>
              <CheckCircle2 className='h-4 w-4' />
              {statusLabel}
            </span>
            <Button asChild type='button' variant='outline' size='sm'>
              <Link href={`/verification?tokenId=${encodeURIComponent(String(data.tokenId))}`} target='_blank' rel='noreferrer'>
                <ShieldCheck className='h-4 w-4 mr-2' />
                {locale === 'it' ? 'Verifica autenticità' : 'Verify authenticity'}
              </Link>
            </Button>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm text-muted-foreground flex items-center gap-2'>
                <Package className='h-4 w-4' />
                {locale === 'it' ? 'Prodotto' : 'Product'}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-1'>
              <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Codice' : 'Code'}</div>
              <div className='font-mono text-sm break-all'>{productId}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm text-muted-foreground flex items-center gap-2'>
                <Factory className='h-4 w-4' />
                {locale === 'it' ? 'Produttore' : 'Manufacturer'}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-1'>
              <div className='text-base font-semibold'>{manufacturerName}</div>
              <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Partita IVA / ID operatore' : 'VAT / operator ID'}</div>
              <div className='font-mono text-sm break-all'>{manufacturerId}</div>
              <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Paese' : 'Country'}</div>
              <div className='text-sm'>{manufacturerCountry}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm text-muted-foreground flex items-center gap-2'>
                <FileText className='h-4 w-4' />
                {locale === 'it' ? 'Dettagli' : 'Details'}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-1'>
              <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Lotto' : 'Batch'}</div>
              <div className='font-mono text-sm break-all'>{batchNumber}</div>
              <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Seriale' : 'Serial'}</div>
              <div className='font-mono text-sm break-all'>{serialNumber}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm text-muted-foreground flex items-center gap-2'>
                <History className='h-4 w-4' />
                {locale === 'it' ? 'Storia' : 'History'}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-1'>
              <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Eventi registrati' : 'Recorded events'}</div>
              <div className='text-sm font-medium'>{eventsCount}</div>
              <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Documenti collegati' : 'Linked documents'}</div>
              <div className='text-sm font-medium'>{evidenceLinks.length}</div>
            </CardContent>
          </Card>
        </div>

        <div className='flex flex-wrap gap-2'>
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} label={locale === 'it' ? 'Panoramica' : 'Overview'} />
          <TabButton
            active={tab === 'components'}
            onClick={() => setTab('components')}
            label={locale === 'it' ? 'Componenti' : 'Components'}
            badge={String(components.length)}
          />
          <TabButton
            active={tab === 'history'}
            onClick={() => setTab('history')}
            label={locale === 'it' ? 'Storia' : 'History'}
            badge={String(eventsCount)}
          />
          <TabButton
            active={tab === 'trace'}
            onClick={() => setTab('trace')}
            label={locale === 'it' ? 'Tracciabilità' : 'Production trace'}
            badge={String(traceRows.length)}
          />
          <TabButton
            active={tab === 'documents'}
            onClick={() => setTab('documents')}
            label={locale === 'it' ? 'Documenti' : 'Documents'}
            badge={String(Math.max(images.length, evidenceLinks.length, productDocs.compliance.length, productDocs.userInformation.length))}
          />
        </div>

      {tab === 'overview' && (
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
          <Card className='lg:col-span-2'>
            <CardHeader>
              <CardTitle>{locale === 'it' ? 'Panoramica' : 'Overview'}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='text-sm text-muted-foreground'>{locale === 'it' ? 'Descrizione' : 'Description'}</div>
              <div className='text-sm whitespace-pre-wrap'>{kv((data.dpp as any)?.product?.description)}</div>

              <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                <div>
                  <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Codice prodotto' : 'Product code'}</div>
                  <div className='font-mono text-sm break-all'>{productId}</div>
                </div>
                <div>
                  <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Lotto' : 'Batch'}</div>
                  <div className='font-mono text-sm break-all'>{batchNumber}</div>
                </div>
                <div>
                  <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Seriale' : 'Serial'}</div>
                  <div className='font-mono text-sm break-all'>{serialNumber}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{locale === 'it' ? 'Info aggiuntive' : 'More info'}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              <div className='text-muted-foreground'>
                {locale === 'it'
                  ? 'Questa pagina mostra informazioni verificate e documenti collegati al prodotto.'
                  : 'This page shows verified information and documents linked to this product.'}
              </div>
              <details className='text-sm'>
                <summary className='cursor-pointer text-muted-foreground'>
                  {locale === 'it' ? 'Dettagli tecnici' : 'Technical details'}
                </summary>
                <div className='mt-2 space-y-2'>
                  <div>
                    <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'ID passaporto' : 'Passport ID'}</div>
                    <div className='font-mono text-sm'>{data.tokenId}</div>
                  </div>
                  <div>
                    <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Stato (sistema)' : 'Status (system)'}</div>
                    <div className='font-mono text-sm'>{status}</div>
                  </div>
                  <div>
                    <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Versione (sistema)' : 'Version (system)'}</div>
                    <div className='font-mono text-sm'>{version}</div>
                  </div>
                  <div>
                    <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Tipo (sistema)' : 'Type (system)'}</div>
                    <div className='font-mono text-sm'>{granularity}</div>
                  </div>
                  <div>
                    <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'URI dataset (sistema)' : 'Dataset URI (system)'}</div>
                    <div className='font-mono text-xs break-all'>{datasetUri}</div>
                  </div>
                  <div>
                    <div className='text-xs text-muted-foreground'>{locale === 'it' ? 'Hash (sistema)' : 'Hash (system)'}</div>
                    <div className='font-mono text-xs break-all'>{kv(data.onChainData?.payloadHash)}</div>
                  </div>
                </div>
              </details>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'components' && (
        <Card>
          <CardHeader>
            <CardTitle>{locale === 'it' ? 'Componenti' : 'Components'}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='text-sm text-muted-foreground'>
              {locale === 'it'
                ? 'Componenti associati a questo prodotto, basati sugli eventi registrati.'
                : 'Components linked to this product, based on recorded history events.'}
            </div>

            {components.length === 0 ? (
              <div className='text-sm text-muted-foreground'>
                {locale === 'it' ? 'Nessun componente trovato negli eventi collegati.' : 'No components found in linked events.'}
              </div>
            ) : (
              <div className='overflow-x-auto rounded-lg border'>
                <table className='w-full text-sm'>
                  <thead className='bg-muted'>
	                    <tr>
	                      <th className='text-left p-2'>{locale === 'it' ? 'Codice componente' : 'Component code'}</th>
	                      <th className='text-left p-2'>{locale === 'it' ? 'Lotto' : 'Lot'}</th>
	                      <th className='text-left p-2'>{locale === 'it' ? 'Descrizione' : 'Description'}</th>
	                      <th className='text-right p-2'>{locale === 'it' ? 'Eventi' : 'Events'}</th>
	                    </tr>
                  </thead>
                  <tbody>
                    {components.map((c) => (
                      <tr key={c.id} className='border-t'>
                        <td className='p-2 font-mono'>{c.code}</td>
                        <td className='p-2 font-mono'>{kv(c.lot)}</td>
                        <td className='p-2'>{kv(c.name)}</td>
                        <td className='p-2 text-right'>{c.seenIn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'history' && (
        <div className='space-y-4'>
          {(data.dtes || []).length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{locale === 'it' ? 'Storia del prodotto' : 'Product history'}</CardTitle>
              </CardHeader>
              <CardContent className='text-sm text-muted-foreground'>
                {locale === 'it'
                  ? 'Non ci sono ancora eventi disponibili per questo prodotto.'
                  : 'No history events are available for this product yet.'}
              </CardContent>
            </Card>
          ) : (
            (data.dtes || []).map((d) => (
              <Card key={d.cid}>
                <CardHeader className='space-y-1'>
                  <div className='flex items-start justify-between gap-3'>
	                    <div>
	                      <CardTitle>{locale === 'it' ? 'Registro evento' : 'Event record'}</CardTitle>
	                      <div className='text-xs text-muted-foreground'>
	                        {d.preview
	                          ? (locale === 'it' ? 'Anteprima (non pubblicato)' : 'Preview (not published)')
                          : (locale === 'it' ? 'Pubblicato' : 'Published')}{' '}
                        · {d.issuerName}
                      </div>
                    </div>
                    <details className='text-xs text-muted-foreground'>
                      <summary className='cursor-pointer'>{locale === 'it' ? 'Dettagli' : 'Details'}</summary>
                      <div className='mt-2 space-y-2'>
                        <div>
                          <span className='text-muted-foreground'>{locale === 'it' ? 'ID record: ' : 'Record ID: '}</span>
                          <code>{d.cid}</code>
                        </div>
                        <Button asChild type='button' variant='outline' size='sm'>
                          <Link href={d.href} target='_blank' rel='noreferrer'>
                            {locale === 'it' ? 'Apri record firmato' : 'Open signed record'}
                          </Link>
                        </Button>
                      </div>
                    </details>
                  </div>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {d.events.length === 0 ? (
                    <div className='text-sm text-muted-foreground'>
                      {locale === 'it' ? 'Non è stato possibile leggere gli eventi di questo record.' : 'Unable to read events for this record.'}
                    </div>
                  ) : (
                    <div className='space-y-3'>
                      {d.events.slice(0, 50).map((ev, idx) => {
                        const raw = ev.raw || {};
                        const outputs = Array.isArray(raw?.outputEPCList) ? raw.outputEPCList : [];
                        const inputs = Array.isArray(raw?.inputEPCList) ? raw.inputEPCList : [];
                        const qIn = Array.isArray(raw?.inputQuantityList) ? raw.inputQuantityList : [];
                        const qOut = Array.isArray(raw?.outputQuantityList) ? raw.outputQuantityList : [];
                        const evidence = Array.isArray(ev.evidence) ? ev.evidence : [];

	                        const listPreview = (list: any[], max = 3): string => {
	                          const items = list
                            .slice(0, max)
                            .map((i: any) => {
                              const id = String(i?.id || i || '').trim();
                              const name = String(i?.name || '').trim();
                              if (!id && !name) return '';
                              return name ? `${id} (${name})` : id;
                            })
	                            .filter(Boolean);
	                          if (items.length === 0) return '';
	                          const more = list.length > max ? ` +${list.length - max} ${locale === 'it' ? 'altri' : 'more'}` : '';
	                          return `${items.join(', ')}${more}`;
	                        };

	                        const qtyPreview = (list: any[], max = 3): string => {
	                          const items = list
                            .slice(0, max)
                            .map((i: any) => {
                              const pid = String(i?.productId || '').trim();
                              const nm = String(i?.productName || '').trim();
                              const qty = i?.quantity;
                              const uom = String(i?.uom || '').trim();
                              if (!pid) return '';
                              const left = nm ? `${pid} (${nm})` : pid;
                              const right = qty != null && uom ? `${qty} ${uom}` : qty != null ? String(qty) : '';
                              return right ? `${left}: ${right}` : left;
                            })
	                            .filter(Boolean);
	                          if (items.length === 0) return '';
	                          const more = list.length > max ? ` +${list.length - max} ${locale === 'it' ? 'altri' : 'more'}` : '';
	                          return `${items.join(', ')}${more}`;
	                        };

                        return (
                          <div key={`${d.cid}::${idx}`} className='rounded-lg border p-3 space-y-2'>
                            <div className='flex items-start justify-between gap-3'>
                              <div>
                                <div className='font-medium'>{friendlyEventLabel(kv(ev.eventType), locale)}</div>
                                <div className='text-xs text-muted-foreground'>{kv(ev.eventTime)}</div>
                              </div>
                              <div className='text-xs text-muted-foreground'>#{idx + 1}</div>
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-2 gap-2 text-xs'>
                              {outputs.length > 0 && (
                                <div className='md:col-span-2'>
                                  <span className='text-muted-foreground'>{locale === 'it' ? 'Prodotto: ' : 'Product: '}</span>
                                  <code>{listPreview(outputs)}</code>
                                </div>
                              )}
                              {inputs.length > 0 && (
                                <div className='md:col-span-2'>
                                  <span className='text-muted-foreground'>{locale === 'it' ? 'Componenti: ' : 'Components: '}</span>
                                  <code>{listPreview(inputs)}</code>
                                </div>
                              )}
                              {qOut.length > 0 && (
                                <div className='md:col-span-2'>
                                  <span className='text-muted-foreground'>{locale === 'it' ? 'Quantità prodotta: ' : 'Produced quantity: '}</span>
                                  <code>{qtyPreview(qOut)}</code>
                                </div>
                              )}
                              {qIn.length > 0 && (
                                <div className='md:col-span-2'>
                                  <span className='text-muted-foreground'>{locale === 'it' ? 'Quantità componenti: ' : 'Component quantities: '}</span>
                                  <code>{qtyPreview(qIn)}</code>
                                </div>
                              )}
                            </div>

                            {evidence.length > 0 && (
                              <div className='flex flex-wrap gap-2 pt-1'>
                                {evidence.slice(0, 8).map((l, i) => (
                                  <Button asChild key={`evidence-${d.cid}-${idx}-${i}`} type='button' size='sm' variant='outline'>
                                    <Link href={l.href} target='_blank' rel='noreferrer'>
                                      {l.label ? String(l.label) : (locale === 'it' ? 'Documento' : 'Document')}
                                    </Link>
                                  </Button>
                                ))}
                              </div>
                            )}

                            <details className='text-xs'>
                              <summary className='cursor-pointer text-muted-foreground'>
                                {locale === 'it' ? 'Dettagli tecnici' : 'Technical details'}
                              </summary>
                              <pre className='mt-2 whitespace-pre-wrap font-mono text-[11px]'>{JSON.stringify(raw, null, 2)}</pre>
                            </details>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'trace' && (
        <Card>
          <CardHeader className='space-y-2'>
            <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-3'>
              <div>
                <CardTitle>{locale === 'it' ? 'Report di tracciabilità' : 'Production trace report'}</CardTitle>
                <div className='text-xs text-muted-foreground'>
                  {locale === 'it'
                    ? 'Movimenti principali ricavati dagli eventi (produzione, utilizzo componenti, ecc.).'
                    : 'Main movements derived from the recorded events (production, components used, etc.).'}
                </div>
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={traceRows.length === 0}
                onClick={() => {
                  const safe = String(productId || 'product').replace(/[^A-Za-z0-9_-]+/g, '_');
                  const csv = toCsv(
                    traceRows.map((r) => ({
                      dateTime: r.dateTime,
                      item: r.inventoryName ? `${r.inventoryCode} (${r.inventoryName})` : r.inventoryCode,
                      lot: r.inventoryLot || '',
                      change: r.change,
                      activity: r.adjustment,
                      process: r.process || '',
                      record: r.recordCid,
                      documents: r.documents,
                    }))
                  );
                  downloadTextFile(`${safe}-trace.csv`, csv, 'text/csv;charset=utf-8');
                }}
              >
                {locale === 'it' ? 'Esporta CSV' : 'Export CSV'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {traceRows.length === 0 ? (
              <div className='text-sm text-muted-foreground'>
                {locale === 'it'
                  ? 'Nessun dato di tracciabilità disponibile: pubblica almeno un evento per questo prodotto.'
                  : 'No trace data available yet: publish at least one event for this product.'}
              </div>
            ) : (
              <div className='overflow-x-auto rounded-lg border'>
                <table className='w-full text-sm'>
                  <thead className='bg-muted'>
                    <tr>
                      <th className='text-left p-2'>{locale === 'it' ? 'Data/ora' : 'Date/time'}</th>
                      <th className='text-left p-2'>{locale === 'it' ? 'Articolo' : 'Item'}</th>
                      <th className='text-right p-2'>{locale === 'it' ? 'Variazione' : 'Change'}</th>
                      <th className='text-left p-2'>{locale === 'it' ? 'Attività' : 'Activity'}</th>
                      <th className='text-left p-2'>{locale === 'it' ? 'Processo' : 'Process'}</th>
                      <th className='text-left p-2'>{locale === 'it' ? 'Lotto' : 'Lot'}</th>
                      <th className='text-left p-2'>{locale === 'it' ? 'Record' : 'Record'}</th>
                      <th className='text-right p-2'>{locale === 'it' ? 'Doc.' : 'Docs'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traceRows.slice(0, 250).map((r, idx) => (
                      <tr key={`${r.recordCid}-${idx}-${r.inventoryCode}-${r.change}`} className='border-t align-top'>
                        <td className='p-2 whitespace-nowrap text-xs text-muted-foreground'>{r.dateTime || '—'}</td>
                        <td className='p-2 min-w-[320px]'>
                          <div className='font-mono break-all'>{r.inventoryCode || '—'}</div>
                          {r.inventoryName ? <div className='text-xs text-muted-foreground'>{r.inventoryName}</div> : null}
                        </td>
                        <td className='p-2 text-right font-mono whitespace-nowrap'>{r.change}</td>
                        <td className='p-2'>
                          <span className='inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-background'>
                            {r.adjustment}
                          </span>
                        </td>
                        <td className='p-2 text-xs text-muted-foreground'>{r.process || '—'}</td>
                        <td className='p-2 font-mono text-xs'>{r.inventoryLot || '—'}</td>
                        <td className='p-2'>
                          <Button asChild type='button' variant='outline' size='sm'>
                            <Link href={r.recordHref} target='_blank' rel='noreferrer'>
                              {shortenId(r.recordCid) || 'Open'}
                            </Link>
                          </Button>
                        </td>
                        <td className='p-2 text-right font-mono text-xs'>{r.documents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {traceRows.length > 250 ? (
              <div className='mt-2 text-xs text-muted-foreground'>
                {locale === 'it' ? 'Mostrate le prime 250 righe.' : 'Showing the first 250 rows.'}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {tab === 'documents' && (
        <Card>
          <CardHeader>
            <CardTitle>{locale === 'it' ? 'Documenti' : 'Documents'}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='space-y-2'>
              <div className='text-sm font-medium'>{locale === 'it' ? 'Immagini' : 'Images'}</div>
              {images.length === 0 ? (
                <div className='text-sm text-muted-foreground'>{locale === 'it' ? 'Nessuna immagine disponibile.' : 'No images available.'}</div>
              ) : (
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
                  {images.map((img, idx) => (
                    <a
                      key={`${img.url}-${idx}`}
                      href={img.url}
                      target='_blank'
                      rel='noreferrer'
                      className='rounded-lg border overflow-hidden bg-muted'
                    >
                      <img src={img.url} alt={img.alt} className='w-full h-48 object-cover' />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {(productDocs.compliance.length > 0 || productDocs.userInformation.length > 0) && (
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                <div className='space-y-2'>
                  <div className='text-sm font-medium'>{locale === 'it' ? 'Certificazioni' : 'Certificates'}</div>
                  {productDocs.compliance.length === 0 ? (
                    <div className='text-sm text-muted-foreground'>{locale === 'it' ? 'Nessuna certificazione disponibile.' : 'No certificates available.'}</div>
                  ) : (
                    <div className='flex flex-col gap-2'>
                      {productDocs.compliance.slice(0, 10).map((d) => (
                        <div key={d.url} className='flex items-center justify-between gap-3 rounded-lg border p-3'>
                          <div className='min-w-0'>
                            <div className='text-sm font-medium truncate'>{d.title || (locale === 'it' ? 'Certificato' : 'Certificate')}</div>
                            <div className='text-xs text-muted-foreground truncate'>{d.url}</div>
                          </div>
                          <Button asChild type='button' variant='outline' size='sm'>
                            <Link href={d.url} target='_blank' rel='noreferrer'>
                              {locale === 'it' ? 'Apri' : 'Open'}
                            </Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className='space-y-2'>
                  <div className='text-sm font-medium'>{locale === 'it' ? 'Istruzioni / Manuali' : 'Guides & instructions'}</div>
                  {productDocs.userInformation.length === 0 ? (
                    <div className='text-sm text-muted-foreground'>{locale === 'it' ? 'Nessuna istruzione disponibile.' : 'No guides available.'}</div>
                  ) : (
                    <div className='flex flex-col gap-2'>
                      {productDocs.userInformation.slice(0, 10).map((d) => (
                        <div key={d.url} className='flex items-center justify-between gap-3 rounded-lg border p-3'>
                          <div className='min-w-0'>
                            <div className='text-sm font-medium truncate'>{d.title || (locale === 'it' ? 'Documento' : 'Document')}</div>
                            <div className='text-xs text-muted-foreground truncate'>{d.url}</div>
                          </div>
                          <Button asChild type='button' variant='outline' size='sm'>
                            <Link href={d.url} target='_blank' rel='noreferrer'>
                              {locale === 'it' ? 'Apri' : 'Open'}
                            </Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className='space-y-2'>
              <div className='text-sm font-medium'>
                {locale === 'it' ? 'Documenti collegati (es. specifiche di lotto)' : 'Linked documents (e.g. batch specifications)'}
              </div>
              {evidenceLinks.length === 0 ? (
                <div className='text-sm text-muted-foreground'>
                  {locale === 'it' ? 'Nessun documento collegato trovato negli eventi.' : 'No linked documents found in events.'}
                </div>
              ) : (
                <div className='flex flex-col gap-2'>
                  {evidenceLinks.slice(0, 20).map((l) => (
                    <div key={l.href} className='flex items-center justify-between gap-3 rounded-lg border p-3'>
                      <div className='min-w-0'>
                        <div className='text-sm font-medium truncate'>{l.label || (locale === 'it' ? 'Documento' : 'Document')}</div>
                        <div className='text-xs text-muted-foreground truncate'>{l.href}</div>
                      </div>
                      <Button asChild type='button' variant='outline' size='sm'>
                        <Link href={l.href} target='_blank' rel='noreferrer'>
                          {locale === 'it' ? 'Apri' : 'Open'}
                        </Link>
                      </Button>
                    </div>
                  ))}
                  {evidenceLinks.length > 20 && (
                    <div className='text-xs text-muted-foreground'>
                      {locale === 'it' ? 'Mostrati i primi 20 documenti.' : 'Showing the first 20 documents.'}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className='text-xs text-muted-foreground'>
              {locale === 'it'
                ? 'Nota: ulteriori documenti potrebbero essere disponibili in base ai permessi e alle impostazioni di condivisione.'
                : 'Note: additional documents may be available depending on permissions and sharing settings.'}
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
