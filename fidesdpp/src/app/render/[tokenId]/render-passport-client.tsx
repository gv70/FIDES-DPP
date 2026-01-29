'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PassportRenderData, RenderDteDetails } from '@/lib/render/getPassportRenderData';
import { CheckCircle2, FileText, History, Package, Factory, ShieldCheck } from 'lucide-react';

type TabKey = 'overview' | 'components' | 'history' | 'documents';
type Locale = 'en' | 'it';

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

function splitLot(id: string): { code: string; lot?: string } {
  const s = String(id || '').trim();
  if (!s) return { code: '' };
  const idx = s.indexOf('#');
  if (idx < 0) return { code: s };
  return { code: s.slice(0, idx), lot: s.slice(idx + 1) || undefined };
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
      const inputs = Array.isArray(raw?.inputEPCList) ? raw.inputEPCList : [];
      for (const it of inputs) {
        const id = String(it?.id || it || '').trim();
        if (!id) continue;
        const { code, lot } = splitLot(id);
        const name = String(it?.name || '').trim() || undefined;
        const key = id;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, { id, code, lot, name, seenIn: 1 });
        } else {
          existing.seenIn += 1;
          if (!existing.name && name) existing.name = name;
        }
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

export default function RenderPassportClient(props: { data: PassportRenderData }) {
  const { data } = props;
  const locale: Locale = ((data as any)?.__demoLocale === 'it' ? 'it' : 'en') as Locale;

  const [tab, setTab] = useState<TabKey>('overview');

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

  const images = useMemo(() => {
    const annexPublic = (data.dpp as any)?.annexIII?.public || (data.dpp as any)?.annexIII || {};
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
  }, [data.dpp, locale, productName]);

  const dteCount = data.dtes?.length || 0;
  const eventsCount = (data.dtes || []).reduce((acc, d) => acc + (d.events?.length || 0), 0);

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

  return (
    <div className='mx-auto max-w-6xl p-6 space-y-6'>
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
          active={tab === 'documents'}
          onClick={() => setTab('documents')}
          label={locale === 'it' ? 'Documenti' : 'Documents'}
          badge={String(Math.max(images.length, evidenceLinks.length))}
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
  );
}
