/**
 * Traceability (DTE) UI
 *
 * User-friendly builder for UNTP Digital Traceability Events linked to an existing DPP.
 * Resolver-first linking: we include the DPP product identifier in the DTE identifier lists,
 * then the backend indexes the DTE by productId.
 *
 * @license Apache-2.0
 */

'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { useTypink } from 'typink';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePilotContext } from '@/hooks/use-pilot-context';
import { toast } from 'sonner';
import { toEvmAddress } from 'dedot/contracts';

type EventsSource = 'builder' | 'json';

type PassportListItem = {
  tokenId: string;
  passport: {
    tokenId: string;
    owner?: string;
    issuer: string;
    datasetUri: string;
    payloadHash: string;
    datasetType: string;
    granularity: string;
    status: string;
    version: number;
  };
};

type PassportsListResponse = {
  success: boolean;
  items?: PassportListItem[];
  error?: string;
};

type PassportExportResponse = {
  success: boolean;
  export?: any;
  error?: string;
};

type ValidateEventsResponse = {
  valid: boolean;
  errors?: any[];
  errorSummary?: string;
  vc?: any;
  schemaMeta?: any;
  error?: string;
  message?: string;
};

type IssueResponse = {
  success: boolean;
  issuerDid?: string;
  jwt?: string;
  payloadHash?: string;
  ipfs?: { cid: string; uri: string; gatewayUrl?: string; backend?: string };
  indexing?: { attempted: boolean; backend?: 'postgres' | 'file'; records?: number; error?: string };
  vc?: any;
  error?: string;
  message?: string;
};

type DteVerifyResponse = {
  valid: boolean;
  checks?: any;
  ipfs?: { cid: string; uri: string; backend?: string; retrievedHash?: string } | null;
  indexing?: { attempted: boolean; records: number; error?: string };
  vc?: any;
  schemaValidation?: any;
  error?: string;
  message?: string;
};

type DteByProductResponse = {
  productId: string;
  candidates: string[];
  count: number;
  dtes: Array<{ cid: string; uri?: string; gatewayUrl?: string | null }>;
  error?: string;
  message?: string;
};

function normalizeDidWebInput(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('did:web:')) return value;
  if (value.startsWith('did:')) return value;
  const withoutScheme = value.replace(/^https?:\/\//i, '');
  const cleaned = withoutScheme.replace(/\/+$/, '');
  const [host, ...pathParts] = cleaned.split('/').filter(Boolean);
  if (!host) return value;
  return `did:web:${host}${pathParts.length ? `:${pathParts.join(':')}` : ''}`;
}

function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function extractEventsFromJson(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.events)) return value.events;
  if (Array.isArray(value?.credentialSubject)) return value.credentialSubject;
  if (Array.isArray(value?.vc?.credentialSubject)) return value.vc.credentialSubject;
  return [];
}

function toIsoLocalNow(): string {
  const d = new Date();
  return d.toISOString();
}

