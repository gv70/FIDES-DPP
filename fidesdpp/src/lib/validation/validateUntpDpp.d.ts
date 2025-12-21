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
import { type SchemaMetadata } from './untpSchema';
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
export declare function validateUntpDpp(payload: unknown, options?: {
    schemaUrl?: string;
    strictMode?: boolean;
}): Promise<ValidationResult>;
/**
 * Create a human-friendly error summary from validation errors
 *
 * Limits output to first 10 errors for readability.
 *
 * @param errors - Validation errors
 * @returns Formatted error message
 */
export declare function formatValidationErrors(errors?: ValidationError[]): string;
/**
 * Clear validator cache (useful for testing)
 */
export declare function clearValidatorCache(): void;
/**
 * Get validator cache statistics
 */
export declare function getValidatorCacheStats(): {
    compiledValidators: number;
    schemaSha256s: string[];
};
//# sourceMappingURL=validateUntpDpp.d.ts.map