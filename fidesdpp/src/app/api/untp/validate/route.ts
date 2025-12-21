/**
 * UNTP DPP Validation API Endpoint
 * 
 * Validates UNTP Digital Product Passport payloads against JSON Schema.
 * Uses remote schema to maintain Apache 2.0 compliance.
 * 
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUntpDpp, formatValidationErrors } from '@/lib/validation/validateUntpDpp';

export async function POST(request: NextRequest) {
  try {
    // 1. Parse request body
    const { payload } = await request.json();

    if (!payload) {
      return NextResponse.json(
        { 
          error: 'Payload is required',
          message: 'Request body must include a "payload" field with the UNTP DPP data to validate'
        },
        { status: 400 }
      );
    }

    // 2. Validate payload
    try {
      const result = await validateUntpDpp(payload);

      // 3. Return validation result
      return NextResponse.json({
        valid: result.valid,
        errors: result.errors,
        errorSummary: result.errors ? formatValidationErrors(result.errors) : undefined,
        schemaMeta: {
          url: result.schemaMeta.url,
          fetchedAt: result.schemaMeta.fetchedAt,
          sha256: result.schemaMeta.sha256,
          size: result.schemaMeta.size,
        },
      });

    } catch (schemaError: any) {
      // Schema loading failed
      return NextResponse.json(
        {
          error: 'Schema loading failed',
          message: schemaError.message || 'Failed to load UNTP schema',
          details: schemaError.code || 'UNKNOWN_ERROR',
        },
        { status: 502 } // Bad Gateway - upstream schema service unavailable
      );
    }

  } catch (error: any) {
    console.error('UNTP validation error:', error);
    
    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { 
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON'
        },
        { status: 400 }
      );
    }

    // Generic error
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error.message || 'Validation failed'
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint - returns schema metadata without validating
 */
export async function GET() {
  try {
    const { loadUntpSchema } = await import('@/lib/validation/untpSchema');
    const { meta } = await loadUntpSchema();

    return NextResponse.json({
      schemaUrl: meta.url,
      fetchedAt: meta.fetchedAt,
      sha256: meta.sha256,
      size: meta.size,
      cacheInfo: 'Schema is cached for 24 hours (configurable via UNTP_SCHEMA_CACHE_TTL_MS)',
    });

  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Schema loading failed',
        message: error.message || 'Failed to load schema metadata',
      },
      { status: 502 }
    );
  }
}
