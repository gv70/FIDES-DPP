/**
 * VC Engine Interface
 * 
 * Abstract interface for issuing and verifying Digital Product Passport
 * Verifiable Credentials
 * 
 * @license Apache-2.0
 */

import type { DigitalProductPassport } from '../untp/generateDppJsonLd';
import type {
  VcEnvelope,
  IssueOptions,
  VerifyOptions,
  VerificationResult,
  PolkadotAccount,
} from './types';

export interface VcEngine {
  /**
   * Issue a DPP as a JWT-based Verifiable Credential
   * 
   * @param dppCore - The validated DPP data model
   * @param issuerAccount - Polkadot account for signing
   * @param options - Additional options (expiration, contexts, etc.)
   * @returns Signed VC envelope with JWT
   */
  issueDppVc(
    dppCore: DigitalProductPassport,
    issuerAccount: PolkadotAccount,
    options?: IssueOptions
  ): Promise<VcEnvelope>;

  /**
   * Verify a DPP VC (JWT format)
   * 
   * @param vcJwt - The JWT string to verify
   * @param options - Verification options
   * @returns Verification result with detailed info
   */
  verifyDppVc(
    vcJwt: string,
    options?: VerifyOptions
  ): Promise<VerificationResult>;

  /**
   * Decode VC without verification (for inspection)
   * 
   * @param vcJwt - The JWT string to decode
   * @returns Decoded VC envelope
   */
  decodeVc(vcJwt: string): VcEnvelope;

  /**
   * Extract DPP from verified VC
   * 
   * @param vcEnvelope - The VC envelope
   * @returns The DPP credential subject
   */
  extractDpp(vcEnvelope: VcEnvelope): DigitalProductPassport;
}

// Re-export types for convenience
export type {
  VcEnvelope,
  IssueOptions,
  VerifyOptions,
  VerificationResult,
  PolkadotAccount,
} from './types';
