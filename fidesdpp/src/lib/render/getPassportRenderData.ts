/**
 * Server-side render data loader for customer view (/render/:tokenId).
 *
 * Keeps data-fetching (chain + IPFS + DTE discovery) out of React components.
 *
 * @license Apache-2.0
 */

import { PolkadotChainAdapter } from '../chain/PolkadotChainAdapter';
import { createIpfsBackend } from '../ipfs/IpfsStorageFactory';
import { decodeVcJwt } from '../vc/decodeVcJwt';
import { extractDppFromVc } from '../vc/extractDppFromVc';
import type { DigitalProductPassport } from '../untp/generateDppJsonLd';
import dppContractMetadata from '../../contracts/artifacts/dpp_contract/dpp_contract.json';
import { createDteIndexStorage } from '../dte/createDteIndexStorage';
import { deriveLookupAliases, guessEventTime, guessEventType } from '../dte/dte-indexing';
import { getDidWebManager } from '../vc/did-web-manager';
import { buildIssuerDirectory, normalizeH160, type IssuerDirectoryEntry } from '../issuer/issuer-directory';
import { getDtePreview } from '../preview/dtePreviewStore';
import 'server-only';

export type RenderEvidenceLink = { href: string; label?: string };
export type RenderDteEvent = {
  eventType?: string;
  eventTime?: string;
  summary?: string;
  evidence: RenderEvidenceLink[];
  raw?: any;
};
export type RenderDteDetails = {
  cid: string;
  href: string;
  title: string;
  issuerDid: string;
  issuerName: string;
  events: RenderDteEvent[];
  preview?: boolean;
};

export type PassportRenderData = {
  tokenId: string;
  verifyKey?: string;
  requestedVersion?: number;
  onChainVersion?: number;
  datasetUri?: string;
  onChainData: any;
  dpp: DigitalProductPassport;
  issuerIdentity: IssuerDirectoryEntry | null;
  dtes: RenderDteDetails[];
};

