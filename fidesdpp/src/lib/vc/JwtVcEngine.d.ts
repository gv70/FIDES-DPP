/**
 * JWT VC Engine Implementation
 *
 * Implements VcEngine interface using JWT-based Verifiable Credentials
 * Uses did-jwt-vc library for VC issuance and verification
 *
 * @license Apache-2.0
 */
import type { VcEngine } from './VcEngine';
import type { VcEnvelope, IssueOptions, VerifyOptions, VerificationResult, PolkadotAccount } from './types';
import type { DigitalProductPassport } from '../untp/generateDppJsonLd';
import type { VcIssuerIdentity } from './issuer-identity';
import type { StatusListManager } from './StatusListManager';
/**
 * JWT-based VC Engine for UNTP Digital Product Passports
 *
 * Supports both did:key (legacy) and did:web (UNTP-compliant) issuer DIDs.
 * The Polkadot account is kept separate as chain metadata.
 *
 * Phase 2+: Integrates W3C Bitstring Status List for credential revocation.
 */
export declare class JwtVcEngine implements VcEngine {
    private resolver;
    private statusListManager?;
    constructor(statusListManager?: StatusListManager);
    issueDppVc(dppCore: DigitalProductPassport, issuerAccount: PolkadotAccount, options?: IssueOptions): Promise<VcEnvelope>;
    /**
     * Issue DPP VC using explicit issuer identity (UNTP-compliant path)
     *
     * This method decouples VC issuer identity from blockchain wallet.
     * Supports both did:web (organizational) and did:key (legacy) methods.
     *
     * @param dppCore - Digital Product Passport data
     * @param issuerIdentity - VC issuer identity (did:web or did:key)
     * @param blockchainAccount - Polkadot account for on-chain transactions (any key type)
     * @param options - Optional issuance options
     * @returns VC envelope with JWT
     */
    issueDppVcWithIdentity(dppCore: DigitalProductPassport, issuerIdentity: VcIssuerIdentity, blockchainAccount: PolkadotAccount, options?: IssueOptions & {
        tokenId?: string;
    }): Promise<VcEnvelope>;
    verifyDppVc(vcJwt: string, options?: VerifyOptions & {
        tokenId?: string;
    }): Promise<VerificationResult>;
    decodeVc(vcJwt: string): VcEnvelope;
    extractDpp(vcEnvelope: VcEnvelope): DigitalProductPassport;
    /**
     * Create a JWT signer from Polkadot account
     */
    private createSigner;
    /**
     * Base64 URL decode
     */
    private base64UrlDecode;
    /**
     * Base64 URL encode
     */
    private base64UrlEncode;
}
//# sourceMappingURL=JwtVcEngine.d.ts.map