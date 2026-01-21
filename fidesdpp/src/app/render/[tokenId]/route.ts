/**
 * Render Route - Human-readable DPP rendering
 * 
 * Provides HTML rendering of Digital Product Passport for a given tokenId.
 * This implements the UNTP "renderMethod" requirement.
 * 
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { PolkadotChainAdapter } from '../../../lib/chain/PolkadotChainAdapter';
import { createIpfsBackend } from '../../../lib/ipfs/IpfsStorageFactory';
import { decodeVcJwt } from '../../../lib/vc/decodeVcJwt';
import { extractDppFromVc } from '../../../lib/vc/extractDppFromVc';
import type { DigitalProductPassport } from '../../../lib/untp/generateDppJsonLd';
import dppContractMetadata from '../../../contracts/artifacts/dpp_contract/dpp_contract.json';
import { createDteIndexStorage } from '../../../lib/dte/createDteIndexStorage';
import { deriveLookupAliases, guessEventTime, guessEventType } from '../../../lib/dte/dte-indexing';
import { getDidWebManager } from '../../../lib/vc/did-web-manager';
import { buildIssuerDirectory, normalizeH160, type IssuerDirectoryEntry } from '../../../lib/issuer/issuer-directory';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tokenId: string }> }
): Promise<NextResponse> {
  const { tokenId } = await context.params;
  const verifyKey = request.nextUrl.searchParams.get('key') || undefined;
  const requestedVersionRaw = request.nextUrl.searchParams.get('version') || request.nextUrl.searchParams.get('v');
  const requestedVersion = requestedVersionRaw ? Number(String(requestedVersionRaw)) : undefined;

  try {
    // 1. Fetch on-chain data
    const rpcUrl = process.env.POLKADOT_RPC_URL || process.env.RPC_URL;
    const contractAddress = process.env.CONTRACT_ADDRESS;

    if (!rpcUrl || !contractAddress) {
      return new NextResponse(
        renderErrorPage('Configuration Error', tokenId, 'Missing RPC_URL or CONTRACT_ADDRESS'),
        { status: 500, headers: { 'Content-Type': 'text/html' } }
      );
    }

    const chainAdapter = new PolkadotChainAdapter({ 
      rpcUrl, 
      contractAddress,
      abiPath: process.env.CONTRACT_ABI_PATH || './src/contracts/artifacts/dpp_contract/dpp_contract.json',
      abiJson: dppContractMetadata,
    });

    let onChainData;
    try {
      onChainData = await chainAdapter.readPassport(tokenId);
    } catch (error: any) {
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        onChainData = null;
      } else {
        throw error;
      }
    }

    if (!onChainData) {
      return new NextResponse(
        renderErrorPage('Passport Not Found', tokenId, `Passport ID ${tokenId} was not found.`),
        { status: 404, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // 2. Fetch VC-JWT from IPFS
    const onChainVersion = Number(onChainData.version || 1) || 1;
    let resolvedDatasetUri: string = String(onChainData.datasetUri || '');

    // If a historical version is requested, walk the VC "previousDatasetUri" chain.
    // This does not modify on-chain data; it only selects which off-chain dataset to render.
    if (
      typeof requestedVersion === 'number' &&
      Number.isFinite(requestedVersion) &&
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
        if (typeof previousUri !== 'string' || !previousUri.startsWith('ipfs://')) {
          break;
        }
        currentUri = previousUri;
      }

      if (!currentUri.startsWith('ipfs://')) {
        return new NextResponse(
          renderErrorPage(
            'Version Not Available',
            tokenId,
            `Unable to resolve dataset for version ${requestedVersion}.`
          ),
          { status: 404, headers: { 'Content-Type': 'text/html' } }
        );
      }

      resolvedDatasetUri = currentUri;
    }

    const ipfsBackend = createIpfsBackend();
    const vcJwtData = await ipfsBackend.retrieveText(resolvedDatasetUri.replace('ipfs://', ''));
    const vcJwt = vcJwtData.data;

    // 3. Decode VC-JWT
    const vcPayload = decodeVcJwt(vcJwt);

    // 4. Extract DPP
    const dpp = extractDppFromVc(vcPayload);

    // 4a. Resolve issuer "anagrafica" (business identity) from did:web registry (best-effort)
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
    } catch (e: any) {
      console.warn('[Render Route] Issuer directory lookup failed:', e?.message || String(e));
    }

    // 4b. Discover related DTEs via resolver-first index (best-effort)
    let relatedDtes: Array<{ cid: string; href: string; title: string }> = [];
    let relatedDteDetails:
      | Array<{
          cid: string;
          issuerDid: string;
          issuerName: string;
          events: Array<{
            eventType?: string;
            eventTime?: string;
            summary?: string;
            evidence: Array<{ href: string; label?: string }>;
            raw?: any;
          }>;
        }>
      | undefined;
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
          if (!byCid.has(r.dteCid)) {
            byCid.set(r.dteCid, { cid: r.dteCid, title });
          }
        }

        const renderBaseUrl = (process.env.RENDER_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
        relatedDtes = Array.from(byCid.values()).map((d) => ({
          cid: d.cid,
          href: `${renderBaseUrl}/api/untp/dte/vc?cid=${encodeURIComponent(d.cid)}`,
          title: d.title,
        }));

        // Best-effort: fetch and render the DTE contents inline (limit to keep page fast).
        // This makes the page usable without forcing users to open raw VC-JWTs.
        const didManager = getDidWebManager();
        await didManager.reload();
        const issuerDirectory = buildIssuerDirectory(await didManager.listIssuers());
        const nameForDid = (did: string): string => {
          const hit = issuerDirectory.find((e) => e.did === did);
          return String(hit?.organizationName || hit?.domain || did).trim() || did;
        };

        const maxDtes = Number(process.env.RENDER_MAX_DTES || 12);
        const toLoad = Array.from(byCid.values()).slice(0, Number.isFinite(maxDtes) ? maxDtes : 12);

        const extractEvidenceLinks = (obj: any): Array<{ href: string; label?: string }> => {
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
        };

        const eventSummary = (ev: any): string => {
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
        };

        relatedDteDetails = [];
        for (const d of toLoad) {
          try {
            const jwtText = (await ipfsBackend.retrieveText(d.cid)).data;
            const payload = decodeVcJwt(jwtText);
            const vc = (payload as any)?.vc || payload;
            const issuerDid = String(
              vc?.issuer?.id || vc?.issuer || (payload as any)?.iss || (payload as any)?.issuer?.id || (payload as any)?.issuer || ''
            ).trim();
            const credentialSubjectRaw =
              (vc as any)?.credentialSubject ?? (payload as any)?.credentialSubject ?? (payload as any)?.vc?.credentialSubject;
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
            relatedDteDetails.push({
              cid: d.cid,
              issuerDid: issuerDid || 'urn:unknown:issuer',
              issuerName: nameForDid(issuerDid || 'urn:unknown:issuer'),
              events,
            });
          } catch (e: any) {
            relatedDteDetails.push({
              cid: d.cid,
              issuerDid: 'urn:unknown:issuer',
              issuerName: 'Unknown issuer',
              events: [],
            });
          }
        }
      }
    } catch (e: any) {
      console.warn('[Render Route] DTE discovery failed:', e?.message || String(e));
    }

    // 5. Render HTML
    const html = renderDppAsHtml(
      dpp,
      tokenId,
      {
        ...onChainData,
        datasetUri: resolvedDatasetUri,
      },
      verifyKey,
      {
        onChainVersion,
        requestedVersion:
          typeof requestedVersion === 'number' && Number.isFinite(requestedVersion) ? requestedVersion : undefined,
      },
      relatedDtes,
      relatedDteDetails,
      issuerIdentity
    );

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error: any) {
    console.error('[Render Route] Error:', error);
    return new NextResponse(
      renderErrorPage('Rendering Error', tokenId, error.message),
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

/**
 * Render DPP as HTML
 */