function extractEvidenceLinks(obj: any): RenderEvidenceLink[] {
  const out: RenderEvidenceLink[] = [];
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

function eventSummary(ev: any): string {
  const parts: string[] = [];
  const input = Array.isArray(ev?.inputEPCList) ? ev.inputEPCList.length : 0;
  const output = Array.isArray(ev?.outputEPCList) ? ev.outputEPCList.length : 0;
  const qtyIn = Array.isArray(ev?.inputQuantityList) ? ev.inputQuantityList.length : 0;
  const qtyOut = Array.isArray(ev?.outputQuantityList) ? ev.outputQuantityList.length : 0;
  if (input) parts.push(`inputs: ${input}`);
  if (output) parts.push(`outputs: ${output}`);
  if (qtyIn) parts.push(`input quantities: ${qtyIn}`);
  if (qtyOut) parts.push(`output quantities: ${qtyOut}`);
  const location = ev?.readPoint?.id || ev?.bizLocation?.id || ev?.readPoint || ev?.bizLocation;
  if (location) parts.push(`location: ${String(location)}`);
  return parts.join(' · ');
}

export async function getPassportRenderData(input: {
  tokenId: string;
  verifyKey?: string;
  requestedVersion?: number;
  previewDteId?: string;
}): Promise<PassportRenderData> {
  const tokenId = String(input.tokenId || '').trim();
  if (!tokenId) throw new Error('tokenId is required');

  const rpcUrl = process.env.POLKADOT_RPC_URL || process.env.RPC_URL;
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!rpcUrl || !contractAddress) {
    throw new Error('Missing RPC_URL or CONTRACT_ADDRESS');
  }

  const chainAdapter = new PolkadotChainAdapter({
    rpcUrl,
    contractAddress,
    abiPath: process.env.CONTRACT_ABI_PATH || './src/contracts/artifacts/dpp_contract/dpp_contract.json',
    abiJson: dppContractMetadata,
  });

  const onChainData = await chainAdapter.readPassport(tokenId);
  const onChainVersion = Number(onChainData?.version || 1) || 1;

  // Resolve dataset URI for requested version (walk "previousDatasetUri" chain).
  let resolvedDatasetUri: string = String(onChainData?.datasetUri || '');
  const requestedVersion =
    typeof input.requestedVersion === 'number' && Number.isFinite(input.requestedVersion)
      ? input.requestedVersion
      : undefined;

  if (
    typeof requestedVersion === 'number' &&
    requestedVersion >= 1 &&
    requestedVersion <= onChainVersion &&
    requestedVersion !== onChainVersion
  ) {
    const stepsBack = onChainVersion - requestedVersion;
    let currentUri = resolvedDatasetUri;
    for (let i = 0; i < stepsBack; i++) {
      if (!currentUri.startsWith('ipfs://')) break;
      const cid = currentUri.replace('ipfs://', '');
      const ipfsBackend = createIpfsBackend();
      const vcJwtData = await ipfsBackend.retrieveText(cid);
      const vcPayload = decodeVcJwt(vcJwtData.data);
      const subject = (vcPayload as any)?.vc?.credentialSubject || (vcPayload as any)?.credentialSubject;
      const previousUri = subject?.chainAnchor?.previousDatasetUri;
      if (typeof previousUri !== 'string' || !previousUri.startsWith('ipfs://')) break;
      currentUri = previousUri;
    }
    if (currentUri.startsWith('ipfs://')) resolvedDatasetUri = currentUri;
  }

  const ipfsBackend = createIpfsBackend();
  const vcJwtData = await ipfsBackend.retrieveText(resolvedDatasetUri.replace('ipfs://', ''));
  const vcPayload = decodeVcJwt(vcJwtData.data);
  const dpp = extractDppFromVc(vcPayload);

  // Issuer "directory" (best-effort)
  let issuerIdentity: IssuerDirectoryEntry | null = null;
  try {
    const issuerH160 = normalizeH160(String(onChainData?.issuer || ''));
    if (issuerH160) {
      const manager = getDidWebManager();
      await manager.reload();
      const issuers = await manager.listIssuers();
      const directory = buildIssuerDirectory(issuers);
      issuerIdentity = directory.find((entry) => entry.issuerH160s.includes(issuerH160)) || null;
    }
  } catch {
    issuerIdentity = null;
  }

  const renderBaseUrl = (process.env.RENDER_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const dtes: RenderDteDetails[] = [];

  // 1) Optional preview injection (not-yet-published DTE events)
  try {
    const preview = input.previewDteId ? getDtePreview(String(input.previewDteId)) : null;
    if (preview && String(preview.tokenId) === String(tokenId)) {
      const issuerDid = String(preview.issuerDid || 'urn:preview:issuer').trim() || 'urn:preview:issuer';
      const issuerName = String(preview.issuerName || 'Preview issuer').trim() || 'Preview issuer';
      const cid = `preview:${preview.id}`;
      const href = `${renderBaseUrl}/api/render/preview-dte?id=${encodeURIComponent(preview.id)}`;
      const events = (Array.isArray(preview.events) ? preview.events : []).map((ev: any) => ({
        eventType: guessEventType(ev),
        eventTime: guessEventTime(ev),
        summary: eventSummary(ev),
        evidence: extractEvidenceLinks(ev),
        raw: ev,
      }));
      dtes.push({
        cid,
        href,
        title: `DTE (preview)${events[0]?.eventTime ? ` @ ${String(events[0].eventTime)}` : ''}`,
        issuerDid,
        issuerName,
        events,
        preview: true,
      });
    }
  } catch {
    // ignore
  }

  // 2) Discover published DTEs via index (best-effort)
  try {
    const productIdentifier = String((dpp.product as any)?.registeredId || (dpp as any)?.product?.identifier || '').trim();
    if (productIdentifier) {
      const dteIndex = createDteIndexStorage();
      const candidates = deriveLookupAliases(productIdentifier);
      const all = (await Promise.all(candidates.map((id) => dteIndex.listByProductId(id, { limit: 50 })))).flat();

      const byCid = new Map<string, { cid: string; title: string }>();
      for (const r of all) {
        if (!r?.dteCid) continue;
        const when = r.eventTime ? String(r.eventTime) : '';
        const kind = r.eventType ? String(r.eventType) : '';
        const title = `DTE${kind ? ` (${kind})` : ''}${when ? ` @ ${when}` : ''}`;
        if (!byCid.has(r.dteCid)) byCid.set(r.dteCid, { cid: r.dteCid, title });
      }

      // Best-effort: fetch and decode DTE contents (limit to keep page fast)
      const didManager = getDidWebManager();
      await didManager.reload();
      const issuerDirectory = buildIssuerDirectory(await didManager.listIssuers());
      const nameForDid = (did: string): string => {
        const hit = issuerDirectory.find((e) => e.did === did);
        return String(hit?.organizationName || hit?.domain || did).trim() || did;
      };

      const maxDtes = Number(process.env.RENDER_MAX_DTES || 12);
      const toLoad = Array.from(byCid.values()).slice(0, Number.isFinite(maxDtes) ? maxDtes : 12);

      for (const d of toLoad) {
        try {
          const jwtText = (await ipfsBackend.retrieveText(d.cid)).data;
          const payload = decodeVcJwt(jwtText);
          const vc = (payload as any)?.vc || payload;
          const issuerDid = String(
            vc?.issuer?.id ||
              vc?.issuer ||
              (payload as any)?.iss ||
              (payload as any)?.issuer?.id ||
              (payload as any)?.issuer ||
              ''
          ).trim();
          const credentialSubjectRaw = (vc as any)?.credentialSubject ?? (payload as any)?.credentialSubject ?? (payload as any)?.vc?.credentialSubject;
          const subjects = Array.isArray(credentialSubjectRaw)
            ? credentialSubjectRaw
            : credentialSubjectRaw && typeof credentialSubjectRaw === 'object'
              ? Object.values(credentialSubjectRaw as any)
              : [];

          const events = subjects.map((ev: any) => ({
            eventType: guessEventType(ev),
            eventTime: guessEventTime(ev),
            summary: eventSummary(ev),
            evidence: extractEvidenceLinks(ev),
            raw: ev,
          }));

          dtes.push({
            cid: d.cid,
            href: `${renderBaseUrl}/api/untp/dte/vc?cid=${encodeURIComponent(d.cid)}`,
            title: d.title,
            issuerDid: issuerDid || 'urn:unknown:issuer',
            issuerName: nameForDid(issuerDid || 'urn:unknown:issuer'),
            events,
          });
        } catch {
          dtes.push({
            cid: d.cid,
            href: `${renderBaseUrl}/api/untp/dte/vc?cid=${encodeURIComponent(d.cid)}`,
            title: d.title,
            issuerDid: 'urn:unknown:issuer',
            issuerName: 'Unknown issuer',
            events: [],
          });
        }
      }
    }
  } catch {
    // ignore
  }

  // Deduplicate by cid (prefer preview entries first)
  const byCidOut = new Map<string, RenderDteDetails>();
  for (const it of dtes) {
    if (!byCidOut.has(it.cid)) byCidOut.set(it.cid, it);
  }

  return {
    tokenId,
    verifyKey: input.verifyKey,
    requestedVersion,
    onChainVersion,
    datasetUri: resolvedDatasetUri,
    onChainData,
    dpp,
    issuerIdentity,
    dtes: Array.from(byCidOut.values()),
  };
}
