/**
 * UNTP DTE Validation API Endpoint
 *
 * Validates UNTP Digital Traceability Events credentials (VC JSON) against JSON Schema.
 * Uses remote schema to maintain Apache 2.0 compliance (no vendoring UNTP artifacts).
 *
 * POST /api/untp/dte/validate
 * Body: { payload: object, schemaUrl?: string }
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUntpDte, formatDteValidationErrors } from '@/lib/validation/validateUntpDte';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = body?.payload;
    const schemaUrl = body?.schemaUrl ? String(body.schemaUrl) : undefined;

    if (!payload) {
      return NextResponse.json(
        {
          error: 'Payload is required',
          message: 'Request body must include a "payload" field with the DTE VC object to validate',
        },
        { status: 400 }
      );
    }

    try {
      const result = await validateUntpDte(payload, schemaUrl ? { schemaUrl } : undefined);

      return NextResponse.json({
        valid: result.valid,
        errors: result.errors,
        errorSummary: result.errors ? formatDteValidationErrors(result.errors) : undefined,
        schemaMeta: {
          url: result.schemaMeta.url,
          fetchedAt: result.schemaMeta.fetchedAt,
          sha256: result.schemaMeta.sha256,
          size: result.schemaMeta.size,
        },
      });
    } catch (schemaError: any) {
      return NextResponse.json(
        {
          error: 'Schema loading failed',
          message: schemaError.message || 'Failed to load UNTP DTE schema',
          details: schemaError.code || 'UNKNOWN_ERROR',
        },
        { status: 502 }
      );
    }
  } catch (error: any) {
    console.error('UNTP DTE validation error:', error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON', message: 'Request body must be valid JSON' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', message: error.message || 'Validation failed' },
      { status: 500 }
    );
  }
}

