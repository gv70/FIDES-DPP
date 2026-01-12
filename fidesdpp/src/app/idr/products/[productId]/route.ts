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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ productId: string }> }
): Promise<NextResponse> {
  try {
    const { productId } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const linkType = searchParams.get('linkType');
    const tokenId = searchParams.get('tokenId');

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

    // Case 1: Return linkset JSON
    if (linkType === 'linkset') {
      // Use resolveProductLinkset if anagrafica is available (includes all DPPs for product)
      // Otherwise fall back to generateLinkset with explicit tokenId
      let linkset;
      
      if (anagraficaService) {
        linkset = await idrService.resolveProductLinkset(productId);
      } else if (tokenId) {
        linkset = await idrService.generateLinkset(productId, tokenId);
      } else {
        return NextResponse.json(
          { error: 'tokenId required for linkset generation (anagrafica not available)' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { linkset: [linkset] },
        {
          headers: {
            'Content-Type': 'application/linkset+json',
            'Cache-Control': 'public, max-age=3600',
          },
        }
      );
    }

    // Case 2: Return specific link type
    if (linkType) {
      if (!tokenId) {
        return NextResponse.json(
          { error: 'tokenId required for link resolution' },
          { status: 400 }
        );
      }

      const linkUrl = await idrService.resolveLinkByType(productId, linkType, tokenId);

      if (!linkUrl) {
        return NextResponse.json(
          { error: `Link type not found: ${linkType}` },
          { status: 404 }
        );
      }

      // Return link as JSON
      return NextResponse.json(
        { 
          productId,
          linkType,
          url: linkUrl,
        },
        {
          headers: {
            'Cache-Control': 'public, max-age=3600',
          },
        }
      );
    }

    // Case 3: Default redirect (no linkType param)
    // Try to lookup tokenId from anagrafica if not provided
    let resolvedTokenId = tokenId;
    
    if (!resolvedTokenId && anagraficaService) {
      resolvedTokenId = await idrService.lookupTokenId(productId);
    }
    
    if (resolvedTokenId) {
      const defaultUrl = await idrService.resolveDefaultLink(productId, resolvedTokenId);

      return NextResponse.redirect(defaultUrl, {
        status: 302,
        headers: {
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Case 4: No tokenId - cannot resolve
    return NextResponse.json(
      {
        error: 'tokenId required for product resolution',
        productId,
        help: 'Use: /idr/products/{productId}?tokenId={id}&linkType={type}',
        availableLinkTypes: ['linkset', 'untp:dpp', 'untp:dte', 'alternate'],
        note: anagraficaService 
          ? 'Anagrafica available - tokenId can be auto-resolved for known products'
          : 'Anagrafica not available - tokenId must be provided explicitly',
      },
      { status: 400 }
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

