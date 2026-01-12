/**
 * UNTP DTE Events Validation API Endpoint
 *
 * Validates a DTE "events[]" input by first building the UNTP DTE VC JSON payload
 * (same shape used for VC-JWT issuance), then validating the VC against JSON Schema.
 *
 * POST /api/untp/dte/validate-events
 * Body:
 *  - issuerDid?: string (did:web:...)
 *  - domain?: string (legacy convenience; equivalent to issuerDid=did:web:<domain>)
 *  - events: object[] (credentialSubject array)
 *  - credentialId?: string
 *  - expirationDate?: string (ISO 8601)
 *  - additionalContexts?: string[]
 *
 * @license Apache-2.0
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDidWebManager, IssuerStatus } from '@/lib/vc/did-web-manager';
import { validateUntpDte, formatDteValidationErrors } from '@/lib/validation/validateUntpDte';

function parseOptionalDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid expirationDate: expected ISO 8601 date string');
  }
  return date;
}

function buildDteVc(params: {
  events: unknown[];
  issuerDid: string;
  issuerName: string;
  credentialId?: string;
  expirationDate?: Date;
  additionalContexts?: string[];
}) {
  const credentialId = params.credentialId || `urn:uuid:${crypto.randomUUID()}`;
  const dteContextUrl =
    process.env.UNTP_DTE_CONTEXT_URL || 'https://test.uncefact.org/vocabulary/untp/dte/0.6.0/';

  const vc: any = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      dteContextUrl,
      'https://www.w3.org/2018/credentials/v1',
      ...(params.additionalContexts || []),
    ],
    type: ['VerifiableCredential', 'DigitalTraceabilityEvent'],
    id: credentialId,
    issuer: {
      type: ['CredentialIssuer'],
      id: params.issuerDid,
      name: params.issuerName,
    },
    validFrom: new Date().toISOString(),
    ...(params.expirationDate && { validUntil: params.expirationDate.toISOString() }),
    credentialSubject: params.events,
    credentialSchema: {
      id:
        process.env.UNTP_DTE_SCHEMA_URL ||
        'https://test.uncefact.org/vocabulary/untp/dte/untp-dte-schema-0.6.0.json',
      type: 'JsonSchema2023',
    },
    ...(process.env.UNTP_DTE_SCHEMA_SHA256 && {
      schemaSha256: process.env.UNTP_DTE_SCHEMA_SHA256,
    }),
  };

  return vc;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const issuerDidRaw = body?.issuerDid ? String(body.issuerDid).trim() : '';
    const domain = String(body?.domain || '').trim();
    const events = body?.events;

    const issuerDid =
      issuerDidRaw && issuerDidRaw.startsWith('did:web:')
        ? issuerDidRaw
        : domain
          ? `did:web:${domain}`
          : '';

    if (!issuerDid) {
      return NextResponse.json(
        { error: 'issuerDid or domain is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'Events must be a non-empty array' }, { status: 400 });
    }

    const manager = getDidWebManager();
    const issuerIdentity = await manager.getIssuerIdentity(issuerDid);
    if (!issuerIdentity) {
      return NextResponse.json(
        {
          error: 'Issuer not registered',
          message: `Issuer ${issuerDid} is not registered locally in this environment.`,
        },
        { status: 404 }
      );
    }

    if (issuerIdentity.status !== IssuerStatus.VERIFIED) {
      return NextResponse.json(
        {
          error: 'Issuer not verified',
          message: `Issuer ${issuerDid} is ${issuerIdentity.status}. Host did.json and verify it before issuing.`,
          status: issuerIdentity.status,
        },
        { status: 409 }
      );
    }

    const issuerName =
      issuerIdentity.metadata?.organizationName ||
      issuerIdentity.metadata?.domain ||
      issuerIdentity.did;

    const vc = buildDteVc({
      events,
      issuerDid,
      issuerName,
      credentialId: body?.credentialId ? String(body.credentialId) : undefined,
      expirationDate: parseOptionalDate(body?.expirationDate),
      additionalContexts: Array.isArray(body?.additionalContexts) ? body.additionalContexts.map(String) : undefined,
    });

    const result = await validateUntpDte(vc);

    return NextResponse.json({
      valid: result.valid,
      errors: result.errors,
      errorSummary: result.errors ? formatDteValidationErrors(result.errors) : undefined,
      vc,
      schemaMeta: {
        url: result.schemaMeta.url,
        fetchedAt: result.schemaMeta.fetchedAt,
        sha256: result.schemaMeta.sha256,
        size: result.schemaMeta.size,
      },
    });
  } catch (error: any) {
    console.error('UNTP DTE validate-events error:', error);
    return NextResponse.json(
      { error: 'Failed to validate DTE events', message: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

