/**
 * UNTP DTE Validator using Ajv
 *
 * Validates UNTP Digital Traceability Events payloads against JSON Schema.
 * Uses remote schema to maintain Apache 2.0 compliance (do not vendor UNTP schemas).
 *
 * Server-side only - do not import in client components.
 *
 * Input: this validates the **VC object** (e.g. `decoded.payload.vc` from `JwtVcEngine.decodeVc()`),
 * not the full JWT payload.
 *
 * @license Apache-2.0
 */

// import 'server-only';

import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { loadUntpSchema, type SchemaMetadata, SchemaLoadError } from './untpSchema';

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  schemaMeta: SchemaMetadata;
}

export interface ValidationError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message: string;
  params: Record<string, any>;
}

const validatorCache = new Map<string, { ajv: Ajv2020; validate: ValidateFunction }>();

const DEFAULT_DTE_SCHEMA_URL =
  process.env.UNTP_DTE_SCHEMA_URL || 'https://test.uncefact.org/vocabulary/untp/dte/untp-dte-schema-0.6.0.json';

export async function validateUntpDte(
  payload: unknown,
  options?: {
    schemaUrl?: string;
    strictMode?: boolean;
  }
): Promise<ValidationResult> {
  try {
    const schemaUrl = options?.schemaUrl || DEFAULT_DTE_SCHEMA_URL;
    const expectedSha256 = process.env.UNTP_DTE_SCHEMA_SHA256 || '';

    const { schema, meta } = await loadUntpSchema({
      url: schemaUrl,
      expectedSha256,
    });

    let cached = validatorCache.get(meta.sha256);
    if (!cached) {
      const ajv = new Ajv2020({
        allErrors: true,
        verbose: true,
        strict: options?.strictMode ?? false,
        allowUnionTypes: true,
        discriminator: true,
      });

      addFormats(ajv);

      const schemaObj = schema as any;
      const schemaId = schemaObj.$id || schemaObj.id || meta.url;

      try {
        ajv.addSchema(schema as any, schemaId);
      } catch (compileError: any) {
        throw new Error(`Schema compilation failed: ${compileError.message}`);
      }

      const validate = ajv.getSchema(schemaId);
      if (!validate) {
        throw new Error(`Failed to get compiled validator for schema: ${schemaId}`);
      }

      cached = { ajv, validate };
      validatorCache.set(meta.sha256, cached);
    }

    const valid = cached.validate(payload) as boolean;
    let errors: ValidationError[] | undefined;
    if (!valid && cached.validate.errors) {
      errors = cached.validate.errors.map(formatAjvError);
    }

    return {
      valid,
      errors,
      schemaMeta: meta,
    };
  } catch (error: any) {
    if (error instanceof SchemaLoadError) {
      throw new Error(`Failed to load UNTP DTE schema: ${error.message} (${error.code})`);
    }
    throw error;
  }
}

function formatAjvError(error: ErrorObject): ValidationError {
  return {
    instancePath: error.instancePath || '',
    schemaPath: error.schemaPath || '',
    keyword: error.keyword,
    message: error.message || 'Validation failed',
    params: error.params || {},
  };
}

export function formatDteValidationErrors(errors?: ValidationError[]): string {
  if (!errors || errors.length === 0) return 'No errors';

  const messages = errors.slice(0, 10).map((err) => {
    const path = err.instancePath || 'root';
    if (err.keyword === 'required') {
      const missing = err.params.missingProperty || 'unknown';
      return `${path}: missing required property "${missing}"`;
    }
    if (err.keyword === 'type') {
      const expected = err.params.type || 'unknown';
      return `${path}: invalid type (expected ${expected})`;
    }
    if (err.keyword === 'format') {
      const format = err.params.format || 'unknown';
      return `${path}: invalid format (expected ${format})`;
    }
    if (err.keyword === 'enum') {
      const allowed = err.params.allowedValues?.join(', ') || 'unknown';
      return `${path}: value not in allowed values [${allowed}]`;
    }
    if (err.keyword === 'const') {
      const expected = err.params.allowedValue;
      return `${path}: must be equal to constant "${expected}"`;
    }
    return `${path}: ${err.message}`;
  });

  if (errors.length > 10) messages.push(`... and ${errors.length - 10} more error(s)`);
  return messages.join('\n');
}

export function clearDteValidatorCache(): void {
  validatorCache.clear();
}