function tzOffsetIso(): string {
  const minutes = -new Date().getTimezoneOffset(); // opposite sign of JS API
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

type EventType = 'ObjectEvent' | 'TransformationEvent' | 'AggregationEvent' | 'TransactionEvent';

type ItemRow = { id: string; name?: string };
type QuantityRow = { productId: string; productName?: string; quantity: string; uom: string };

export default function TraceabilityPage() {
  const { connectedAccount } = useTypink();
  const { pilotDid } = usePilotContext();

  const connectedAddress = String(connectedAccount?.address || '').trim();
  return <TraceabilityPageInner connectedAddress={connectedAddress} pilotDid={pilotDid} />;
}

const TraceabilityPageInner = memo(function TraceabilityPageInner(props: {
  connectedAddress: string;
  pilotDid: string;
}) {
  const { connectedAddress, pilotDid } = props;

  const [issuerDidInput, setIssuerDidInput] = useState<string>(pilotDid || '');
  const issuerDid = useMemo(() => normalizeDidWebInput(issuerDidInput), [issuerDidInput]);

  const [loadingPassports, setLoadingPassports] = useState(false);
  const [passports, setPassports] = useState<PassportListItem[]>([]);
  const [showAllPassports, setShowAllPassports] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string>('');
  const [selectedDpp, setSelectedDpp] = useState<any | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedProductName, setSelectedProductName] = useState<string>('');

  const [eventType, setEventType] = useState<EventType | 'AssociationEvent'>('TransformationEvent');
  const [eventTime, setEventTime] = useState<string>(toIsoLocalNow());
  const [eventTimeZoneOffset, setEventTimeZoneOffset] = useState<string>(tzOffsetIso());
  const [processType, setProcessType] = useState<string>(''); // e.g. "Cell Manufacture"
  const [action, setAction] = useState<string>('add'); // UNTP examples use "add"
  const [disposition, setDisposition] = useState<string>('active');
  const [bizStep, setBizStep] = useState<string>('commissioning');
  const [bizLocation, setBizLocation] = useState<string>(''); // URL/plus-code/etc

  type LinkMode = 'outputEPCList' | 'inputEPCList' | 'epcList' | 'childEPCs' | 'quantityList';
  const [linkMode, setLinkMode] = useState<LinkMode>('outputEPCList');
  const [linkQuantity, setLinkQuantity] = useState<string>('1');
  const [linkUom, setLinkUom] = useState<string>('EA');

  // Guided event fields (UNTP examples)
  const [outputs, setOutputs] = useState<ItemRow[]>([]);
  const [inputs, setInputs] = useState<ItemRow[]>([]);
  const [children, setChildren] = useState<ItemRow[]>([]);
  const [parent, setParent] = useState<ItemRow>({ id: '' });
  const [inputQuantities, setInputQuantities] = useState<QuantityRow[]>([]);
  const [outputQuantities, setOutputQuantities] = useState<QuantityRow[]>([]);
  const [quantities, setQuantities] = useState<QuantityRow[]>([]);

  const addItemRow = (setter: (updater: (prev: ItemRow[]) => ItemRow[]) => void) => {
    setter((prev) => [...prev, { id: '', name: '' }]);
  };

  const addQuantityRow = (setter: (updater: (prev: QuantityRow[]) => QuantityRow[]) => void) => {
    setter((prev) => [...prev, { productId: '', productName: '', quantity: '1', uom: 'EA' }]);
  };

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [validation, setValidation] = useState<ValidateEventsResponse | null>(null);
  const [issueResult, setIssueResult] = useState<IssueResponse | null>(null);
  const [verifyResult, setVerifyResult] = useState<DteVerifyResponse | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<DteByProductResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const [eventsSource, setEventsSource] = useState<EventsSource>('builder');
  const [eventsJsonText, setEventsJsonText] = useState<string>('');
  const [eventsJsonParsed, setEventsJsonParsed] = useState<any[] | null>(null);
  const [eventsJsonError, setEventsJsonError] = useState<string>('');

  const walletEvmAddress = useMemo(() => {
    if (!connectedAddress) return '';
    try {
      const raw = String(connectedAddress).trim();
      if (raw.startsWith('0x') && raw.length === 42) return raw.toLowerCase();
      return String(toEvmAddress(raw)).toLowerCase();
    } catch {
      return '';
    }
  }, [connectedAddress]);

  const myPassports = useMemo(() => {
    if (!walletEvmAddress) return [];
    return passports.filter((it) => {
      const issuer = String(it.passport.issuer || '').toLowerCase();
      const owner = String(it.passport.owner || '').toLowerCase();
      return issuer === walletEvmAddress || owner === walletEvmAddress;
    });
  }, [passports, walletEvmAddress]);

  const selectablePassports = useMemo(
    () => (showAllPassports ? passports : myPassports),
    [showAllPassports, passports, myPassports]
  );

  useEffect(() => {
    if (!connectedAddress) return;
    if (passports.length > 0) return;
    void loadPassports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAddress]);

  useEffect(() => {
    // Choose a sensible default linking field per event type.
    if (eventType === 'TransactionEvent') setLinkMode('quantityList');
    else if (eventType === 'ObjectEvent') setLinkMode('epcList');
    else if (eventType === 'AggregationEvent' || eventType === 'AssociationEvent') setLinkMode('childEPCs');
    else setLinkMode('outputEPCList');
  }, [eventType]);

  const eventTypeHelp = useMemo(() => {
    switch (eventType) {
      case 'TransformationEvent':
        return 'Production step: use inputs to produce one or more outputs (useful to show how the product was made).';
      case 'AssociationEvent':
        return 'Assembly or replacement: attach a component (child) to an asset (parent).';
      case 'AggregationEvent':
        return 'Packing/unpacking: group items into a shipment/container (or reverse).';
      case 'TransactionEvent':
        return 'Sale/shipping: product is transferred between parties (e.g., seller → buyer).';
      case 'ObjectEvent':
      default:
        return 'Inspection/repair/test: record an action performed on an item or a batch.';
    }
  }, [eventType]);

  const buildItem = (id: string, name?: string) => ({
    type: ['Item'],
    id,
    ...(name ? { name } : {}),
  });

  const mapItems = (rows: ItemRow[]): any[] =>
    rows
      .map((r) => ({
        id: String(r.id || '').trim(),
        name: String(r.name || '').trim(),
      }))
      .filter((r) => r.id)
      .map((r) => buildItem(r.id, r.name || undefined));

  const mapQuantities = (rows: QuantityRow[]): any[] =>
    rows
      .map((r) => ({
        productId: String(r.productId || '').trim(),
        productName: String(r.productName || '').trim(),
        quantity: Number(String(r.quantity || '').trim()),
        uom: String(r.uom || '').trim(),
      }))
      .filter((r) => r.productId && Number.isFinite(r.quantity) && r.quantity > 0 && r.uom)
      .map((r) => ({
        productId: r.productId,
        ...(r.productName ? { productName: r.productName } : {}),
        quantity: r.quantity,
        uom: r.uom,
      }));

  const buildEvent = (): any => {
    const eventId =
      (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function')
        ? `urn:uuid:${(crypto as any).randomUUID()}`
        : undefined;

    const types = [String(eventType), 'Event'];
    const event: any = {
      type: types,
      ...(eventId ? { id: eventId } : {}),
      ...(processType.trim() ? { processType: processType.trim() } : {}),
      eventTime,
      eventTimeZoneOffset,
      action: action.trim() || 'add',
      ...(disposition.trim() ? { disposition: disposition.trim() } : {}),
      ...(bizStep.trim() ? { bizStep: bizStep.trim() } : {}),
      ...(bizLocation.trim() ? { bizLocation: bizLocation.trim() } : {}),
    };

    // Standard UNTP property names (as in examples)
    const outItems = mapItems(outputs);
    const inItems = mapItems(inputs);
    const childItems = mapItems(children);
    const parentId = String(parent?.id || '').trim();
    const parentName = String(parent?.name || '').trim();

    if (outItems.length) event.outputEPCList = outItems;
    if (inItems.length) event.inputEPCList = inItems;
    if (childItems.length) event.childEPCs = childItems;
    if (parentId) event.parentEPC = buildItem(parentId, parentName || undefined);

    const q = mapQuantities(quantities);
    const inQ = mapQuantities(inputQuantities);
    const outQ = mapQuantities(outputQuantities);
    if (q.length) event.quantityList = q;
    if (inQ.length) event.inputQuantityList = inQ;
    if (outQ.length) event.outputQuantityList = outQ;

    // Link selected DPP into the chosen field (resolver-first indexing will pick it up)
    if (selectedProductId) {
      const item = buildItem(selectedProductId, selectedProductName || undefined);
      if (linkMode === 'outputEPCList') {
        event.outputEPCList = Array.isArray(event.outputEPCList) ? [item, ...event.outputEPCList] : [item];
      } else if (linkMode === 'inputEPCList') {
        event.inputEPCList = Array.isArray(event.inputEPCList) ? [item, ...event.inputEPCList] : [item];
      } else if (linkMode === 'epcList') {
        event.epcList = Array.isArray(event.epcList) ? [item, ...event.epcList] : [item];
      } else if (linkMode === 'childEPCs') {
        event.childEPCs = Array.isArray(event.childEPCs) ? [item, ...event.childEPCs] : [item];
      } else if (linkMode === 'quantityList') {
        const q = Number(linkQuantity);
        const quantity = Number.isFinite(q) && q > 0 ? q : 1;
        event.quantityList = [
          {
            productId: selectedProductId,
            ...(selectedProductName ? { productName: selectedProductName } : {}),
            quantity,
            uom: linkUom.trim() || 'EA',
          },
        ];
      }
    }

    return event;
  };

  const eventsArray = useMemo(() => [buildEvent()], [
    eventType,
    eventTime,
    eventTimeZoneOffset,
    processType,
    action,
    disposition,
    bizStep,
    bizLocation,
    linkMode,
    linkQuantity,
    linkUom,
    outputs,
    inputs,
    children,
    parent,
    quantities,
    inputQuantities,
    outputQuantities,
    selectedProductId,
    selectedProductName,
  ]);

  const eventsForSubmit = useMemo(() => {
    if (eventsSource === 'json') return Array.isArray(eventsJsonParsed) ? eventsJsonParsed : [];
    return eventsArray;
  }, [eventsArray, eventsJsonParsed, eventsSource]);

  const eventsJsonForSubmitPreview = useMemo(() => JSON.stringify(eventsForSubmit, null, 2), [eventsForSubmit]);

  const loadEventsJson = (rawText: string) => {
    setValidation(null);
    setIssueResult(null);
    setVerifyResult(null);
    setDiscoveryResult(null);

    try {
      const parsed = JSON.parse(rawText);
      const events = extractEventsFromJson(parsed);
      if (!Array.isArray(events) || events.length === 0) {
        throw new Error('No events found. Expected an array, or an object with `events: []`.');
      }
      const normalized = events.filter((e) => e && typeof e === 'object');
      if (normalized.length === 0) {
        throw new Error('Events array is empty after filtering invalid entries.');
      }
      setEventsJsonParsed(normalized);
      setEventsJsonError('');
      setEventsSource('json');
      toast.success(`Loaded ${normalized.length} event(s) from JSON`);
    } catch (e: any) {
      setEventsJsonParsed(null);
      setEventsJsonError(e?.message || 'Invalid JSON');
      toast.error(e?.message || 'Invalid JSON');
    }
  };

  const onUploadEventsJsonFile = async (file: File) => {
    const text = await file.text();
    setEventsJsonText(text);
    loadEventsJson(text);
  };

  const loadPassports = async () => {
    setLoadingPassports(true);
    try {
      const res = await fetch('/api/passports/list?limit=200');
      const json = (await res.json()) as PassportsListResponse;
      if (!json.success) throw new Error(json.error || 'Failed to load passports');
      setPassports(Array.isArray(json.items) ? json.items : []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load passports');
      setPassports([]);
    } finally {
      setLoadingPassports(false);
    }
  };

  const loadSelectedDpp = async (tokenId: string) => {
    setBusy(true);
    setValidation(null);
    setIssueResult(null);
    setVerifyResult(null);
    setDiscoveryResult(null);
    setSelectedDpp(null);
    setSelectedProductId('');
    setSelectedProductName('');
    try {
      const res = await fetch('/api/passports/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tokenId }),
      });
      const json = (await res.json()) as PassportExportResponse;
      if (!json.success) throw new Error(json.error || 'Failed to export passport');

      const dpp = json?.export?.dataset?.vc?.credentialSubject || null;
      setSelectedDpp(dpp);
      const pid = String(dpp?.product?.identifier || '');
      const pname = String(dpp?.product?.name || '');
      setSelectedProductId(pid);
      setSelectedProductName(pname);

      if (pid) {
        // Choose a sensible default link mode based on event type
        if (eventType === 'TransformationEvent') setLinkMode('outputEPCList');
        else if (eventType === 'TransactionEvent') setLinkMode('quantityList');
        else if (eventType === 'AggregationEvent' || eventType === 'AssociationEvent') setLinkMode('childEPCs');
        else setLinkMode('epcList');
      }
      toast.success('Passport loaded');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load selected passport');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const cid = issueResult?.success ? String(issueResult.ipfs?.cid || '').trim() : '';
    if (!cid) return;

    setVerifyResult(null);
    setDiscoveryResult(null);

    void (async () => {
      try {
        const res = await fetch('/api/untp/dte/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cid }),
        });
        const json = (await res.json()) as DteVerifyResponse;
        setVerifyResult(json);
      } catch (e: any) {
        setVerifyResult({ valid: false, error: e?.message || String(e) });
      }

      if (!selectedProductId) return;
      try {
        const res = await fetch(`/api/untp/dte/by-product?productId=${encodeURIComponent(selectedProductId)}&limit=200`);
        const json = (await res.json()) as DteByProductResponse;
        setDiscoveryResult(json);
      } catch (e: any) {
        setDiscoveryResult({
          productId: selectedProductId,
          candidates: [],
          count: 0,
          dtes: [],
          error: e?.message || String(e),
        });
      }
    })();
  }, [issueResult, selectedProductId]);

  useEffect(() => {
    // Keep issuer DID synced with Pilot Mode if user hasn't typed anything else
    if (!pilotDid) return;
    if (issuerDidInput) return;
    setIssuerDidInput(pilotDid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pilotDid]);

  const validate = async () => {
    setBusy(true);
    setIssueResult(null);
    try {
      if (!issuerDid || !issuerDid.startsWith('did:web:')) {
        throw new Error('Issuer identity is required (did:web:...)');
      }

      if (!Array.isArray(eventsForSubmit) || eventsForSubmit.length === 0) {
        throw new Error('No events to validate');
      }

      const res = await fetch('/api/untp/dte/validate-events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          issuerDid,
          events: eventsForSubmit,
        }),
      });
      const json = (await res.json()) as ValidateEventsResponse;
      setValidation(json);
      if (json.valid) toast.success('Validation passed');
      else toast.error('Validation failed');
    } catch (e: any) {
      setValidation({ valid: false, errorSummary: e?.message || String(e) });
      toast.error(e?.message || 'Validation failed');
    } finally {
      setBusy(false);
    }
  };

  const issue = async () => {
    setBusy(true);
    try {
      if (!issuerDid || !issuerDid.startsWith('did:web:')) {
        throw new Error('Issuer identity is required (did:web:...)');
      }

      if (!Array.isArray(eventsForSubmit) || eventsForSubmit.length === 0) {
        throw new Error('No events to publish');
      }

      const res = await fetch('/api/untp/dte/issue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          issuerDid,
          events: eventsForSubmit,
        }),
      });
      const json = (await res.json()) as IssueResponse;
      setIssueResult(json);
      if (!json.success) throw new Error(json.message || json.error || 'Failed to issue DTE');
      toast.success('Event published');
    } catch (e: any) {
      setIssueResult({ success: false, error: e?.message || String(e) });
      toast.error(e?.message || 'Failed to publish event');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='mx-auto max-w-4xl p-6 space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>Product History Events</CardTitle>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='text-sm text-muted-foreground'>
            Record what happens to a product over time (production, assembly, packaging, shipping, inspection…) and link it to an existing passport.
          </div>

          {!connectedAddress && (
            <Alert variant='destructive'>
              <AlertTitle>Account not connected</AlertTitle>
              <AlertDescription>
                Connect your account to list your passports, then select one to link a product history event.
              </AlertDescription>
            </Alert>
          )}

          <div className='space-y-2'>
            <Label htmlFor='dte-issuer-did'>Issuer identity (did:web)</Label>
            <Input
              id='dte-issuer-did'
              value={issuerDidInput}
              onChange={(e) => setIssuerDidInput(e.target.value)}
              placeholder='did:web:fidesdpp.xyz (or domain like fidesdpp.xyz)'
              disabled={busy}
            />
            {pilotDid && (
              <div className='text-xs text-muted-foreground'>
                Pilot Mode detected: a ready-to-use issuer is available (<code>{pilotDid}</code>).
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <div className='flex items-center justify-between gap-2'>
              <Label>Select a passport (the product to link)</Label>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={loadPassports}
                disabled={loadingPassports || busy || !connectedAddress}
              >
                {loadingPassports ? 'Loading…' : 'Refresh list'}
              </Button>
            </div>

            <Select
              value={selectedTokenId}
              onValueChange={(v) => {
                setSelectedTokenId(v);
                void loadSelectedDpp(v);
              }}
              disabled={busy || !connectedAddress}
            >
              <SelectTrigger className='bg-white'>
                <SelectValue placeholder={showAllPassports ? 'Select a passport' : 'Select one of your passports'} />
              </SelectTrigger>
              <SelectContent className='max-h-[340px]'>
                {selectablePassports.length === 0 ? (
                  <SelectItem value='__none__' disabled>
                    No passports found (or list not loaded yet)
                  </SelectItem>
                ) : (
                  selectablePassports.map((it) => (
                    <SelectItem key={it.tokenId} value={it.tokenId}>
                      Passport ID {it.tokenId} · {String(it.passport.status)} · v{String(it.passport.version)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {connectedAddress && passports.length > 0 && myPassports.length === 0 && (
              <Alert>
                <AlertTitle>No passports for this account</AlertTitle>
                <AlertDescription>
                  This page only shows passports where your connected account is the issuer or owner. Create a passport first in{' '}
                  <Link className='underline' href='/passports'>/passports</Link> (or switch account), then come back here and refresh.
                  <div className='mt-2 flex flex-wrap gap-2'>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => setShowAllPassports(true)}
                      disabled={busy}
                    >
                      Show all passports
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {showAllPassports && (
              <Alert>
                <AlertTitle>Showing all passports</AlertTitle>
                <AlertDescription>
                  This view includes passports created by other issuers. Use it only to unblock selection during testing.
                  <div className='mt-2 flex flex-wrap gap-2'>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => setShowAllPassports(false)}
                      disabled={busy}
                    >
                      Show only my passports
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {selectedTokenId && (
              <div className='space-y-2'>
                <div className='text-xs text-muted-foreground'>
                  Selected passport ID <code>{selectedTokenId}</code>
                  {selectedProductId ? (
                    <>
                      {' '}→ linked product identifier <code>{selectedProductId}</code>
                      {selectedProductName ? <> ({selectedProductName})</> : null}
                    </>
                  ) : null}
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button asChild type='button' size='sm' variant='outline'>
                    <Link href={`/render/${encodeURIComponent(selectedTokenId)}`} target='_blank' rel='noreferrer'>
                      Open customer view
                    </Link>
                  </Button>
                  <Button asChild type='button' size='sm' variant='outline'>
                    <Link
                      href={`/verification?tokenId=${encodeURIComponent(selectedTokenId)}`}
                      target='_blank'
                      rel='noreferrer'
                    >
                      Open verification
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </div>

            <div className='space-y-4 border rounded-lg p-4'>
              <div className='font-medium'>Event details</div>
              <div className='text-sm text-muted-foreground'>{eventTypeHelp}</div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div className='space-y-2'>
                <Label>What happened?</Label>
                <Select value={String(eventType)} onValueChange={(v) => setEventType(v as any)} disabled={busy}>
                  <SelectTrigger className='bg-white'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='TransformationEvent'>Production / Transformation</SelectItem>
                    <SelectItem value='AssociationEvent'>Assembly / Replacement</SelectItem>
                    <SelectItem value='ObjectEvent'>Inspection / Repair / Test</SelectItem>
                    <SelectItem value='AggregationEvent'>Packing / Unpacking</SelectItem>
                    <SelectItem value='TransactionEvent'>Sale / Shipping</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label>Process name (optional)</Label>
                <Input value={processType} onChange={(e) => setProcessType(e.target.value)} disabled={busy} placeholder='e.g. Packing / Repair / Assembly / Cell manufacture' />
              </div>

              <div className='space-y-2'>
                <Label>Action (optional)</Label>
                <Input value={action} onChange={(e) => setAction(e.target.value)} disabled={busy} placeholder='add' />
                <div className='text-xs text-muted-foreground'>
                  If unsure, keep <code>add</code>.
                </div>
              </div>

              <div className='space-y-2'>
                <Label>When did it happen?</Label>
                <Input value={eventTime} onChange={(e) => setEventTime(e.target.value)} disabled={busy} placeholder='2026-01-12T12:34:56.000Z' />
              </div>

              <div className='space-y-2'>
                <Label>Event time zone offset</Label>
                <Input value={eventTimeZoneOffset} onChange={(e) => setEventTimeZoneOffset(e.target.value)} disabled={busy} placeholder='+01:00' />
              </div>

              <div className='space-y-2'>
                <Label>Status after event (optional)</Label>
                <Input value={disposition} onChange={(e) => setDisposition(e.target.value)} disabled={busy} placeholder='active' />
              </div>

              <div className='space-y-2'>
                <Label>Step (optional)</Label>
                <Input value={bizStep} onChange={(e) => setBizStep(e.target.value)} disabled={busy} placeholder='commissioning' />
              </div>

              <div className='space-y-2 md:col-span-2'>
                <Label>Where did it happen? (optional)</Label>
                <Input value={bizLocation} onChange={(e) => setBizLocation(e.target.value)} disabled={busy} placeholder='e.g. site address, GS1 location URL, plus-code…' />
              </div>
            </div>

              <div className='space-y-2'>
                <Label>How should this event be linked to the selected passport?</Label>
              <Select
                value={linkMode}
                onValueChange={(v) => setLinkMode(v as any)}
                disabled={busy || !selectedProductId}
              >
                <SelectTrigger className='bg-white'>
                  <SelectValue placeholder='Select linking field' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='outputEPCList'>As an output product (produced)</SelectItem>
                  <SelectItem value='inputEPCList'>As an input product (consumed)</SelectItem>
                  <SelectItem value='epcList'>As the item this event is about</SelectItem>
                  <SelectItem value='childEPCs'>As a component / packed item</SelectItem>
                  <SelectItem value='quantityList'>As a quantity line (for bulk)</SelectItem>
                </SelectContent>
              </Select>
              {linkMode === 'quantityList' && (
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <Label>Quantity</Label>
                    <Input value={linkQuantity} onChange={(e) => setLinkQuantity(e.target.value)} disabled={busy} />
                  </div>
                  <div className='space-y-2'>
                    <Label>UOM</Label>
                    <Input value={linkUom} onChange={(e) => setLinkUom(e.target.value)} disabled={busy} placeholder='EA / KGM / ...' />
                  </div>
                </div>
              )}
              {!selectedProductId && (
                <div className='text-xs text-muted-foreground'>
                  Select a passport first to enable linking.
                </div>
              )}
            </div>

            {/* Guided sections by event type */}
            {eventType === 'TransformationEvent' && (
              <div className='space-y-4 border rounded-lg p-4'>
                <div className='font-medium'>Production (inputs → outputs)</div>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <Label>Outputs (products created)</Label>
                      <Button type='button' size='sm' variant='outline' disabled={busy} onClick={() => addItemRow(setOutputs)}>
                        Add output
                      </Button>
                    </div>
                    {outputs.length === 0 && (
                      <div className='text-xs text-muted-foreground'>No outputs added yet.</div>
                    )}
                    {outputs.map((row, idx) => (
                      <div key={`out-${idx}`} className='grid grid-cols-1 md:grid-cols-3 gap-2'>
                        <Input
                          value={row.id}
                          onChange={(e) =>
                            setOutputs((prev) => prev.map((r, i) => (i === idx ? { ...r, id: e.target.value } : r)))
                          }
                          placeholder='Product identifier (URL/URN/GS1 Digital Link)'
                          disabled={busy}
                        />
                        <Input
                          value={row.name || ''}
                          onChange={(e) =>
                            setOutputs((prev) => prev.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))
                          }
                          placeholder='Name (optional)'
                          disabled={busy}
                        />
                        <Button
                          type='button'
                          variant='outline'
                          disabled={busy}
                          onClick={() => setOutputs((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <Label>Inputs (components/materials used)</Label>
                      <Button type='button' size='sm' variant='outline' disabled={busy} onClick={() => addItemRow(setInputs)}>
                        Add input
                      </Button>
                    </div>
                    {inputs.length === 0 && (
                      <div className='text-xs text-muted-foreground'>No inputs added yet.</div>
                    )}
                    {inputs.map((row, idx) => (
                      <div key={`in-${idx}`} className='grid grid-cols-1 md:grid-cols-3 gap-2'>
                        <Input
                          value={row.id}
                          onChange={(e) =>
                            setInputs((prev) => prev.map((r, i) => (i === idx ? { ...r, id: e.target.value } : r)))
                          }
                          placeholder='Product identifier (URL/URN/GS1 Digital Link)'
                          disabled={busy}
                        />
                        <Input
                          value={row.name || ''}
                          onChange={(e) =>
                            setInputs((prev) => prev.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))
                          }
                          placeholder='Name (optional)'
                          disabled={busy}
                        />
                        <Button
                          type='button'
                          variant='outline'
                          disabled={busy}
                          onClick={() => setInputs((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <Label>Input quantities (bulk materials)</Label>
                      <Button type='button' size='sm' variant='outline' disabled={busy} onClick={() => addQuantityRow(setInputQuantities)}>
                        Add
                      </Button>
                    </div>
                    {inputQuantities.length === 0 && (
                      <div className='text-xs text-muted-foreground'>No input quantities added.</div>
                    )}
                    {inputQuantities.map((row, idx) => (
                      <div key={`inq-${idx}`} className='grid grid-cols-1 md:grid-cols-5 gap-2'>
                        <Input
                          value={row.productId}
                          onChange={(e) =>
                            setInputQuantities((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, productId: e.target.value } : r))
                            )
                          }
                          placeholder='productId'
                          disabled={busy}
                        />
                        <Input
                          value={row.productName || ''}
                          onChange={(e) =>
                            setInputQuantities((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, productName: e.target.value } : r))
                            )
                          }
                          placeholder='productName (optional)'
                          disabled={busy}
                        />
                        <Input
                          value={row.quantity}
                          onChange={(e) =>
                            setInputQuantities((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r))
                            )
                          }
                          placeholder='qty'
                          disabled={busy}
                        />
                        <Input
                          value={row.uom}
                          onChange={(e) =>
                            setInputQuantities((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, uom: e.target.value } : r))
                            )
                          }
                          placeholder='uom'
                          disabled={busy}
                        />
                        <Button
                          type='button'
                          variant='outline'
                          disabled={busy}
                          onClick={() => setInputQuantities((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <Label>Output quantities (bulk)</Label>
                      <Button type='button' size='sm' variant='outline' disabled={busy} onClick={() => addQuantityRow(setOutputQuantities)}>
                        Add
                      </Button>
                    </div>
                    {outputQuantities.length === 0 && (
                      <div className='text-xs text-muted-foreground'>No output quantities added.</div>
                    )}
                    {outputQuantities.map((row, idx) => (
                      <div key={`outq-${idx}`} className='grid grid-cols-1 md:grid-cols-5 gap-2'>
                        <Input
                          value={row.productId}
                          onChange={(e) =>
                            setOutputQuantities((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, productId: e.target.value } : r))
                            )
                          }
                          placeholder='productId'
                          disabled={busy}
                        />
                        <Input
                          value={row.productName || ''}
                          onChange={(e) =>
                            setOutputQuantities((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, productName: e.target.value } : r))
                            )
                          }
                          placeholder='productName (optional)'
                          disabled={busy}
                        />
                        <Input
                          value={row.quantity}
                          onChange={(e) =>
                            setOutputQuantities((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r))
                            )
                          }
                          placeholder='qty'
                          disabled={busy}
                        />
                        <Input
                          value={row.uom}
                          onChange={(e) =>
                            setOutputQuantities((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, uom: e.target.value } : r))
                            )
                          }
                          placeholder='uom'
                          disabled={busy}
                        />
                        <Button
                          type='button'
                          variant='outline'
                          disabled={busy}
                          onClick={() => setOutputQuantities((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(eventType === 'AssociationEvent' || eventType === 'AggregationEvent') && (
              <div className='space-y-4 border rounded-lg p-4'>
                <div className='font-medium'>
                  {eventType === 'AssociationEvent'
                    ? 'Assembly / Replacement (asset + components)'
                    : 'Packing / Unpacking (container + items)'}
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <Label>{eventType === 'AssociationEvent' ? 'Parent (main asset)' : 'Container / shipment'}</Label>
                    <Input
                      value={parent.id}
                      onChange={(e) => setParent((p) => ({ ...p, id: e.target.value }))}
                      disabled={busy}
                      placeholder='Identifier (URL/URN/GS1 Digital Link)'
                    />
                    <Input value={parent.name || ''} onChange={(e) => setParent((p) => ({ ...p, name: e.target.value }))} disabled={busy} placeholder='Parent name (optional)' />
                  </div>
                  <div className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <Label>{eventType === 'AssociationEvent' ? 'Components added / replaced' : 'Items inside'}</Label>
                      <Button type='button' size='sm' variant='outline' disabled={busy} onClick={() => addItemRow(setChildren)}>
                        Add child
                      </Button>
                    </div>
                    {children.length === 0 && (
                      <div className='text-xs text-muted-foreground'>No children added yet.</div>
                    )}
                    {children.map((row, idx) => (
                      <div key={`child-${idx}`} className='grid grid-cols-1 md:grid-cols-3 gap-2'>
                        <Input
                          value={row.id}
                          onChange={(e) =>
                            setChildren((prev) => prev.map((r, i) => (i === idx ? { ...r, id: e.target.value } : r)))
                          }
                          placeholder='Identifier (URL/URN/GS1 Digital Link)'
                          disabled={busy}
                        />
                        <Input
                          value={row.name || ''}
                          onChange={(e) =>
                            setChildren((prev) => prev.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))
                          }
                          placeholder='Name (optional)'
                          disabled={busy}
                        />
                        <Button type='button' variant='outline' disabled={busy} onClick={() => setChildren((prev) => prev.filter((_, i) => i !== idx))}>
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {eventType === 'TransactionEvent' && (
              <div className='space-y-4 border rounded-lg p-4'>
                <div className='font-medium'>Sale / Shipping (quantities)</div>
                <div className='text-xs text-muted-foreground'>
                  Use this when the event is about shipping/selling a quantity (e.g., 200 units of a product).
                </div>
                <div className='flex items-center justify-between'>
                  <Label>Quantities</Label>
                  <Button type='button' size='sm' variant='outline' disabled={busy} onClick={() => addQuantityRow(setQuantities)}>
                    Add
                  </Button>
                </div>
                {quantities.length === 0 && (
                  <div className='text-xs text-muted-foreground'>No quantities added.</div>
                )}
                {quantities.map((row, idx) => (
                  <div key={`q-${idx}`} className='grid grid-cols-1 md:grid-cols-5 gap-2'>
                    <Input
                      value={row.productId}
                      onChange={(e) => setQuantities((prev) => prev.map((r, i) => (i === idx ? { ...r, productId: e.target.value } : r)))}
                      placeholder='productId'
                      disabled={busy}
                    />
                    <Input
                      value={row.productName || ''}
                      onChange={(e) => setQuantities((prev) => prev.map((r, i) => (i === idx ? { ...r, productName: e.target.value } : r)))}
                      placeholder='productName (optional)'
                      disabled={busy}
                    />
                    <Input
                      value={row.quantity}
                      onChange={(e) => setQuantities((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))}
                      placeholder='qty'
                      disabled={busy}
                    />
                    <Input
                      value={row.uom}
                      onChange={(e) => setQuantities((prev) => prev.map((r, i) => (i === idx ? { ...r, uom: e.target.value } : r)))}
                      placeholder='uom'
                      disabled={busy}
                    />
                    <Button type='button' variant='outline' disabled={busy} onClick={() => setQuantities((prev) => prev.filter((_, i) => i !== idx))}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {eventType === 'ObjectEvent' && (
              <div className='space-y-4 border rounded-lg p-4'>
                <div className='font-medium'>Inspection / Repair / Test (optional quantities)</div>
                <div className='text-xs text-muted-foreground'>
                  Use quantities for bulk/non-serialised materials. For serialised items, link the passport as "the item this event is about".
                </div>
                <div className='flex items-center justify-between'>
                  <Label>Quantities</Label>
                  <Button type='button' size='sm' variant='outline' disabled={busy} onClick={() => addQuantityRow(setQuantities)}>
                    Add
                  </Button>
                </div>
                {quantities.length === 0 && (
                  <div className='text-xs text-muted-foreground'>No quantities added.</div>
                )}
                {quantities.map((row, idx) => (
                  <div key={`oq-${idx}`} className='grid grid-cols-1 md:grid-cols-5 gap-2'>
                    <Input
                      value={row.productId}
                      onChange={(e) => setQuantities((prev) => prev.map((r, i) => (i === idx ? { ...r, productId: e.target.value } : r)))}
                      placeholder='productId'
                      disabled={busy}
                    />
                    <Input
                      value={row.productName || ''}
                      onChange={(e) => setQuantities((prev) => prev.map((r, i) => (i === idx ? { ...r, productName: e.target.value } : r)))}
                      placeholder='productName (optional)'
                      disabled={busy}
                    />
                    <Input
                      value={row.quantity}
                      onChange={(e) => setQuantities((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))}
                      placeholder='qty'
                      disabled={busy}
                    />
                    <Input
                      value={row.uom}
                      onChange={(e) => setQuantities((prev) => prev.map((r, i) => (i === idx ? { ...r, uom: e.target.value } : r)))}
                      placeholder='uom'
                      disabled={busy}
                    />
                    <Button type='button' variant='outline' disabled={busy} onClick={() => setQuantities((prev) => prev.filter((_, i) => i !== idx))}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className='space-y-2'>
              <Button type='button' variant='outline' size='sm' onClick={() => setShowAdvanced((v) => !v)} disabled={busy}>
                {showAdvanced ? 'Hide advanced fields' : 'Show advanced fields'}
              </Button>
              {showAdvanced && (
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div className='space-y-2 md:col-span-2 border rounded-lg p-4'>
                    <div className='font-medium'>Events JSON input</div>
                    <div className='text-xs text-muted-foreground'>
                      Use the builder above, or upload/paste a JSON array (or an object with <code>events</code>).
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                      <div className='space-y-2'>
                        <Label>Mode</Label>
                        <Select value={eventsSource} onValueChange={(v) => setEventsSource(v as EventsSource)} disabled={busy}>
                          <SelectTrigger>
                            <SelectValue placeholder='Select mode' />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='builder'>Use builder-generated events</SelectItem>
                            <SelectItem value='json'>Use uploaded/pasted JSON</SelectItem>
                          </SelectContent>
                        </Select>
                        {eventsSource === 'json' && (
                          <>
                            <Label htmlFor='dte-events-file'>Upload JSON file</Label>
                            <Input
                              id='dte-events-file'
                              type='file'
                              accept='.json,application/json'
                              disabled={busy}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                void onUploadEventsJsonFile(file);
                              }}
                            />
                          </>
                        )}
                      </div>

                      <div className='space-y-2'>
                        <Label htmlFor='dte-events-json'>Events JSON</Label>
                        <Textarea
                          id='dte-events-json'
                          value={eventsJsonText}
                          onChange={(e) => setEventsJsonText(e.target.value)}
                          placeholder='Paste events JSON here...'
                          className='min-h-[140px] font-mono text-xs'
                          disabled={busy || eventsSource !== 'json'}
                        />
                        <div className='flex gap-2'>
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={busy || eventsSource !== 'json' || !eventsJsonText.trim()}
                            onClick={() => loadEventsJson(eventsJsonText)}
                          >
                            Load JSON
                          </Button>
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={busy}
                            onClick={() => {
                              setEventsSource('builder');
                              setEventsJsonError('');
                              toast.success('Using builder events');
                            }}
                          >
                            Use builder
                          </Button>
                        </div>
                        {eventsJsonError && (
                          <div className='text-xs text-destructive whitespace-pre-wrap'>{eventsJsonError}</div>
                        )}
                        {eventsSource === 'json' && eventsJsonParsed && (
                          <div className='text-xs text-muted-foreground'>
                            Loaded: <code>{eventsJsonParsed.length}</code> event(s)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className='space-y-2 md:col-span-2'>
                    <Label>Preview (Events JSON to be submitted)</Label>
                    <Textarea value={eventsJsonForSubmitPreview} readOnly className='min-h-[140px] font-mono text-xs' />
                  </div>
                </div>
              )}
            </div>

            <div className='flex flex-wrap gap-2'>
              <Button type='button' variant='outline' onClick={validate} disabled={busy}>
                Validate
              </Button>
              <Button type='button' onClick={issue} disabled={busy || !selectedProductId}>
                Publish event
              </Button>
            </div>

            {!selectedProductId && (
              <div className='text-xs text-muted-foreground'>
                Link a passport first. The event is indexed by the passport product identifier and (if indexing succeeds) can appear in the customer view under “Product history”.
              </div>
            )}

            {validation && (
              <Alert variant={validation.valid ? 'default' : 'destructive'}>
                <AlertTitle>{validation.valid ? 'Validation passed' : 'Validation failed'}</AlertTitle>
                <AlertDescription className='whitespace-pre-wrap text-xs'>
                  {validation.valid ? 'Schema OK.' : (validation.errorSummary || validation.message || validation.error || 'Invalid')}
                </AlertDescription>
              </Alert>
            )}

            {issueResult && (
              <Alert variant={issueResult.success ? 'default' : 'destructive'}>
                <AlertTitle>{issueResult.success ? 'Published' : 'Publish failed'}</AlertTitle>
                <AlertDescription className='text-xs space-y-1'>
                  {issueResult.success ? (
                    <>
                      <div>
                        Record ID: <code>{issueResult.ipfs?.cid}</code>
                      </div>
                      {issueResult.ipfs?.gatewayUrl && (
                        <div>
                          Gateway: <code>{issueResult.ipfs.gatewayUrl}</code>
                        </div>
                      )}
                      <div className='flex flex-wrap gap-2 pt-1'>
                        {issueResult.ipfs?.cid && (
                          <Button asChild type='button' size='sm' variant='outline'>
                            <Link
                              href={`/api/untp/dte/vc?cid=${encodeURIComponent(issueResult.ipfs.cid)}`}
                              target='_blank'
                              rel='noreferrer'
                            >
                              Open signed credential
                            </Link>
                          </Button>
                        )}
                        {issueResult.ipfs?.gatewayUrl && (
                          <Button asChild type='button' size='sm' variant='outline'>
                            <Link href={issueResult.ipfs.gatewayUrl} target='_blank' rel='noreferrer'>
                              Open gateway
                            </Link>
                          </Button>
                        )}
                        {selectedTokenId && (
                          <Button asChild type='button' size='sm' variant='outline'>
                            <Link href={`/render/${encodeURIComponent(selectedTokenId)}`} target='_blank' rel='noreferrer'>
                              Open customer view
                            </Link>
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className='whitespace-pre-wrap'>{issueResult.message || issueResult.error || 'Failed'}</span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {issueResult?.success && issueResult.ipfs?.cid && (
              <div className='space-y-3 border rounded-lg p-4'>
                <div className='font-medium'>Event checks</div>
                <div className='text-xs text-muted-foreground'>
                  Confirm that the event can be verified and linked back to the selected passport.
                </div>

                {verifyResult && (
                  <Alert variant={verifyResult.valid ? 'default' : 'destructive'}>
                    <AlertTitle>{verifyResult.valid ? 'Checks passed' : 'Checks need attention'}</AlertTitle>
                    <AlertDescription className='text-xs whitespace-pre-wrap'>
                      {verifyResult.error || verifyResult.message ? (
                        verifyResult.message || verifyResult.error
                      ) : (
                        <>
                          <div>
                            Issuer verification:{' '}
                            <span className='font-medium'>
                              {verifyResult.checks?.signature?.passed ? 'OK' : 'FAILED'}
                            </span>
                          </div>
                          <div>
                            Integrity:{' '}
                            <span className='font-medium'>
                              {verifyResult.checks?.integrity?.expectedHash
                                ? (verifyResult.checks?.integrity?.passed ? 'OK' : 'FAILED')
                                : 'SKIPPED'}
                            </span>
                            {!verifyResult.checks?.integrity?.expectedHash ? (
                              <span className='text-muted-foreground'> (optional)</span>
                            ) : null}
                          </div>
                          <div>
                            Data format:{' '}
                            <span className='font-medium'>
                              {verifyResult.checks?.schema?.passed ? 'OK' : 'WARNING'}
                            </span>
                            {!verifyResult.checks?.schema?.passed ? (
                              <span className='text-muted-foreground'>
                                {' '}
                                (this affects interoperability, not basic linking)
                              </span>
                            ) : null}
                          </div>
                        </>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {selectedProductId && discoveryResult && (
                  <Alert variant={discoveryResult.dtes?.some((d) => d.cid === issueResult.ipfs?.cid) ? 'default' : 'destructive'}>
                    <AlertTitle>
                      {discoveryResult.dtes?.some((d) => d.cid === issueResult.ipfs?.cid) ? 'Linked to passport' : 'Not linked to passport'}
                    </AlertTitle>
                    <AlertDescription className='text-xs whitespace-pre-wrap'>
                      Passport product identifier: <code>{selectedProductId}</code>
                      {'\n'}
                      Related events found: {String(discoveryResult.count ?? 0)}
                      {'\n'}
                      {discoveryResult.dtes?.some((d) => d.cid === issueResult.ipfs?.cid)
                        ? 'If indexing succeeds, this event can appear in the customer view under “Product history”.'
                        : 'This event is not discoverable for the selected passport. This is usually a storage/indexing issue in the current environment.'}
                    </AlertDescription>
                  </Alert>
                )}

                {!discoveryResult?.dtes?.some((d) => d.cid === issueResult.ipfs?.cid) && (
                  <Alert>
                    <AlertTitle>What to check</AlertTitle>
                    <AlertDescription className='text-xs whitespace-pre-wrap'>
                      1) Was a passport selected before issuing the event?
                      {'\n'}
                      2) Did the server save the event index (so it can be found later)?
                      {'\n'}
                      {'\n'}
                      Index write (issue):{' '}
                      {issueResult.indexing?.attempted ? (
                        <>
                          attempted · backend={String(issueResult.indexing.backend || 'unknown')} · records={String(issueResult.indexing.records ?? 0)}
                          {issueResult.indexing?.error ? ` · error=${issueResult.indexing.error}` : ''}
                        </>
                      ) : (
                        'not reported'
                      )}
                      {'\n'}
                      Index write (verify):{' '}
                      {verifyResult?.indexing?.attempted ? (
                        <>
                          attempted · records={String(verifyResult.indexing.records ?? 0)}
                          {verifyResult.indexing?.error ? ` · error=${verifyResult.indexing.error}` : ''}
                        </>
                      ) : (
                        'not attempted'
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