function renderDppAsHtml(
  dpp: DigitalProductPassport,
  tokenId: string,
  onChainData: any,
  verifyKey?: string,
  meta?: { onChainVersion?: number; requestedVersion?: number },
  relatedDtes?: Array<{ cid: string; href: string; title: string }>,
  relatedDteDetails?: Array<{
    cid: string;
    issuerDid: string;
    issuerName: string;
    events: Array<{
      eventType?: string;
      eventTime?: string;
      summary?: string;
      evidence: Array<{ href: string; label?: string }>;
      raw?: any;
    }>;
  }>,
  issuerIdentity?: IssuerDirectoryEntry | null
): string {
  const escapeHtml = (value: string): string =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const escapeAttr = (value: string): string =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const renderBaseUrl = process.env.RENDER_BASE_URL || 'http://localhost:3000';
  const verifyUrl = `${renderBaseUrl}/verification?tokenId=${encodeURIComponent(tokenId)}${
    verifyKey ? `&key=${encodeURIComponent(verifyKey)}` : ''
  }`;
  const onChainVersion = meta?.onChainVersion;
  const requestedVersion = meta?.requestedVersion;
  const displayedVersion =
    typeof requestedVersion === 'number' && Number.isFinite(requestedVersion) ? requestedVersion : onChainData.version;
  const isHistorical =
    typeof requestedVersion === 'number' &&
    Number.isFinite(requestedVersion) &&
    typeof onChainVersion === 'number' &&
    Number.isFinite(onChainVersion) &&
    requestedVersion !== onChainVersion;

  const ipfsBackend = createIpfsBackend();
  const productNameRaw = String(dpp.product?.name || '').trim();
  const productDescriptionRaw = String(dpp.product?.description || '').trim();
  const productIdRaw = String((dpp.product as any)?.registeredId || dpp.product?.identifier || '').trim();
  const manufacturerNameRaw = String((dpp as any)?.manufacturer?.name || '').trim();
  const manufacturerIdRaw = String((dpp as any)?.manufacturer?.identifier || '').trim();
  const manufacturerCountryRaw = String(
    (dpp as any)?.manufacturer?.country || (dpp as any)?.manufacturer?.addressCountry || ''
  ).trim();
  const batchNumberRaw = String((dpp.product as any)?.batchNumber || '').trim();
  const serialNumberRaw = String((dpp.product as any)?.serialNumber || '').trim();
  const levelRaw = String((dpp as any)?.granularityLevel || '').trim();

  const annexPublic = (dpp as any)?.annexIII?.public || (dpp as any)?.annexIII || {};
  const rawImages = annexPublic?.productImages;
  const normalizedImages = Array.isArray(rawImages)
    ? (rawImages
        .map((img: any, idx: number) => {
          const cid = String(
            img?.cid || (typeof img?.uri === 'string' ? String(img.uri).replace(/^ipfs:\/\//, '') : '')
          ).trim();
          if (!cid) return null;
          const url = String(img?.url || ipfsBackend.getGatewayUrl(cid)).trim();
          if (!url) return null;
          const kind = img?.kind === 'primary' ? 'primary' : 'gallery';
          const alt = String(img?.alt || img?.name || productNameRaw || 'Product image');
          return { cid, url, kind, alt, idx };
        })
        .filter(Boolean) as Array<{ cid: string; url: string; kind: 'primary' | 'gallery'; alt: string; idx: number }>)
    : [];

  const coverIndex =
    normalizedImages.length > 0 ? Math.max(0, normalizedImages.findIndex((i) => i.kind === 'primary')) : -1;
  const coverImage = coverIndex >= 0 ? normalizedImages[coverIndex] : null;
  const galleryImages = coverIndex >= 0 ? normalizedImages.filter((_, i) => i !== coverIndex) : [];

  const supportingLinks = (() => {
    const userInfo = Array.isArray(annexPublic?.userInformation) ? annexPublic.userInformation : [];
    const compliance = Array.isArray(annexPublic?.complianceDocs) ? annexPublic.complianceDocs : [];

    const toLink = (doc: any, sourceTypeFallback: string) => {
      const href = String(doc?.url || '').trim();
      if (!href) return null;
      const title = String(doc?.title || doc?.name || '').trim();
      const type = String(doc?.type || sourceTypeFallback || 'Link').trim();
      const language = String(doc?.language || '').trim();
      return {
        title: title || href,
        type,
        language,
        href,
      };
    };

    return [...userInfo.map((d: any) => toLink(d, 'Manual')), ...compliance.map((d: any) => toLink(d, 'Certificate'))]
      .filter(Boolean) as Array<{ title: string; type: string; language: string; href: string }>;
  })();

  const certifications = (() => {
    const claims = Array.isArray((dpp as any)?.conformityClaim) ? (dpp as any).conformityClaim : [];
    return claims
      .map((c: any) => {
        const name = String(c?.name || c?.title || c?.conformityTopic || 'Conformity claim').trim();
        const certificateId = String(c?.id || c?.claimId || c?.certificateId || '').trim();
        const issuer = String(c?.issuer || c?.auditor || c?.issuedBy || '').trim();
        const validFrom = String(c?.validFrom || c?.issuedAt || '').trim();
        const validTo = String(c?.validTo || c?.expiresAt || '').trim();
        const status =
          typeof c?.conformance === 'boolean' ? (c.conformance ? 'Valid' : 'Not confirmed') : String(c?.status || '');
        const href =
          String(c?.url || c?.evidenceUrl || c?.evidence?.url || c?.conformanceEvidence || '').trim() || '';
        return { name, certificateId, issuer, validFrom, validTo, status, href };
      })
      .filter((c: any) => c?.name) as Array<{
      name: string;
      certificateId: string;
      issuer: string;
      validFrom: string;
      validTo: string;
      status: string;
      href: string;
    }>;
  })();

  const downloads = (() => {
    const datasetUri = String(onChainData?.datasetUri || '').trim();
    const cid = datasetUri.startsWith('ipfs://') ? datasetUri.replace('ipfs://', '') : '';
    const recordUrl = cid ? ipfsBackend.getGatewayUrl(cid) : '';
    const items: Array<{ label: string; fileType: string; href: string; meta?: string }> = [];
    if (recordUrl) {
      items.push({ label: 'Raw passport record', fileType: 'JSON', href: recordUrl, meta: 'Signed digital record' });
    }

    for (const doc of supportingLinks) {
      const url = doc.href;
      const lower = url.toLowerCase();
      const fileType =
        lower.endsWith('.pdf') ? 'PDF' : lower.endsWith('.json') ? 'JSON' : lower.endsWith('.zip') ? 'ZIP' : 'LINK';
      items.push({
        label: doc.title.length > 60 ? `${doc.title.slice(0, 57)}…` : doc.title,
        fileType,
        href: url,
        meta: doc.type,
      });
    }

    // De-dupe by href
    const seen = new Set<string>();
    return items.filter((i) => {
      const key = i.href;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  const traceabilityTimeline = (() => {
    const items = (relatedDtes || []).map((d) => ({
      title: d.title,
      href: d.href,
      cid: d.cid,
    }));
    return items;
  })();

  const quantities = {
    events: traceabilityTimeline.length,
    images: normalizedImages.length,
    links: supportingLinks.length,
    certificates: certifications.length,
  };

  const issuerDisplayNameRaw = String(
    issuerIdentity?.organizationName || issuerIdentity?.domain || manufacturerNameRaw || ''
  ).trim();

  const traceabilitySection =
    traceabilityTimeline && traceabilityTimeline.length > 0
      ? `
      <div class="section">
        <div class="section-title">History & traceability</div>
        <div class="note" style="margin-bottom: 10px;">
          A chronological list of recorded events linked to this product.
        </div>
        <div class="kpi-strip">
          <div class="kpi"><div class="kpi-label">Events</div><div class="kpi-value">${escapeHtml(String(quantities.events))}</div></div>
          <div class="kpi"><div class="kpi-label">Images</div><div class="kpi-value">${escapeHtml(String(quantities.images))}</div></div>
          <div class="kpi"><div class="kpi-label">Links</div><div class="kpi-value">${escapeHtml(String(quantities.links))}</div></div>
          <div class="kpi"><div class="kpi-label">Certificates</div><div class="kpi-value">${escapeHtml(String(quantities.certificates))}</div></div>
        </div>

        ${
          relatedDteDetails && relatedDteDetails.length > 0
            ? `
          <div class="cards" style="margin-top: 12px;">
            ${relatedDteDetails
              .map((dte) => {
                const eventLines =
                  dte.events && dte.events.length > 0
                    ? `
                    <div class="kv" style="margin: 0 0 10px;">
                      <div class="kv-row">
                        <div class="kv-k">Issued by</div>
                        <div class="kv-v">${escapeHtml(dte.issuerName)}</div>
                      </div>
                      <div class="kv-row">
                        <div class="kv-k">Issuer DID</div>
                        <div class="kv-v"><code>${escapeHtml(dte.issuerDid)}</code></div>
                      </div>
                      <div class="kv-row">
                        <div class="kv-k">Events</div>
                        <div class="kv-v">${escapeHtml(String(dte.events.length))}</div>
                      </div>
                    </div>
                    <div class="timeline" style="margin: 0;">
                      ${dte.events
                        .slice(0, 50)
                        .map((ev) => {
                          const raw = ev.raw || {};
                          const locationRaw =
                            raw?.bizLocation?.id ||
                            raw?.bizLocation ||
                            raw?.readPoint?.id ||
                            raw?.readPoint ||
                            raw?.location ||
                            raw?.facility ||
                            '';
                          const location = String(locationRaw || '').trim();
                          const processType = String(raw?.processType || raw?.process || '').trim();
                          const action = String(raw?.action || '').trim();
                          const disposition = String(raw?.disposition || '').trim();
                          const bizStep = String(raw?.bizStep || '').trim();

                          const renderKvRow = (label: string, value: string) =>
                            value
                              ? `<div class="kv-row"><div class="kv-k">${escapeHtml(label)}</div><div class="kv-v">${escapeHtml(value)}</div></div>`
                              : '';

                          const renderListPreview = (label: string, list: any) => {
                            if (!Array.isArray(list) || list.length === 0) return '';
                            const preview = list
                              .slice(0, 3)
                              .map((i: any) => {
                                const id = String(i?.id || i?.epc || i || '').trim();
                                const name = String(i?.name || i?.title || '').trim();
                                if (!id && !name) return '';
                                return name ? `${id} (${name})` : id;
                              })
                              .filter(Boolean)
                              .join(', ');
                            if (!preview) return '';
                            const more = list.length > 3 ? ` +${list.length - 3} more` : '';
                            return `<div class="kv-row"><div class="kv-k">${escapeHtml(label)}</div><div class="kv-v"><code>${escapeHtml(
                              `${preview}${more}`
                            )}</code></div></div>`;
                          };

                          const evidence =
                            ev.evidence && ev.evidence.length > 0
                              ? `
                              <div class="timeline-actions" style="gap: 8px; flex-wrap: wrap;">
                                ${ev.evidence
                                  .slice(0, 6)
                                  .map(
                                    (l) =>
                                      `<a class="link" href="${escapeAttr(l.href)}" target="_blank" rel="noreferrer">${
                                        l.label ? escapeHtml(l.label) : 'Evidence'
                                      }</a>`
                                  )
                                  .join('')}
                              </div>
                              `
                              : '';

                          return `
                          <div class="timeline-item">
                            <div class="timeline-dot"></div>
                            <div class="timeline-body">
                              <div class="timeline-title">${escapeHtml(ev.eventType || 'Traceability event')}</div>
                              <div class="timeline-meta">${
                                ev.eventTime ? escapeHtml(ev.eventTime) : 'Event time not provided'
                              }${location ? ` · location: ${escapeHtml(location)}` : ''}</div>

                              <div class="kv">
                                ${renderKvRow('Process', processType)}
                                ${renderKvRow('Action', action)}
                                ${renderKvRow('Disposition', disposition)}
                                ${renderKvRow('Business step', bizStep)}
                                ${renderListPreview('Product reference', raw?.epcList)}
                                ${renderListPreview('Inputs', raw?.inputEPCList)}
                                ${renderListPreview('Outputs', raw?.outputEPCList)}
                              </div>
                              ${evidence}
                              <details class="tiny-details">
                                <summary>Technical fields</summary>
                                <div class="tiny-details-body">
                                  <pre style="white-space: pre-wrap; margin: 0;">${escapeHtml(
                                    JSON.stringify(raw, null, 2)
                                  )}</pre>
                                </div>
                              </details>
                            </div>
                          </div>`;
                        })
                        .join('')}
                    </div>
                  `
                    : `<div class="note">Unable to decode events from this traceability record.</div>`;

                return `
                <div class="card" style="padding: 14px;">
                  <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 12px;">
                    <div>
                      <div class="section-title" style="margin: 0 0 4px;">Traceability record</div>
                      <div class="note" style="margin: 0;">Signed evidence record linked to this product.</div>
                    </div>
                    <a class="link" href="${escapeAttr(
                      (relatedDtes || []).find((r) => r.cid === dte.cid)?.href || '#'
                    )}" target="_blank" rel="noreferrer">Open VC</a>
                  </div>
                  <details class="tiny-details" style="margin-top: 10px;">
                    <summary>Show events</summary>
                    <div class="tiny-details-body">
                      ${eventLines}
                      <div style="margin-top: 10px;">Record ID: <code>${escapeHtml(dte.cid)}</code></div>
                    </div>
                  </details>
                </div>`;
              })
              .join('')}
          </div>
        `
            : ''
        }

        <div class="timeline">
          ${traceabilityTimeline
            .map(
              (e) => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div class="timeline-title">${escapeHtml(e.title)}</div>
                <div class="timeline-meta">Evidence record available</div>
                <div class="timeline-actions">
                  <a class="link" href="${escapeAttr(e.href)}" target="_blank" rel="noreferrer">View details</a>
                </div>
                <details class="tiny-details">
                  <summary>Reference</summary>
                  <div class="tiny-details-body">
                    Record ID: <code>${escapeHtml(e.cid)}</code>
                  </div>
                </details>
              </div>
            </div>`
            )
            .join('')}
        </div>
      </div>
      `
      : `
      <div class="section">
        <div class="section-title">History & traceability</div>
        <div class="note">
          No history entries are available for this product yet.
        </div>
      </div>
      `;

  const heroImageHtml = coverImage
    ? `<a class="hero-image" href="${coverImage.url}" target="_blank" rel="noreferrer">
         <img src="${coverImage.url}" alt="${escapeAttr(coverImage.alt)}" />
       </a>`
    : `<div class="hero-image placeholder" aria-hidden="true">
         <div class="placeholder-inner">
           <div class="placeholder-title">No image provided</div>
           <div class="placeholder-subtitle">This passport does not include product photos.</div>
         </div>
       </div>`;

  const imagesGallerySection =
    downloads.length > 0
      ? `
      <div class="section card" id="downloads">
        <div class="section-title">Downloads & files</div>
        <div class="note" style="margin-bottom: 10px;">
          Official files referenced by this passport (record, manuals, certificates).
        </div>
        <div class="downloads">
          ${downloads
            .slice(0, 10)
            .map(
              (d) => `
              <a class="download-tile" href="${escapeAttr(d.href)}" target="_blank" rel="noreferrer">
                <div class="download-top">
                  <div class="download-label">${escapeHtml(d.label)}</div>
                  <div class="badge neutral">${escapeHtml(d.fileType)}</div>
                </div>
                ${d.meta ? `<div class="download-meta">${escapeHtml(d.meta)}</div>` : ''}
                <div class="download-cta">Open</div>
              </a>
            `
            )
            .join('')}
        </div>
      </div>
      `
      : `
      <div class="section card" id="downloads">
        <div class="section-title">Downloads & files</div>
        <div class="note">No downloadable files have been provided yet.</div>
      </div>
      `;

  const imagesSection =
    galleryImages.length > 0
      ? `
      <div class="section card" id="images">
        <div class="section-title">Images</div>
        <div class="note" style="margin-bottom: 10px;">
          Additional product photos provided by the issuer.
        </div>
        <div class="gallery">
          ${galleryImages
            .slice(0, 12)
            .map(
              (g) => `<a href="${g.url}" target="_blank" rel="noreferrer">
                        <img src="${g.url}" alt="${escapeAttr(g.alt)}" />
                      </a>`
            )
            .join('')}
        </div>
      </div>
      `
      : '';

  const supportingLinksSection =
    supportingLinks.length > 0
      ? `
      <div class="section card" id="links">
        <div class="section-title">Supporting links</div>
        <div class="note" style="margin-bottom: 10px;">
          Helpful resources provided by the issuer (manuals, documentation, references).
        </div>
        <div class="links">
          ${supportingLinks
            .slice(0, 12)
            .map((l) => {
              const title = l.title.length > 90 ? `${l.title.slice(0, 87)}…` : l.title;
              const type = l.type || 'Link';
              const lang = l.language ? ` · ${l.language}` : '';
              return `
              <a class="link-card" href="${escapeAttr(l.href)}" target="_blank" rel="noreferrer">
                <div class="link-title">${escapeHtml(title)}</div>
                <div class="link-meta">${escapeHtml(type)}${escapeHtml(lang)}</div>
                <div class="link-cta">Open link</div>
              </a>`;
            })
            .join('')}
        </div>
      </div>
      `
      : `
      <div class="section card" id="links">
        <div class="section-title">Supporting links</div>
        <div class="note">No supporting links have been provided yet.</div>
      </div>
      `;

  const certificationsSection =
    certifications.length > 0
      ? `
      <div class="section card" id="certifications">
        <div class="section-title">Certificates & proof</div>
        <div class="note" style="margin-bottom: 10px;">
          Evidence cards summarizing available claims and attestations.
        </div>
        <div class="cert-grid">
          ${certifications
            .slice(0, 12)
            .map((c) => {
              const status = String(c.status || '').toLowerCase().includes('valid') ? 'valid' : 'neutral';
              const href = c.href ? escapeAttr(c.href) : '';
              return `
              <div class="cert-card">
                <div class="cert-top">
                  <div class="cert-name">${escapeHtml(c.name)}</div>
                  <div class="badge ${status}">${escapeHtml(c.status || 'Provided')}</div>
                </div>
                <div class="cert-rows">
                  ${c.issuer ? `<div class="row"><div class="row-k">Issuer/Auditor</div><div class="row-v">${escapeHtml(c.issuer)}</div></div>` : ''}
                  ${c.certificateId ? `<div class="row"><div class="row-k">ID</div><div class="row-v"><code>${escapeHtml(c.certificateId)}</code></div></div>` : ''}
                  ${(c.validFrom || c.validTo)
                    ? `<div class="row"><div class="row-k">Validity</div><div class="row-v">${escapeHtml(
                        [c.validFrom, c.validTo].filter(Boolean).join(' → ')
                      )}</div></div>`
                    : ''}
                </div>
                <div class="cert-actions">
                  ${
                    href
                      ? `<a class="button secondary small" href="${href}" target="_blank" rel="noreferrer">View details</a>`
                      : `<span class="note">No external details link provided.</span>`
                  }
                </div>
              </div>
              `;
            })
            .join('')}
        </div>
      </div>
      `
      : `
      <div class="section card" id="certifications">
        <div class="section-title">Certificates & proof</div>
        <div class="note">No certificates have been provided yet.</div>
      </div>
      `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Passport - ${dpp.product?.name || tokenId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #111827;
      background: #f3f4f6;
      padding: 24px;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06);
      overflow: hidden;
    }
    .brand {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .header {
      padding: 20px 24px;
      border-bottom: 1px solid #e5e7eb;
      background: #ffffff;
    }
    .header-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .title {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.2;
      color: #111827;
    }
    .subtitle {
      margin-top: 4px;
      color: #6b7280;
      font-size: 13px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border: 1px solid #e5e7eb;
      border-radius: 999px;
      font-size: 12px;
      color: #374151;
      background: #f9fafb;
      white-space: nowrap;
    }
    .chip.positive { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
    .chip.negative { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
    .content { padding: 20px 24px; }
    .section {
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    .section:last-child { border-bottom: none; }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 10px;
      letter-spacing: 0.02em;
    }
    summary.section-title { cursor: pointer; list-style: none; }
    summary.section-title::-webkit-details-marker { display: none; }
    .table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }
    .table tr { border-bottom: 1px solid #e5e7eb; }
    .table tr:last-child { border-bottom: none; }
    .table th, .table td {
      text-align: left;
      padding: 10px 12px;
      vertical-align: top;
      font-size: 13px;
    }
    .table th {
      width: 220px;
      color: #6b7280;
      font-weight: 600;
      background: #f9fafb;
    }
    .table td {
      color: #111827;
      word-break: break-word;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      font-size: 12px;
      color: #111827;
    }
    .status {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid transparent;
    }
    .status-active { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
    .status-revoked { background: #fef2f2; color: #991b1b; border-color: #fecaca; }
    .status-other { background: #f3f4f6; color: #374151; border-color: #e5e7eb; }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid #0070F2;
      background: #0070F2;
      color: #ffffff;
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
    }
    .button.secondary {
      border-color: #d1d1d1;
      background: #ffffff;
      color: #111827;
    }
    .button.small { padding: 8px 10px; font-size: 12px; border-radius: 8px; }
    .button:hover { background: #005bb5; border-color: #005bb5; }
    .button.secondary:hover { background: #f9fafb; border-color: #c7c7c7; }
    .note {
      font-size: 12px;
      color: #6b7280;
    }
    .banner {
      margin-top: 10px;
      padding: 10px 12px;
      border: 1px solid #e5e7eb;
      background: #f9fafb;
      border-radius: 8px;
      font-size: 12px;
      color: #374151;
    }
    .banner.negative {
      border-color: #fecaca;
      background: #fef2f2;
      color: #7f1d1d;
    }
    .hero {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    .hero-image {
      display: block;
      width: 320px;
      max-width: 100%;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      overflow: hidden;
      background: #f9fafb;
      text-decoration: none;
    }
    .hero-image img {
      display: block;
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
    }
    .hero-image.placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      min-height: 320px;
      background: linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%);
    }
    .placeholder-inner { text-align: center; max-width: 260px; }
    .placeholder-title { font-size: 13px; font-weight: 700; color: #111827; }
    .placeholder-subtitle { margin-top: 6px; font-size: 12px; color: #6b7280; }
    .hero-summary { flex: 1; min-width: 0; }
    .kpis {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 12px;
      background: #ffffff;
    }
    .card-title { font-size: 12px; font-weight: 700; color: #111827; }
    .card-value { margin-top: 4px; font-size: 13px; color: #111827; }
    .card-note { margin-top: 6px; font-size: 12px; color: #6b7280; }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; background: #ffffff; }
    .section.card { padding: 14px; }

    .jump {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border: 1px solid #e5e7eb;
      border-radius: 999px;
      font-size: 12px;
      color: #374151;
      background: #ffffff;
      text-decoration: none;
    }
    .jump:hover { background: #f9fafb; }
    .tiny-details { margin-top: 10px; }
    .tiny-details summary { cursor: pointer; font-size: 12px; font-weight: 700; color: #374151; }
    .tiny-details-body { margin-top: 6px; font-size: 12px; color: #6b7280; }

    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin: 10px 0 14px;
    }
    .kpi {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 10px;
      background: #ffffff;
    }
    .kpi-label { font-size: 11px; color: #6b7280; font-weight: 600; }
    .kpi-value { margin-top: 2px; font-size: 16px; font-weight: 700; color: #111827; }

    .timeline { margin-top: 6px; display: grid; gap: 10px; }
    .timeline-item { display: grid; grid-template-columns: 16px 1fr; gap: 12px; }
    .timeline-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #111827;
      margin-top: 6px;
    }
    .timeline-body {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 12px;
      background: #ffffff;
    }
    .timeline-title { font-size: 13px; font-weight: 700; color: #111827; }
    .timeline-meta { margin-top: 4px; font-size: 12px; color: #6b7280; }
    .timeline-actions { margin-top: 8px; }
    .kv { margin-top: 10px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f9fafb; overflow: hidden; }
    .kv-row { display: flex; gap: 12px; padding: 8px 10px; border-top: 1px solid #e5e7eb; }
    .kv-row:first-child { border-top: 0; }
    .kv-k { width: 140px; flex: 0 0 auto; font-size: 12px; color: #6b7280; font-weight: 600; }
    .kv-v { flex: 1 1 auto; font-size: 13px; color: #111827; word-break: break-word; }
    .kv-v code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
    a.link { color: #005bb5; text-decoration: none; font-weight: 600; font-size: 12px; }
    a.link:hover { text-decoration: underline; }

    .links { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
    .link-card {
      display: block;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 12px;
      text-decoration: none;
      background: #ffffff;
      color: inherit;
    }
    .link-title { font-size: 13px; font-weight: 700; color: #111827; }
    .link-meta { margin-top: 4px; font-size: 12px; color: #6b7280; }
    .link-cta { margin-top: 10px; font-size: 12px; font-weight: 700; color: #005bb5; }

    .cert-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
    .cert-card {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 12px;
      background: #ffffff;
    }
    .cert-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .cert-name { font-size: 13px; font-weight: 700; color: #111827; }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #e5e7eb;
      white-space: nowrap;
    }
    .badge.valid { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
    .badge.neutral { background: #f3f4f6; color: #374151; border-color: #e5e7eb; }
    .cert-rows { margin-top: 10px; display: grid; gap: 6px; }
    .row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; }
    .row-k { color: #6b7280; font-weight: 600; }
    .row-v { color: #111827; text-align: right; word-break: break-word; }
    .cert-actions { margin-top: 12px; display: flex; justify-content: flex-end; }

    .downloads { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
    .download-tile {
      display: block;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 12px;
      text-decoration: none;
      background: #ffffff;
      color: inherit;
    }
    .download-top { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
    .download-label { font-size: 13px; font-weight: 700; color: #111827; }
    .download-meta { margin-top: 4px; font-size: 12px; color: #6b7280; }
    .download-cta { margin-top: 10px; font-size: 12px; font-weight: 700; color: #005bb5; }
    .gallery {
      margin-top: 12px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 10px;
    }
    .gallery a {
      display: block;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      overflow: hidden;
      background: #f9fafb;
    }
    .gallery img {
      display: block;
      width: 100%;
      height: 120px;
      object-fit: cover;
    }
    .footer {
      border-top: 1px solid #e5e7eb;
      padding: 14px 24px;
      color: #6b7280;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    @media (max-width: 768px) {
      body { padding: 14px; }
      .header-top { flex-direction: column; }
      .meta { justify-content: flex-start; }
      .table th { width: 160px; }
      .hero { flex-direction: column; }
      .hero-image { width: 100%; }
      .hero-image.placeholder { min-height: 220px; }
      .grid-2 { grid-template-columns: 1fr; }
      .kpi-strip { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-top">
        <div>
          <div class="brand">Digital Product Passport</div>
          <div class="title">${escapeHtml(productNameRaw || 'Product')}</div>
          <div class="subtitle">${escapeHtml(productDescriptionRaw || 'A customer-friendly record you can verify independently.')}</div>
          ${
            issuerDisplayNameRaw
              ? `<div class="note" style="margin-top: 8px;">Issued by <strong>${escapeHtml(
                  issuerDisplayNameRaw
                )}</strong></div>`
              : ''
          }
        </div>
        <div class="meta">
          <span class="chip ${onChainData.status === 'Revoked' ? 'negative' : 'positive'}">Status: ${escapeHtml(String(onChainData.status || 'N/A'))}</span>
          <span class="chip">Customer reference: <code>${escapeHtml(productIdRaw || tokenId)}</code></span>
        </div>
      </div>
      <div class="meta" style="margin-top: 12px; justify-content: flex-start;">
        <a class="jump" href="#summary">Summary</a>
        <a class="jump" href="#what">What it is</a>
        <a class="jump" href="#traceability">Traceability</a>
        <a class="jump" href="#links">Links</a>
        <a class="jump" href="#certifications">Certificates</a>
        <a class="jump" href="#downloads">Downloads</a>
      </div>
      ${
        isHistorical
          ? `<div class="banner">
              Rendering a historical version. The public reference is currently at version <code>${onChainVersion}</code>.
            </div>`
          : ''
      }
      ${
        onChainData.status === 'Revoked'
          ? `<div class="banner negative">This passport has been revoked. If you’re checking authenticity, do not rely on this record.</div>`
          : ''
      }
    </div>
    
    <div class="content">
      <div class="section card" id="summary">
        <div class="hero">
          ${heroImageHtml}
          <div class="hero-summary">
            <div class="section-title">Product summary</div>
            <div class="grid-2">
              <div class="card">
                <div class="card-title">Product identifier</div>
                <div class="card-value"><code>${escapeHtml(productIdRaw || 'N/A')}</code></div>
                ${(levelRaw ? `<div class="card-note">Level: ${escapeHtml(levelRaw)}</div>` : '')}
                ${(batchNumberRaw ? `<div class="card-note">Batch: <code>${escapeHtml(batchNumberRaw)}</code></div>` : '')}
                ${(serialNumberRaw ? `<div class="card-note">Serial: <code>${escapeHtml(serialNumberRaw)}</code></div>` : '')}
              </div>
              <div class="card">
                <div class="card-title">Issued by</div>
                <div class="card-value">${escapeHtml(issuerDisplayNameRaw || 'N/A')}</div>
                ${(manufacturerIdRaw ? `<div class="card-note">Organization ID: <code>${escapeHtml(manufacturerIdRaw)}</code></div>` : '')}
                ${(manufacturerCountryRaw ? `<div class="card-note">Country: ${escapeHtml(manufacturerCountryRaw)}</div>` : '')}
              </div>
            </div>
            <div class="actions" style="margin-top: 14px;">
              <a href="${verifyUrl}" class="button" target="_blank" rel="noreferrer">Verify authenticity</a>
              <a href="#downloads" class="button secondary">View files</a>
            </div>
            <div class="note" style="margin-top: 8px;">
              Tip: if you received a verification key, keep it in the link — it may unlock extra fields.
            </div>
          </div>
        </div>
      </div>

	      <div class="section card" id="what">
	        <div class="section-title">What this page is for</div>
	        <div class="note" style="margin-bottom: 10px;">
	          Use this page to confirm you’re looking at the right product and review its key information, history, and documents.
	        </div>
	        <div class="grid-2">
	          <div class="card">
	            <div class="card-title">Check product identity</div>
	            <div class="card-value">Match the product ID and batch/serial with the label, packaging, or invoice.</div>
	            <div class="card-note">If these don’t match, the passport may not belong to your item.</div>
	          </div>
	          <div class="card">
	            <div class="card-title">Review official materials</div>
	            <div class="card-value">See product history entries, certificates, and files provided by the issuer.</div>
	            <div class="card-note">Open “Files” to view manuals, certificates, and supporting documents.</div>
	          </div>
	        </div>
	      </div>

      <div id="traceability">${traceabilitySection}</div>
      ${supportingLinksSection}
      ${certificationsSection}
      ${imagesSection}
      ${imagesGallerySection}

      <details class="section">
        <summary class="section-title">Advanced: technical reference</summary>
        <div class="note" style="margin-bottom: 10px;">
          These fields help auditors and system integrators validate the record.
        </div>
        <table class="table">
          <tr>
            <th>Status</th>
            <td>
              <span class="status ${
                onChainData.status === 'Active'
                  ? 'status-active'
                  : onChainData.status === 'Revoked'
                    ? 'status-revoked'
                    : 'status-other'
              }">${onChainData.status || 'N/A'}</span>
            </td>
          </tr>
	          <tr>
	            <th>Issued by</th>
	            <td>
	              ${escapeHtml(issuerDisplayNameRaw || 'N/A')}
	              <details class="tiny-details">
	                <summary>Technical reference</summary>
	                <div class="tiny-details-body">
	                  Issuer account: <code>${escapeHtml(String(onChainData.issuer || 'N/A'))}</code>
	                </div>
	              </details>
	            </td>
	          </tr>
          <tr>
            <th>Digital record link</th>
            <td><code>${escapeHtml(String(onChainData.datasetUri || 'N/A'))}</code></td>
          </tr>
          <tr>
            <th>Record type (advanced)</th>
            <td><code>${escapeHtml(String(onChainData.datasetType || 'N/A'))}</code></td>
          </tr>
          <tr>
            <th>Digital fingerprint</th>
            <td><code>${escapeHtml(String(onChainData.payloadHash || 'N/A'))}</code></td>
          </tr>
          ${(onChainData.subjectIdHash ? `
          <tr>
            <th>Subject identifier hash</th>
            <td><code>${escapeHtml(String(onChainData.subjectIdHash))}</code></td>
          </tr>` : '')}
        </table>
      </details>
    </div>

	    <div class="footer">
	      <div>Passport ID <code>${escapeHtml(tokenId)}</code> · Version <code>${escapeHtml(String(displayedVersion || 'N/A'))}</code></div>
	    </div>
	  </div>
	</body>
	</html>
	  `.trim();
	}

/**
 * Render error page
 */
function renderErrorPage(title: string, tokenId: string, details?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - DPP</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #f5f5f5;
      margin: 0;
      padding: 2rem;
    }
    .error-container {
      max-width: 500px;
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
    }
    h1 { color: #e53e3e; margin-bottom: 1rem; }
    .token-id {
      background: #f7fafc;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-family: monospace;
      margin: 1rem 0;
    }
    .details {
      color: #666;
      font-size: 0.9rem;
      margin-top: 1rem;
      padding: 1rem;
      background: #fff5f5;
      border-radius: 6px;
      border-left: 4px solid #e53e3e;
      text-align: left;
    }
    a {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 0.75rem 1.5rem;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <h1>${title}</h1>
    <div class="token-id">Passport ID: ${tokenId}</div>
    ${details ? `<div class="details"><strong>Details:</strong><br>${details}</div>` : ''}
    <a href="/">← Back to Home</a>
  </div>
</body>
</html>
  `.trim();
}
