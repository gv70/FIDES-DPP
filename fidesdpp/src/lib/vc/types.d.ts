/**
 * VC Engine Types
 *
 * Type definitions for Verifiable Credentials engine
 *
 * @license Apache-2.0
 */
import type { DigitalProductPassport } from '../untp/generateDppJsonLd';
export interface VcEnvelope {
    jwt: string;
    payload: {
        iss: string;
        sub: string;
        vc: {
            '@context': string[];
            type: string[];
            credentialSubject: DigitalProductPassport;
            credentialSchema?: {
                id: string;
                type: string;
            };
            schemaSha256?: string;
        };
        nbf?: number;
        exp?: number;
        jti?: string;
    };
    header: {
        alg: string;
        typ: 'JWT';
    };
}
export interface IssueOptions {
    expirationDate?: Date;
    credentialId?: string;
    additionalContexts?: string[];
}
export interface VerifyOptions {
    checkExpiration?: boolean;
    checkRevocation?: boolean;
    audience?: string;
}
export interface VerificationResult {
    verified: boolean;
    issuer: string;
    issuanceDate: Date;
    expirationDate?: Date;
    errors: string[];
    warnings: string[];
    payload?: any;
}
/**
 * Supported key types for VC-JWT signing
 *
 * CRITICAL: Only ed25519 is JWS-standard for EdDSA algorithm.
 * sr25519 is NOT compatible with standard JWT libraries (did-jwt-vc).
 */
export type KeyType = 'ed25519' | 'secp256k1';
export interface PolkadotAccount {
    address: string;
    publicKey: Uint8Array;
    sign: (data: Uint8Array) => Promise<Uint8Array>;
    network?: string;
    keyType?: KeyType;
}
/**
 * Decoded VC-JWT structure
 *
 * Result of decoding a raw JWT string without verification.
 * Used for visualization and extraction purposes.
 */
export interface DecodedVcJwt {
    /** Decoded JWT header (alg, typ, etc.) */
    header: any;
    /** Decoded JWT payload (iss, sub, vc, etc.) */
    payload: any;
    /** Base64URL-encoded signature (for display only, not verified) */
    signature: string;
    /** Original raw JWT string */
    raw: string;
}
/**
 * Extracted DPP result from VC payload
 *
 * Contains both the full VC object (for validation) and the DPP object (credentialSubject).
 */
export interface ExtractedDppResult {
    /** Full VC object for validation (includes @context, type, credentialSchema, etc.) */
    vcObject: any;
    /** UNTP DPP object (the credentialSubject) */
    dppObject: any;
}
//# sourceMappingURL=types.d.ts.map