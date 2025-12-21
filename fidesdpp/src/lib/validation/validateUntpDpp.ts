/**
 * UNTP DPP Validator using Ajv
 * 
 * Validates UNTP Digital Product Passport payloads against JSON Schema.
 * Uses remote schema to maintain Apache 2.0 compliance.
 * 
 * Server-side only - do not import in client components.
 * 
 * Input: This validates the **entire VC object** (not just credentialSubject).
 * The UNTP schema defines the full VerifiableCredential structure including
 * @context, type, issuer, credentialSubject, etc.
 * 
 * @license Apache-2.0
 */

// Server-only protection (commented for test compatibility)
// Uncomment in production builds to prevent client bundling
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
  /** Path to the invalid property (e.g., "/credentialSubject/product/name") */
  instancePath: string;
  /** Path in schema (e.g., "#/properties/credentialSubject/properties/product") */
  schemaPath: string;
  /** Validation keyword that failed (e.g., "required", "type", "format") */
  keyword: string;
  /** Human-readable error message */
  message: string;
  /** Additional parameters (e.g., { missingProperty: "name" }) */
  params: Record<string, any>;
}

/**
 * Cached Ajv instances and compiled validators
 * Key: schema SHA-256 hash
 */
const validatorCache = new Map<string, { ajv: Ajv2020; validate: ValidateFunction }>();

/**
 * Validate a UNTP DPP payload against the UNTP JSON Schema
 * 
 * **What gets validated**: The entire VC object (not just credentialSubject).
 * Pass the full VerifiableCredential object as returned by VcEngine.decodeVc().
 * 
 * @param payload - Full UNTP DPP VC object to validate
 * @param options - Optional configuration override
 * @returns Validation result with errors (if any) and schema metadata
 * 
 * @example
 * ```typescript
 * const vcPayload = vcEngine.decodeVc(vcJwt);
 * const result = await validateUntpDpp(vcPayload);
 * if (!result.valid) {
 *   console.error('Validation errors:', formatValidationErrors(result.errors));
 * }
 * ```
 */
export async function validateUntpDpp(
  payload: unknown,
  options?: {
    schemaUrl?: string;
    strictMode?: boolean;
  }
): Promise<ValidationResult> {
  try {
    // 1. Load schema (from cache or remote)
    const { schema, meta } = await loadUntpSchema(
      options?.schemaUrl ? { url: options.schemaUrl } : undefined
    );

    // 2. Get or create Ajv validator for this schema version
    let cached = validatorCache.get(meta.sha256);
    
    if (!cached) {
      // Use Ajv2020 to support JSON Schema Draft 2020-12 (used by UNTP)
      const ajv = new Ajv2020({
        allErrors: true,           // Collect all errors, not just first
        verbose: true,             // Include schema and data in errors
        strict: options?.strictMode ?? false,  // Strict mode (default: false for compatibility)
        allowUnionTypes: true,     // Allow union types
        discriminator: true,       // Support discriminator keyword
      });

      // Add format validators (date-time, uri, email, etc.)
      addFormats(ajv);

      // Get schema $id or use schema URL as fallback key
      const schemaObj = schema as any;
      const schemaId = schemaObj.$id || schemaObj.id || meta.url;

      // Add schema to Ajv instance
      try {
        ajv.addSchema(schema as any, schemaId);
      } catch (compileError: any) {
        throw new Error(`Schema compilation failed: ${compileError.message}`);
      }

      // Get compiled validator by schema ID/URL
      const validate = ajv.getSchema(schemaId);
      
      if (!validate) {
        throw new Error(`Failed to get compiled validator for schema: ${schemaId}`);
      }

      // Cache both Ajv instance and compiled validator
      cached = { ajv, validate };
      validatorCache.set(meta.sha256, cached);
    }

    // 3. Validate payload
    const valid = cached.validate(payload) as boolean;

    // 4. Format errors if validation failed
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
    // Handle schema loading errors
    if (error instanceof SchemaLoadError) {
      throw new Error(
        `Failed to load UNTP schema: ${error.message} (${error.code})`
      );
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Format Ajv error to our ValidationError format
 */
function formatAjvError(error: ErrorObject): ValidationError {
  return {
    instancePath: error.instancePath || '',
    schemaPath: error.schemaPath || '',
    keyword: error.keyword,
    message: error.message || 'Validation failed',
    params: error.params || {},
  };
}

/**
 * Create a human-friendly error summary from validation errors
 * 
 * Limits output to first 10 errors for readability.
 * 
 * @param errors - Validation errors
 * @returns Formatted error message
 */
export function formatValidationErrors(errors?: ValidationError[]): string {
  if (!errors || errors.length === 0) {
    return 'No errors';
  }

  const messages = errors.slice(0, 10).map(err => {
    const path = err.instancePath || 'root';
    
    // Format based on error type
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

  if (errors.length > 10) {
    messages.push(`... and ${errors.length - 10} more error(s)`);
  }

  return messages.join('\n');
}

/**
 * Clear validator cache (useful for testing)
 */
export function clearValidatorCache(): void {
  validatorCache.clear();
}

/**
 * Get validator cache statistics
 */
export function getValidatorCacheStats(): {
  compiledValidators: number;
  schemaSha256s: string[];
} {
  return {
    compiledValidators: validatorCache.size,
    schemaSha256s: Array.from(validatorCache.keys()),
  };
}
