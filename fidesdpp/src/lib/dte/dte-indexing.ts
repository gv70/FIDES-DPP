/**
 * DTE indexing helpers
 *
 * Extract product identifiers from UNTP DTE events for resolver-first traceability.
 *
 * @license Apache-2.0
 */

import type { DteIndexRecord, DteProductRole } from './DteIndexStorage';

export interface DteIndexingContext {
  issuerDid: string;
  credentialId: string;
  dteCid: string;
  gatewayUrl?: string;
}

export interface ExtractedProductRef {
  productId: string;
  role: DteProductRole;
}

export function deriveLookupAliases(productId: string): string[] {
  const v = String(productId || '').trim();
  if (!v) return [];

  const out = new Set<string>([v]);

  // Heuristic: derive GTIN:<digits> from GS1 Digital Link URLs like https://id.gs1.org/01/<gtin>/...
  const m = v.match(/\/01\/(\d{8,14})(?:\/|$)/);
  if (m?.[1]) {
    out.add(`GTIN:${m[1]}`);
  }

  // Heuristic: derive SKU:<...> from urn:product:SKU-... etc (no-op but keeps consistent)
  if (v.startsWith('urn:product:')) {
    out.add(v.replace(/^urn:product:/, ''));
  }

  // If already GTIN:<digits>, also add bare digits
  const gtin = v.match(/^GTIN:(\d{8,14})$/i);
  if (gtin?.[1]) out.add(gtin[1]);

  return Array.from(out);
}

export function extractProductRefsFromDteEvent(event: any): ExtractedProductRef[] {
  if (!event || typeof event !== 'object') return [];

  const refs: ExtractedProductRef[] = [];
  const add = (value: any, role: DteProductRole) => {
    const id = typeof value === 'string' ? value.trim() : value?.id ? String(value.id).trim() : '';
    if (!id) return;
    for (const alias of deriveLookupAliases(id)) {
      refs.push({ productId: alias, role });
    }
  };

  const addList = (list: any, role: DteProductRole) => {
    if (!Array.isArray(list)) return;
    for (const item of list) add(item, role);
  };

  // EPC-based lists
  addList(event.outputEPCList, 'output');
  addList(event.inputEPCList, 'input');
  addList(event.epcList, 'epc');
  add(event.parentEPC, 'parent');
  // Some UNTP examples/specs use `childEPCs` rather than `childEPCList`
  addList(event.childEPCList, 'child');
  addList(event.childEPCs, 'child');

  // Quantity lists can reference a productId even when there is no EPC
  const addQuantityList = (list: any) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const pid = item.productId ? String(item.productId).trim() : '';
      if (!pid) continue;
      for (const alias of deriveLookupAliases(pid)) {
        refs.push({ productId: alias, role: 'quantity' });
      }
    }
  };

  addQuantityList(event.quantityList);
  addQuantityList(event.inputQuantityList);
  addQuantityList(event.outputQuantityList);

  // Deduplicate
  const uniq = new Map<string, ExtractedProductRef>();
  for (const r of refs) {
    uniq.set(`${r.productId}::${r.role}`, r);
  }

  return Array.from(uniq.values());
}

export function guessEventType(event: any): string | undefined {
  const types = Array.isArray(event?.type) ? event.type : event?.type ? [event.type] : [];
  const asStrings = types.map((t: any) => String(t)).filter(Boolean);
  const preferred = asStrings.find((t: string) => t.endsWith('Event') && t !== 'Event');
  return preferred || asStrings[0] || undefined;
}

export function guessEventTime(event: any): string | undefined {
  const v = event?.eventTime || event?.event_time || event?.time;
  if (!v) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function buildDteIndexRecords(
  events: any[],
  ctx: DteIndexingContext
): DteIndexRecord[] {
  if (!Array.isArray(events) || events.length === 0) return [];

  const records: DteIndexRecord[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const refs = extractProductRefsFromDteEvent(event);
    if (refs.length === 0) continue;

    const eventId = event?.id ? String(event.id).trim() : `${ctx.credentialId}#event-${i + 1}`;
    const eventType = guessEventType(event);
    const eventTime = guessEventTime(event);

    for (const ref of refs) {
      records.push({
        productId: ref.productId,
        dteCid: ctx.dteCid,
        dteUri: `ipfs://${ctx.dteCid}`,
        gatewayUrl: ctx.gatewayUrl,
        issuerDid: ctx.issuerDid,
        credentialId: ctx.credentialId,
        eventId,
        eventType,
        eventTime,
        role: ref.role,
      });
    }
  }

  return records;
}
