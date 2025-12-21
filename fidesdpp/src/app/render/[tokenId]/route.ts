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
        renderErrorPage('Passport Not Found', tokenId, `Token ID ${tokenId} does not exist on-chain`),
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
      }
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
  meta?: { onChainVersion?: number; requestedVersion?: number }
): string {
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

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Digital Product Passport - ${dpp.product?.name || tokenId}</title>
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
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-top">
        <div>
          <div class="title">Digital Product Passport</div>
        </div>
        <div class="meta">
          <span class="chip">Token ID: <code>${tokenId}</code></span>
          <span class="chip">Version: <code>${displayedVersion || 'N/A'}</code></span>
          <span class="chip">Network: <code>polkadot:westend-asset-hub</code></span>
        </div>
      </div>
      ${
        isHistorical
          ? `<div class="banner">
              Rendering a historical dataset version. On-chain data is currently at version <code>${onChainVersion}</code>.
            </div>`
          : ''
      }
    </div>
    
    <div class="content">
      <div class="section">
        <div class="section-title">Product</div>
        <table class="table">
          <tr>
            <th>Name</th>
            <td>${dpp.product?.name || 'N/A'}</td>
          </tr>
          <tr>
            <th>Registered ID</th>
            <td><code>${(dpp.product as any)?.registeredId || dpp.product?.identifier || 'N/A'}</code></td>
          </tr>
          <tr>
            <th>Product URI</th>
            <td><code>${(dpp.product as any)?.id || 'N/A'}</code></td>
          </tr>
          <tr>
            <th>Granularity</th>
            <td>${(dpp as any)?.granularityLevel || 'N/A'}</td>
          </tr>
          ${(dpp.product as any)?.batchNumber ? `
          <tr>
            <th>Batch Number</th>
            <td>${(dpp.product as any)?.batchNumber}</td>
          </tr>` : ''}
          ${(dpp.product as any)?.serialNumber ? `
          <tr>
            <th>Serial Number</th>
            <td>${(dpp.product as any)?.serialNumber}</td>
          </tr>` : ''}
          <tr>
            <th>Description</th>
            <td>${dpp.product?.description || 'N/A'}</td>
          </tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Issuer</div>
        <table class="table">
          <tr>
            <th>Manufacturer Name</th>
            <td>${(dpp as any)?.manufacturer?.name || 'N/A'}</td>
          </tr>
          <tr>
            <th>Manufacturer ID</th>
            <td><code>${(dpp as any)?.manufacturer?.identifier || 'N/A'}</code></td>
          </tr>
          <tr>
            <th>Country</th>
            <td>${(dpp as any)?.manufacturer?.country || (dpp as any)?.manufacturer?.addressCountry || 'N/A'}</td>
          </tr>
          ${(dpp as any)?.manufacturer?.facility ? `
          <tr>
            <th>Facility</th>
            <td>${(dpp as any)?.manufacturer?.facility}</td>
          </tr>` : ''}
        </table>
      </div>

      <div class="section">
        <div class="section-title">On-chain Anchor</div>
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
            <th>Issuer (on-chain)</th>
            <td><code>${onChainData.issuer || 'N/A'}</code></td>
          </tr>
          <tr>
            <th>Dataset URI</th>
            <td><code>${onChainData.datasetUri || 'N/A'}</code></td>
          </tr>
          <tr>
            <th>Dataset Type</th>
            <td><code>${onChainData.datasetType || 'N/A'}</code></td>
          </tr>
          <tr>
            <th>Payload Hash</th>
            <td><code>${onChainData.payloadHash || 'N/A'}</code></td>
          </tr>
          ${(onChainData.subjectIdHash ? `
          <tr>
            <th>Subject ID Hash</th>
            <td><code>${onChainData.subjectIdHash}</code></td>
          </tr>` : '')}
        </table>
      </div>

      <div class="section">
        <div class="section-title">Verification</div>
        <div class="actions">
          <a href="${verifyUrl}" class="button" target="_blank" rel="noreferrer">Verify Integrity</a>
          <a href="${onChainData.datasetUri || '#'}" class="button secondary" target="_blank" rel="noreferrer">Open Dataset URI</a>
        </div>
        <div class="note" style="margin-top: 8px;">
          Verification checks the latest on-chain anchor, retrieves the dataset from storage, and validates integrity.
        </div>
      </div>
    </div>

	    <div class="footer">
	      <div>Generated from on-chain token <code>${tokenId}</code></div>
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
    <div class="token-id">Token ID: ${tokenId}</div>
    ${details ? `<div class="details"><strong>Details:</strong><br>${details}</div>` : ''}
    <a href="/">← Back to Home</a>
  </div>
</body>
</html>
  `.trim();
}
