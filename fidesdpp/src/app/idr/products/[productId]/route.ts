/**
 * Identity Resolver API Route
 * 
 * UNTP-compliant Identity Resolver endpoint.
 * Returns RFC 9264 linksets for product identifiers.
 * 
 * Endpoints:
 * - GET /idr/products/{productId}?linkType=linkset → Linkset JSON
 * - GET /idr/products/{productId}?linkType=untp:dpp&tokenId={id} → VC URL
 * - GET /idr/products/{productId}?tokenId={id} → Redirect to render URL
 * 
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { IdrService } from '../../../../lib/idr/IdrService';
import { createAnagraficaStorage } from '../../../../lib/anagrafica/createAnagraficaStorage';
import { AnagraficaService } from '../../../../lib/anagrafica/AnagraficaService';
import { createDteIndexStorage } from '../../../../lib/dte/createDteIndexStorage';
import { buildCanonicalSubjectId, lookupTokenIdByCanonicalSubjectId } from '../../../../lib/passports/lookup';

function applyPreferredLanguage(linkset: any, preferredLang: string): void {
  const lang = String(preferredLang || '').trim();
  if (!lang) return;

  for (const [rel, value] of Object.entries(linkset || {})) {
    if (rel === 'anchor') continue;
    if (!value) continue;

    const applyToLink = (link: any) => {
      if (!link || typeof link !== 'object') return;
      if (typeof link.hreflang === 'string' && link.hreflang.trim()) return;
      link.hreflang = lang;
    };

    if (Array.isArray(value)) {
      value.forEach(applyToLink);
    } else if (typeof value === 'object') {
      applyToLink(value);
    }
  }
}

function applyGranularityAndStatus(
  linkset: any,
  input: {
    granularity: 'unknown' | 'ProductClass' | 'Batch' | 'Item';
    hasPassport: boolean;
  }
): void {
  if (!linkset || typeof linkset !== 'object') return;

  const granularityValue = input.granularity || 'unknown';
  linkset['untp:granularity'] = {
    href: `urn:untp:granularity:${granularityValue.toLowerCase()}`,
    type: 'text/plain',
    title:
      granularityValue === 'unknown'
        ? 'Granularity (not specified)'
        : `Granularity (${granularityValue})`,
  };

  linkset['untp:status'] = {
    href: input.hasPassport ? 'urn:untp:status:available' : 'urn:untp:status:not-issued',
    type: 'text/plain',
    title: input.hasPassport ? 'Passport available' : 'Passport not issued yet',
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ productId: string }> }
): Promise<NextResponse> {
  try {
    const { productId } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const tokenId = searchParams.get('tokenId');
    const granularityParam = (searchParams.get('granularity') || '').trim();
    const granularityLevelParam = (searchParams.get('granularityLevel') || searchParams.get('level') || '').trim();
    const batchNumberParam = (searchParams.get('batchNumber') || searchParams.get('batch') || '').trim();
    const serialNumberParam = (searchParams.get('serialNumber') || searchParams.get('serial') || '').trim();
    const explicitLinkType = searchParams.get('linkType');
    const formatParam = (searchParams.get('format') || '').trim().toLowerCase();
    const langParam = (searchParams.get('language') || searchParams.get('lang') || '').trim();

    const accept = (request.headers.get('accept') || '').toLowerCase();
    const acceptLang = (request.headers.get('accept-language') || '').trim();

    const normalizeGranularity = (raw: string): 'ProductClass' | 'Batch' | 'Item' => {
      const v = String(raw || '').trim().toLowerCase();
      if (!v) return 'ProductClass';
      if (v === 'productclass' || v === 'product_class' || v === 'class' || v === 'model') return 'ProductClass';
      if (v === 'batch' || v === 'lot') return 'Batch';
      if (v === 'item' || v === 'serialized' || v === 'serial') return 'Item';
      return 'ProductClass';
    };

    const granularityProvided = (granularityParam || granularityLevelParam).trim();
    const lookupGranularity = normalizeGranularity(granularityProvided);
    const linksetGranularity: 'unknown' | 'ProductClass' | 'Batch' | 'Item' = granularityProvided
      ? lookupGranularity
      : 'unknown';

    const canonicalSubjectId = buildCanonicalSubjectId({
      productId,
      granularity: lookupGranularity,
      batchNumber: batchNumberParam || undefined,
      serialNumber: serialNumberParam || undefined,
    });

    // Basic content negotiation:
    // - If client asks for linkset JSON, treat as linkType=linkset
    // - Otherwise default behavior: redirect to the human-readable render (alternate)
    const negotiatedLinkType =
      explicitLinkType ||
      (formatParam === 'linkset' ? 'linkset' : '') ||
      (accept.includes('application/linkset+json') || accept.includes('application/json') ? 'linkset' : '');
    const linkType = negotiatedLinkType || null;

    const wantsJson = formatParam === 'json' || accept.includes('application/json') || accept.includes('application/linkset+json');
    const wantsRedirect =
      formatParam === 'redirect' || (!wantsJson && accept.includes('text/html'));

    const preferredLang =
      langParam ||
      (acceptLang ? acceptLang.split(',')[0]?.split(';')[0]?.trim() : '') ||
      '';

    // Initialize anagrafica service (if enabled)
    let anagraficaService: AnagraficaService | undefined;
    try {
      const anagraficaStorage = createAnagraficaStorage();
      anagraficaService = new AnagraficaService(anagraficaStorage);
    } catch (error) {
      // Anagrafica not available - continue without it
      console.debug('AnagraficaService not available for IDR');
    }

    // Initialize IDR service with anagrafica (if available)
    let dteIndexStorage: any | undefined;
    try {
      dteIndexStorage = createDteIndexStorage();
    } catch (error) {
      // DTE index not available - continue without it
      console.debug('DTE index storage not available for IDR');
    }

    const idrService = new IdrService(request.nextUrl.origin, anagraficaService, dteIndexStorage);

    // Resolve tokenId if not provided:
    // 1) try anagrafica (local index)
    // 2) fall back to on-chain subject_id_hash lookup (UNTP-friendly: no local dependency)
    let resolvedTokenId = tokenId || '';
    if (!resolvedTokenId) {
      if (anagraficaService) {
        // Anagrafica resolves ProductClass-level identifiers only.
        resolvedTokenId = (await idrService.lookupTokenId(productId)) || '';
      }
      if (!resolvedTokenId) {
        resolvedTokenId =
          (await lookupTokenIdByCanonicalSubjectId({
            canonicalSubjectId,
          })) || '';
      }
    }

    // Case 1: Return linkset JSON
    if (linkType === 'linkset') {
      // Prefer anagrafica-backed linksets (can list multiple DPPs), but fall back to
      // the on-chain resolved tokenId when anagrafica doesn't have this product.
      let linkset = await idrService.resolveProductLinkset(productId);

      if (!linkset['untp:dpp'] && resolvedTokenId) {
        linkset = await idrService.generateLinkset(productId, resolvedTokenId);
      }

      // Even if there is no tokenId yet, the IDR must still be resolvable.
      if (!linkset || typeof linkset !== 'object') {
        linkset = await idrService.generateLinkset(productId);
      }

      const hasPassport = Boolean(resolvedTokenId) || Boolean((linkset as any)?.['untp:dpp']);
      applyGranularityAndStatus(linkset, { granularity: linksetGranularity, hasPassport });
      applyPreferredLanguage(linkset, preferredLang);

      return NextResponse.json(
        { linkset: [linkset] },
        {
          headers: {
            'Content-Type': 'application/linkset+json',
            'Cache-Control': 'public, max-age=3600',
            'Vary': 'Accept, Accept-Language',
          },
        }
      );
    }

    // Case 2: Return specific link type
    if (linkType) {
      if (!resolvedTokenId) {
        return NextResponse.json(
          { error: 'Passport not found for this product identifier', productId, linkType },
          { status: 404 }
        );
      }

      const linkUrl = await idrService.resolveLinkByType(productId, linkType, resolvedTokenId);

      if (!linkUrl) {
        return NextResponse.json(
          { error: `Link type not found: ${linkType}` },
          { status: 404 }
        );
      }

      if (wantsRedirect) {
        return NextResponse.redirect(linkUrl, {
          status: 302,
          headers: {
            'Cache-Control': 'public, max-age=3600',
            'Vary': 'Accept, Accept-Language',
          },
        });
      }

      // Return link as JSON (default for linkType requests)
      return NextResponse.json(
        { 
          productId,
          linkType,
          url: linkUrl,
        },
        {
          headers: {
            'Cache-Control': 'public, max-age=3600',
            'Vary': 'Accept, Accept-Language',
          },
        }
      );
    }

    // Case 3: Default redirect (no linkType param)
    if (resolvedTokenId) {
      const defaultUrl = await idrService.resolveDefaultLink(productId, resolvedTokenId);

      return NextResponse.redirect(defaultUrl, {
        status: 302,
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'Vary': 'Accept, Accept-Language',
        },
      });
    }

    // Case 4: No tokenId - cannot resolve
    if (wantsRedirect) {
      return new NextResponse(
        `<!doctype html>
<html lang="${preferredLang ? preferredLang.replace(/"/g, '&quot;') : 'en'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Passport not available</title>
  </head>
  <body>
    <main style="max-width: 720px; margin: 48px auto; padding: 0 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;">
      <h1 style="font-size: 20px; margin: 0 0 8px;">Passport not available yet</h1>
      <p style="margin: 0 0 12px; color: #444;">
        No Digital Product Passport is currently published for <strong>${String(productId).replace(/</g, '&lt;')}</strong>.
      </p>
      <p style="margin: 0; color: #666;">
        If you expected to see a passport, ask the manufacturer for an updated link or try again later.
      </p>
    </main>
  </body>
</html>`,
        {
          status: 404,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
            'Vary': 'Accept, Accept-Language',
          },
        }
      );
    }

    // For machine clients, return a minimal linkset even when tokenId doesn't exist yet.
    const linkset = await idrService.generateLinkset(productId);
    applyGranularityAndStatus(linkset, { granularity: linksetGranularity, hasPassport: false });
    applyPreferredLanguage(linkset, preferredLang);
    return NextResponse.json(
      { linkset: [linkset] },
      {
        headers: {
          'Content-Type': 'application/linkset+json',
          'Cache-Control': 'public, max-age=3600',
          'Vary': 'Accept, Accept-Language',
        },
      }
    );

  } catch (error: any) {
    console.error('IDR resolution error:', error);

    return NextResponse.json(
      {
        error: 'Internal resolver error',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
