/**
 * JWT VC Engine Implementation
 * 
 * Implements VcEngine interface using JWT-based Verifiable Credentials
 * Uses did-jwt-vc library for VC issuance and verification
 * 
 * @license Apache-2.0
 */

import { createVerifiableCredentialJwt, verifyCredential } from 'did-jwt-vc';
import { SignJWT, importJWK, jwtVerify } from 'jose';
import { createDidResolver, createKeyDid } from './did-resolver';

// Helper function to extract public key from multibase (for logging/debugging)
function extractPublicKeyFromMultibase(multibase: string): Uint8Array {
  if (!multibase.startsWith('z')) {
    throw new Error(`Invalid multibase format: expected 'z' prefix, got '${multibase[0]}'`);
  }
  
  // Simple base58 decode (for debugging only - use proper implementation in production)
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const encoded = multibase.slice(1);
  
  let num = BigInt(0);
  for (const char of encoded) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid base58 character: ${char}`);
    num = num * BigInt(58) + BigInt(index);
  }
  
  const bytes: number[] = [];
  while (num > 0) {
    bytes.unshift(Number(num % BigInt(256)));
    num = num / BigInt(256);
  }
  
  for (let i = 0; i < encoded.length && encoded[i] === ALPHABET[0]; i++) {
    bytes.unshift(0);
  }
  
  const decoded = new Uint8Array(bytes);
  
  // Check multicodec prefix (0xed01 for Ed25519)
  if (decoded.length < 2 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error(`Invalid multicodec prefix`);
  }
  
  // Extract public key (skip 2-byte prefix)
  const publicKey = decoded.slice(2);
  if (publicKey.length !== 32) {
    throw new Error(`Invalid public key length: expected 32 bytes, got ${publicKey.length}`);
  }
  
  return publicKey;
}
import type { VcEngine } from './VcEngine';
import type {
  VcEnvelope,
  IssueOptions,
  VerifyOptions,
  VerificationResult,
  PolkadotAccount,
} from './types';
import type { DigitalProductPassport } from '../untp/generateDppJsonLd';
import type { VcIssuerIdentity } from './issuer-identity';
import { createIssuerSigner } from './issuer-identity';
import type { StatusListManager } from './StatusListManager';

/**
 * JWT-based VC Engine for UNTP Digital Product Passports
 * 
 * Supports both did:key (legacy) and did:web (UNTP-compliant) issuer DIDs.
 * The Polkadot account is kept separate as chain metadata.
 * 
 * Phase 2+: Integrates W3C Bitstring Status List for credential revocation.
 */
export class JwtVcEngine implements VcEngine {
  private resolver: ReturnType<typeof createDidResolver>;
  private statusListManager?: StatusListManager;
  private debug: boolean;

  constructor(statusListManager?: StatusListManager) {
    // Initialize DID resolver for both did:key and did:web
    this.resolver = createDidResolver();
    this.statusListManager = statusListManager;
    this.debug = process.env.DEBUG_VC === 'true';
  }

  async issueDppVc(
    dppCore: DigitalProductPassport,
    issuerAccount: PolkadotAccount,
    options?: IssueOptions
  ): Promise<VcEnvelope> {
    // CRITICAL VALIDATION: Ensure we're using ed25519 (EdDSA-compatible)
    // sr25519 is NOT JWS-standard and will fail verification with did-jwt-vc
    const keyType = issuerAccount.keyType || 'ed25519'; // Default to ed25519
    
    if (keyType !== 'ed25519') {
      throw new Error(
        `Unsupported key type for VC-JWT: ${keyType}. ` +
        `Only 'ed25519' is supported for EdDSA algorithm. ` +
        `sr25519 is NOT JWS-standard and incompatible with did-jwt-vc. ` +
        `Please ensure your Polkadot account uses ed25519 keys.`
      );
    }
    
    // Validate public key length for ed25519 (32 bytes)
    if (issuerAccount.publicKey.length !== 32) {
      throw new Error(
        `Invalid ed25519 public key length: expected 32 bytes, got ${issuerAccount.publicKey.length}. ` +
        `Ensure issuerAccount.publicKey contains the raw ed25519 public key bytes.`
      );
    }
    
    // 1. Create did:key DID from ed25519 public key
    // This is the ONLY way to create the issuer DID - directly from the public key
    const issuerDid = createKeyDid(issuerAccount.publicKey);

    // 2. Add chain anchor to DPP (Polkadot account as metadata)
    // Keep any existing metadata (e.g., tokenId/version/previous hash) and overwrite network/account.
    const existingChainAnchor = (dppCore as any)?.chainAnchor || {};
    const dppWithChainAnchor = {
      ...dppCore,
      chainAnchor: {
        ...existingChainAnchor,
        '@type': 'BlockchainAnchor',
        network: `polkadot:${issuerAccount.network || 'westend-asset-hub'}`,
        issuerAccount: issuerAccount.address,
        ...(existingChainAnchor?.version == null ? { version: 1 } : {}),
      },
    };

    const credentialId = options?.credentialId || `urn:uuid:${this.generateUuid()}`;
    const dppContextUrl =
      process.env.UNTP_DPP_CONTEXT_URL || 'https://test.uncefact.org/vocabulary/untp/dpp/0.6.0/';
    const idrBaseUrl = (process.env.IDR_BASE_URL || process.env.RENDER_BASE_URL || 'http://localhost:3000').replace(
      /\/$/,
      ''
    );

    // 3. Build VC payload (UNTP-compliant with schema reference)
    const vcPayload: any = {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        dppContextUrl,
        'https://www.w3.org/2018/credentials/v1',
        ...(options?.additionalContexts || []),
      ],
      type: ['VerifiableCredential', 'DigitalProductPassport'],
      id: credentialId,
      issuer: {
        type: ['CredentialIssuer'],
        id: issuerDid,
        name: issuerDid,
      },
      validFrom: new Date().toISOString(),
      ...(options?.expirationDate && { validUntil: options.expirationDate.toISOString() }),
      credentialSubject: dppWithChainAnchor,
      // W3C standard credentialSchema field
      credentialSchema: {
        id: process.env.UNTP_SCHEMA_URL || 
            'https://test.uncefact.org/vocabulary/untp/dpp/untp-dpp-schema-0.6.0.json',
        type: 'JsonSchema2023',
      },
      // Optional: SHA-256 hash of schema for integrity verification
      ...(process.env.UNTP_SCHEMA_SHA256 && {
        schemaSha256: process.env.UNTP_SCHEMA_SHA256,
      }),
    };

    // UNTP render method: stable Identity Resolver URL (works before tokenId exists)
    const productIdentifier = String((dppCore as any)?.product?.identifier || '').trim();
    if (productIdentifier) {
      vcPayload.renderMethod = [
        {
          id: `${idrBaseUrl}/idr/products/${encodeURIComponent(productIdentifier)}`,
          type: 'text/html',
          name: 'Human-readable Digital Product Passport',
        },
      ];
    }

    if (this.statusListManager) {
      try {
        const statusListEntry = await this.statusListManager.assignIndex(issuerDid, credentialId);
        if (!vcPayload['@context'].includes('https://w3id.org/vc/status-list/2021/v1')) {
          vcPayload['@context'].push('https://w3id.org/vc/status-list/2021/v1');
        }
        vcPayload.credentialStatus = statusListEntry;
      } catch (error: any) {
        console.warn('Failed to assign status list index:', error.message);
      }
    }

    // 4. Create JWT signer using Polkadot account
    const signer = this.createSigner(issuerAccount);

    // 5. Issue VC as JWT with EdDSA algorithm
    // EdDSA (RFC 8037) REQUIRES ed25519 keys. sr25519 is NOT compatible.
    const vcJwt = await createVerifiableCredentialJwt(
      vcPayload,
      {
        did: issuerDid,
        signer,
        alg: 'EdDSA', // EdDSA = Ed25519 signature algorithm (JWS-standard)
      },
      {
        exp: options?.expirationDate 
          ? Math.floor(options.expirationDate.getTime() / 1000)
          : undefined,
        jti: credentialId,
      }
    );

    // 6. Decode for envelope
    const decoded = this.decodeVc(vcJwt);

    return decoded;
  }

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
  async issueDppVcWithIdentity(
    dppCore: DigitalProductPassport,
    issuerIdentity: VcIssuerIdentity,
    blockchainAccount: PolkadotAccount,
    options?: IssueOptions & { tokenId?: string }
  ): Promise<VcEnvelope> {
    // Validate issuer identity
    if (issuerIdentity.signingKey.type !== 'ed25519') {
      throw new Error(
        `Invalid signing key type: ${issuerIdentity.signingKey.type}. ` +
        `Only 'ed25519' is supported for EdDSA algorithm.`
      );
    }

    if (issuerIdentity.signingKey.publicKey.length !== 32) {
      throw new Error(
        `Invalid ed25519 public key length: expected 32 bytes, got ${issuerIdentity.signingKey.publicKey.length}`
      );
    }

    // Add chain anchor to DPP (Polkadot account as metadata)
    // Note: blockchainAccount is required for chainAnchor metadata
    // For did:web issuance, this account is NOT used for signing (uses issuer's private key)
    // but is required to populate chainAnchor.issuerAccount
    // Keep any existing metadata (e.g., tokenId/version/previous hash) and overwrite network/account.
    const existingChainAnchor = (dppCore as any)?.chainAnchor || {};
    const dppWithChainAnchor = {
      ...dppCore,
      chainAnchor: {
        ...existingChainAnchor,
        '@type': 'BlockchainAnchor',
        network: `polkadot:${blockchainAccount.network || 'westend-asset-hub'}`,
        issuerAccount: blockchainAccount.address,
        ...(existingChainAnchor?.version == null ? { version: 1 } : {}),
      },
    };

    const credentialId = options?.credentialId || `urn:uuid:${this.generateUuid()}`;
    const dppContextUrl =
      process.env.UNTP_DPP_CONTEXT_URL || 'https://test.uncefact.org/vocabulary/untp/dpp/0.6.0/';
    const issuerName =
      issuerIdentity.metadata?.organizationName ||
      issuerIdentity.metadata?.domain ||
      issuerIdentity.did;
    const idrBaseUrl = (process.env.IDR_BASE_URL || process.env.RENDER_BASE_URL || 'http://localhost:3000').replace(
      /\/$/,
      ''
    );

    // Build VC payload (UNTP-compliant with schema reference)
    const vcPayload: any = {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        dppContextUrl,
        'https://www.w3.org/2018/credentials/v1',
        ...(options?.additionalContexts || []),
      ],
      type: ['VerifiableCredential', 'DigitalProductPassport'],
      id: credentialId,
      issuer: {
        type: ['CredentialIssuer'],
        id: issuerIdentity.did,
        name: issuerName,
      },
      validFrom: new Date().toISOString(),
      ...(options?.expirationDate && { validUntil: options.expirationDate.toISOString() }),
      credentialSubject: dppWithChainAnchor,
      // W3C standard credentialSchema field
      credentialSchema: {
        id: process.env.UNTP_SCHEMA_URL || 
            'https://test.uncefact.org/vocabulary/untp/dpp/untp-dpp-schema-0.6.0.json',
        type: 'JsonSchema2023',
      },
      // Optional: SHA-256 hash of schema for integrity verification
      ...(process.env.UNTP_SCHEMA_SHA256 && {
        schemaSha256: process.env.UNTP_SCHEMA_SHA256,
      }),
    };

    // UNTP render method: stable Identity Resolver URL (works before tokenId exists)
    const productIdentifier = String((dppCore as any)?.product?.identifier || '').trim();
    if (productIdentifier) {
      vcPayload.renderMethod = [
        {
          id: `${idrBaseUrl}/idr/products/${encodeURIComponent(productIdentifier)}`,
          type: 'text/html',
          name: 'Human-readable Digital Product Passport',
        },
      ];
    }

    // Phase 2+: Add credentialStatus (UNTP MUST requirement)
    if (this.statusListManager) {
      try {
        const statusListEntry = await this.statusListManager.assignIndex(
          issuerIdentity.did,
          credentialId
        );
        
        // Add Status List context
        if (!vcPayload['@context'].includes('https://w3id.org/vc/status-list/2021/v1')) {
          vcPayload['@context'].push('https://w3id.org/vc/status-list/2021/v1');
        }
        
        vcPayload.credentialStatus = statusListEntry;
      } catch (error: any) {
        console.warn('Failed to assign status list index:', error.message);
        // Continue without credentialStatus (backward compatible)
      }
    }

    // Note: renderMethod is set above to the stable IDR URL (preferred for UNTP interoperability).

    // Create JWT signer from issuer identity
    // For did:web: uses server-managed private key
    // For did:key: requires external signer (not used in this method, but kept for consistency)
    if (this.debug) {
      console.log(`[VC] Issuer: ${issuerIdentity.did} (${issuerIdentity.method})`);
    }
    
    const signer = createIssuerSigner(issuerIdentity);

    // Resolve DID document to verify it's accessible
    if (this.debug) {
      console.log(`[VC] Resolving DID document: ${issuerIdentity.did}`);
    }
    const didResolution = await this.resolver.resolve(issuerIdentity.did);
    if (this.debug && !didResolution.didDocument) {
      console.warn(`[VC] DID resolution failed`, didResolution.didResolutionMetadata);
    }

    // Issue VC as JWT with EdDSA algorithm
    // For did:web, try to use JsonWebKey2020 verificationMethod if available (better did-jwt-vc compatibility)
    let keyId: string | undefined;
    if (issuerIdentity.method === 'did:web' && didResolution.didDocument) {
      // Look for JsonWebKey2020 verificationMethod first (better compatibility)
      const jwkVm = didResolution.didDocument.verificationMethod?.find(
        (vm: any) => vm.type === 'JsonWebKey2020' && vm.publicKeyJwk
      );
      if (jwkVm) {
        keyId = jwkVm.id;
        console.log(`[VC Issuance] Using JsonWebKey2020 verificationMethod: ${keyId}`);
      } else {
        // Fallback to first verificationMethod with assertionMethod
        const firstVm = didResolution.didDocument.verificationMethod?.[0];
        if (firstVm && didResolution.didDocument.assertionMethod?.includes(firstVm.id)) {
          keyId = firstVm.id;
          console.log(`[VC Issuance] Using first assertionMethod verificationMethod: ${keyId}`);
        }
      }
    }
    
    if (this.debug) {
      console.log(`[VC] Creating VC-JWT (EdDSA${keyId ? `, kid: ${keyId}` : ''})`);
    }
    
    // Build issuer options with explicit kid for did:web (critical for signature verification)
    const issuerOptions: any = {
      did: issuerIdentity.did,
      signer,
      alg: 'EdDSA', // EdDSA = Ed25519 signature algorithm (JWS-standard)
    };
    
    // CRITICAL: Explicitly set kid for did:web to guide did-jwt-vc to the correct verificationMethod
    if (keyId) {
      issuerOptions.kid = keyId;
      console.log(`[VC Issuance] Explicitly setting kid in JWT header: ${keyId}`);
    }
    
    const vcJwt = await createVerifiableCredentialJwt(
      vcPayload,
      issuerOptions,
      {
        exp: options?.expirationDate 
          ? Math.floor(options.expirationDate.getTime() / 1000)
          : undefined,
        jti: credentialId,
      }
    );
    if (this.debug) {
      console.log(`[VC] VC-JWT created (${vcJwt.length} chars)`);
    }
    
    // Decode JWT to verify structure and verify key match
    try {
      const jwtParts = vcJwt.split('.');
      if (jwtParts.length === 3) {
        const header = JSON.parse(Buffer.from(jwtParts[0], 'base64url').toString('utf-8'));
        const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf-8'));
        console.log(`[VC Issuance] JWT Header:`, { alg: header.alg, typ: header.typ, kid: header.kid });
        console.log(`[VC Issuance] JWT Payload issuer: ${payload.iss || payload.issuer}`);
        
        // CRITICAL: Verify that the public key used for signing matches the one in DID document
        if (didResolution.didDocument) {
          const signingPublicKeyHex = Buffer.from(issuerIdentity.signingKey.publicKey).toString('hex');
          console.log(`[VC Issuance] Signing public key (hex): ${signingPublicKeyHex}`);
          
          // Check all verificationMethods for matching public key
          for (const vm of didResolution.didDocument.verificationMethod || []) {
            if (vm.publicKeyJwk && vm.publicKeyJwk.x) {
              try {
                const vmPublicKeyBytes = Buffer.from(vm.publicKeyJwk.x, 'base64url');
                const vmPublicKeyHex = vmPublicKeyBytes.toString('hex');
                console.log(`[VC Issuance] VerificationMethod ${vm.id} public key (hex): ${vmPublicKeyHex}`);
                
                if (vmPublicKeyHex === signingPublicKeyHex) {
                  console.log(`[VC Issuance] Public key match in verificationMethod: ${vm.id}`);
                } else {
                  console.log(`[VC Issuance] Public key mismatch in verificationMethod: ${vm.id}`);
                }
              } catch (e) {
                console.warn(`[VC Issuance] Failed to decode publicKeyJwk.x for ${vm.id}:`, e);
              }
            }
            
            if (vm.publicKeyMultibase) {
              try {
                const vmPublicKey = extractPublicKeyFromMultibase(vm.publicKeyMultibase);
                const vmPublicKeyHex = Buffer.from(vmPublicKey).toString('hex');
                console.log(`[VC Issuance] VerificationMethod ${vm.id} public key from multibase (hex): ${vmPublicKeyHex}`);
                
                if (vmPublicKeyHex === signingPublicKeyHex) {
                  console.log(`[VC Issuance] Public key match in verificationMethod (multibase): ${vm.id}`);
                } else {
                  console.log(`[VC Issuance] Public key mismatch in verificationMethod (multibase): ${vm.id}`);
                }
              } catch (e) {
                console.warn(`[VC Issuance] Failed to decode publicKeyMultibase for ${vm.id}:`, e);
              }
            }
          }
        }
      }
    } catch (decodeError) {
      console.warn(`[VC Issuance] Failed to decode JWT for logging:`, decodeError);
    }

    // Decode for envelope
    const decoded = this.decodeVc(vcJwt);

    return decoded;
  }

  /**
   * Issue a UNTP Digital Traceability Event (DTE) as VC-JWT using an explicit issuer identity.
   *
   * UNTP note: One DTE credential may contain multiple events (array in `credentialSubject`).
   *
   * @param events - Array of DTE event objects (e.g. TransformationEvent, ObjectEvent, etc.)
   * @param issuerIdentity - VC issuer identity (did:web recommended)
   * @param options - Optional issuance options
   * @returns VC envelope with JWT
   */
  async issueDteVcWithIdentity(
    events: unknown[],
    issuerIdentity: VcIssuerIdentity,
    options?: IssueOptions
  ): Promise<VcEnvelope> {
    if (issuerIdentity.signingKey.type !== 'ed25519') {
      throw new Error(
        `Invalid signing key type: ${issuerIdentity.signingKey.type}. ` +
          `Only 'ed25519' is supported for EdDSA algorithm.`
      );
    }

    if (issuerIdentity.signingKey.publicKey.length !== 32) {
      throw new Error(
        `Invalid ed25519 public key length: expected 32 bytes, got ${issuerIdentity.signingKey.publicKey.length}`
      );
    }

    if (!Array.isArray(events) || events.length === 0) {
      throw new Error('DTE events must be a non-empty array');
    }

    const credentialId = options?.credentialId || `urn:uuid:${this.generateUuid()}`;
    const dteContextUrl =
      process.env.UNTP_DTE_CONTEXT_URL || 'https://test.uncefact.org/vocabulary/untp/dte/0.6.0/';
    const issuerName =
      issuerIdentity.metadata?.organizationName ||
      issuerIdentity.metadata?.domain ||
      issuerIdentity.did;

    const vcPayload: any = {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        dteContextUrl,
        'https://www.w3.org/2018/credentials/v1',
        ...(options?.additionalContexts || []),
      ],
      type: ['VerifiableCredential', 'DigitalTraceabilityEvent'],
      id: credentialId,
      issuer: {
        type: ['CredentialIssuer'],
        id: issuerIdentity.did,
        name: issuerName,
      },
      validFrom: new Date().toISOString(),
      ...(options?.expirationDate && { validUntil: options.expirationDate.toISOString() }),
      credentialSubject: events,
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

    if (this.statusListManager) {
      try {
        const statusListEntry = await this.statusListManager.assignIndex(
          issuerIdentity.did,
          credentialId
        );

        if (!vcPayload['@context'].includes('https://w3id.org/vc/status-list/2021/v1')) {
          vcPayload['@context'].push('https://w3id.org/vc/status-list/2021/v1');
        }

        vcPayload.credentialStatus = statusListEntry;
      } catch (error: any) {
        console.warn('Failed to assign status list index:', error.message);
      }
    }

    let keyId: string | undefined;
    if (issuerIdentity.method === 'did:web') {
      try {
        const didResolution = await this.resolver.resolve(issuerIdentity.did);
        if (didResolution.didDocument) {
          const jwkVm = didResolution.didDocument.verificationMethod?.find(
            (vm: any) => vm.type === 'JsonWebKey2020' && vm.publicKeyJwk
          );
          if (jwkVm) {
            keyId = jwkVm.id;
          } else {
            const firstVm = didResolution.didDocument.verificationMethod?.[0];
            if (firstVm && didResolution.didDocument.assertionMethod?.includes(firstVm.id)) {
              keyId = firstVm.id;
            }
          }
        }
      } catch (e: any) {
        console.warn('[DTE VC Issuance] DID resolution failed (continuing without kid):', e?.message || String(e));
      }
    }

    // NOTE: did-jwt-vc currently rejects `credentialSubject` arrays (UNTP DTE uses an array).
    // For DTE we sign a minimal VC-JWT using jose to preserve UNTP schema compatibility.
    const publicKey = issuerIdentity.signingKey.publicKey;
    const privateKeySeed = issuerIdentity.signingKey.privateKey;
    if (!privateKeySeed) {
      throw new Error('Private key required for did:web signing');
    }

    const toBase64Url = (input: Uint8Array): string =>
      Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    const jwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: toBase64Url(publicKey),
      d: toBase64Url(privateKeySeed),
    } as const;

    const key = await importJWK(jwk as any, 'EdDSA');

    const iat = Math.floor(Date.now() / 1000);
    const exp = options?.expirationDate ? Math.floor(options.expirationDate.getTime() / 1000) : undefined;

    let builder = new SignJWT({ vc: vcPayload })
      .setProtectedHeader({
        alg: 'EdDSA',
        typ: 'JWT',
        ...(keyId ? { kid: keyId } : {}),
      })
      .setIssuer(issuerIdentity.did)
      .setJti(credentialId)
      .setIssuedAt(iat)
      .setNotBefore(iat);

    if (exp) {
      builder = builder.setExpirationTime(exp);
    }

    const jwt = await builder.sign(key);

    // Keep the same envelope shape used elsewhere in the app (`payload.vc`)
    return this.decodeVc(jwt);
  }

  async verifyDppVc(
    vcJwt: string,
    options?: VerifyOptions & { tokenId?: string }
  ): Promise<VerificationResult> {
    let issuer: string | undefined;
    
    try {
      // Decode JWT to extract issuer DID for debugging
      const parts = vcJwt.split('.');
      if (parts.length !== 3) {
        throw new Error(`Invalid JWT format: expected 3 parts, got ${parts.length}`);
      }
      
      let header: any;
      let payload: any;
      
      try {
        header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
        payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
        issuer = payload.iss || payload.issuer;
      } catch (decodeError: any) {
        throw new Error(`Invalid JWT format: ${decodeError.message}`);
      }
      
      if (!issuer) {
        throw new Error('JWT payload missing issuer (iss or issuer field)');
      }
      
      const resolution = await this.resolver.resolve(issuer);
      
      if (!resolution.didDocument) {
        const error = resolution.didResolutionMetadata?.error || 'unknown';
        const message = resolution.didResolutionMetadata?.message || 'Failed to resolve DID document';
        throw new Error(`Failed to resolve DID document for ${issuer}: ${message}`);
      }
      
      const vm = resolution.didDocument.verificationMethod?.[0];
      
      if (!vm) {
        throw new Error(`DID document has no verificationMethod`);
      }
      
      if (!vm.publicKeyMultibase && !vm.publicKeyJwk) {
        throw new Error(`VerificationMethod has neither publicKeyMultibase nor publicKeyJwk`);
      }
      
      if (this.debug) {
        console.log(`[VC] Verifying credential`);
      }

      let verifiedVC: any;
      try {
        verifiedVC = await verifyCredential(vcJwt, this.resolver, {
          audience: options?.audience,
        });
      } catch (e: any) {
        // Fallback for VC payload shapes not supported by did-jwt-vc (e.g., UNTP DTE credentialSubject arrays).
        const msg = String(e?.message || e || '');
        if (msg.toLowerCase().includes('credentialsubject') && msg.toLowerCase().includes('array')) {
          const fallback = await this.verifyJwtWithJose(vcJwt, { audience: options?.audience });
          return {
            verified: fallback.verified,
            issuer: fallback.issuer,
            issuanceDate: fallback.issuanceDate,
            expirationDate: fallback.expirationDate,
            errors: fallback.verified ? [] : fallback.errors,
            warnings: fallback.warnings,
            payload: fallback.payload,
          };
        }
        throw e;
      }

      if (this.debug) {
        console.log(`[VC] Verification ok`);
      }

      // Phase 2+: Check credentialStatus if present
      const warnings: string[] = [];

      const credentialId =
        (options as any)?.credentialId ||
        (verifiedVC as any)?.jwtPayload?.jti ||
        (verifiedVC as any)?.jti ||
        (verifiedVC as any)?.verifiableCredential?.id;

      if (this.statusListManager && credentialId) {
        try {
          const credentialStatus = verifiedVC.verifiableCredential?.credentialStatus;
          
          if (credentialStatus && credentialStatus.type === 'StatusList2021Entry') {
            // Check if credential is revoked
            const isRevoked = await this.statusListManager.checkStatus(String(credentialId));
            
            if (isRevoked) {
              return {
                verified: false,
                issuer: verifiedVC.issuer,
                issuanceDate: new Date((verifiedVC as any).issuanceDate),
                errors: ['Credential has been revoked (Status List check failed)'],
                warnings: [],
                payload: verifiedVC.verifiableCredential,
              };
            }
          } else if (!credentialStatus) {
            // No credentialStatus (legacy VC)
            warnings.push('VC does not include credentialStatus (legacy credential, pre-Phase 2)');
          }
        } catch (statusError: any) {
          console.warn('Status List check failed:', statusError.message);
          warnings.push(`Status List check failed: ${statusError.message}`);
          // Don't fail verification if status check fails (graceful degradation)
        }
      }

      return {
        verified: true,
        issuer: verifiedVC.issuer,
        issuanceDate: new Date((verifiedVC as any).issuanceDate),
        expirationDate: (verifiedVC as any).expirationDate 
          ? new Date((verifiedVC as any).expirationDate) 
          : undefined,
        errors: [],
        warnings,
        payload: verifiedVC.verifiableCredential,
      };
    } catch (error: any) {
      // Check if error is due to did:web not being hosted
      const errorMessage = error.message || '';
      const isDidWebNotFound = 
        errorMessage.includes('notFound') ||
        errorMessage.includes('Unable to resolve DID document for did:web') ||
        errorMessage.includes('fetch failed') ||
        (errorMessage.includes('did:web') && errorMessage.includes('notFound'));

      if (isDidWebNotFound) {
        // Extract DID from error message if possible
        const didMatch = errorMessage.match(/did:web:[^\s,]+/);
        const did = didMatch ? didMatch[0] : 'did:web:...';
        const domain = did.replace('did:web:', '');
        
        return {
          verified: false,
          issuer: did,
          issuanceDate: new Date(),
          errors: [
            `DID document not found: ${did}. ` +
            `The did:web issuer has not yet hosted the DID document at ` +
            `https://${domain}/.well-known/did.json. ` +
            `Please host the DID document and verify the issuer, or use did:key for immediate verification.`
          ],
          warnings: [
            'This VC was issued with did:web but the DID document is not yet publicly accessible. ' +
            'The VC signature cannot be verified until the DID document is hosted.'
          ],
          payload: null,
        };
      }

      // Check for signature-related errors
      const isSignatureError = 
        errorMessage.includes('invalid_signature') ||
        errorMessage.includes('no matching public key') ||
        errorMessage.includes('signature verification failed');
      
      if (isSignatureError) {
        // Keep error surface minimal by default; details can be enabled via DEBUG_VC.
        if (this.debug) {
          console.warn('[VC] Signature verification failed:', errorMessage);
        }
      }

      return {
        verified: false,
        issuer: issuer || (error.message?.match(/did:[^\s,]+/) ? error.message.match(/did:[^\s,]+/)![0] : ''),
        issuanceDate: new Date(),
        errors: [error.message || 'Verification failed'],
        warnings: [],
        payload: null,
      };
    }
  }

  private async verifyJwtWithJose(
    vcJwt: string,
    options?: { audience?: string }
  ): Promise<{
    verified: boolean;
    issuer: string;
    issuanceDate: Date;
    expirationDate?: Date;
    errors: string[];
    warnings: string[];
    payload: any;
  }> {
    const parts = vcJwt.split('.');
    if (parts.length !== 3) {
      return {
        verified: false,
        issuer: '',
        issuanceDate: new Date(),
        errors: ['Invalid JWT format'],
        warnings: [],
        payload: null,
      };
    }

    const header = JSON.parse(this.base64UrlDecode(parts[0]));
    const payload = JSON.parse(this.base64UrlDecode(parts[1]));
    const issuer = String(payload.iss || payload.issuer || '').trim();

    if (!issuer) {
      return {
        verified: false,
        issuer: '',
        issuanceDate: new Date(),
        errors: ['JWT payload missing issuer (iss)'],
        warnings: [],
        payload: null,
      };
    }

    const resolution = await this.resolver.resolve(issuer);
    const didDoc: any = resolution.didDocument;
    if (!didDoc) {
      return {
        verified: false,
        issuer,
        issuanceDate: new Date(),
        errors: [`Failed to resolve DID document for ${issuer}`],
        warnings: [],
        payload: null,
      };
    }

    const kid = header?.kid ? String(header.kid) : undefined;
    const vms = Array.isArray(didDoc.verificationMethod) ? didDoc.verificationMethod : [];
    const vm =
      (kid ? vms.find((m: any) => String(m.id) === kid) : undefined) ||
      vms[0];

    const jwkFromVm = vm?.publicKeyJwk;
    const multibase = vm?.publicKeyMultibase ? String(vm.publicKeyMultibase) : '';

    const jwk =
      jwkFromVm ||
      (multibase
        ? {
            kty: 'OKP',
            crv: 'Ed25519',
            x: Buffer.from(extractPublicKeyFromMultibase(multibase))
              .toString('base64')
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=+$/g, ''),
          }
        : null);

    if (!jwk) {
      return {
        verified: false,
        issuer,
        issuanceDate: new Date(),
        errors: ['DID verification method missing publicKeyJwk/publicKeyMultibase'],
        warnings: [],
        payload: null,
      };
    }

    try {
      const key = await importJWK(jwk as any, 'EdDSA');
      const verified = await jwtVerify(vcJwt, key, {
        issuer,
        audience: options?.audience,
        algorithms: ['EdDSA'],
      });

      const iat = typeof verified.payload.iat === 'number' ? verified.payload.iat : undefined;
      const exp = typeof verified.payload.exp === 'number' ? verified.payload.exp : undefined;

      return {
        verified: true,
        issuer,
        issuanceDate: iat ? new Date(iat * 1000) : new Date(),
        expirationDate: exp ? new Date(exp * 1000) : undefined,
        errors: [],
        warnings: [],
        payload: (verified.payload as any).vc || (verified.payload as any),
      };
    } catch (e: any) {
      return {
        verified: false,
        issuer,
        issuanceDate: new Date(),
        errors: [String(e?.message || e || 'Signature verification failed')],
        warnings: [],
        payload: null,
      };
    }
  }

  decodeVc(vcJwt: string): VcEnvelope {
    // JWT decode logic (without verification)
    const parts = vcJwt.split('.');
    
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const header = JSON.parse(this.base64UrlDecode(parts[0]));
    const payload = JSON.parse(this.base64UrlDecode(parts[1]));

    return {
      jwt: vcJwt,
      payload,
      header,
    };
  }

  extractDpp(vcEnvelope: VcEnvelope): DigitalProductPassport {
    return vcEnvelope.payload.vc.credentialSubject as DigitalProductPassport;
  }

  /**
   * Create a JWT signer from Polkadot account
   */
  private createSigner(account: PolkadotAccount) {
    return async (data: string | Uint8Array): Promise<string> => {
      const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const signature = await account.sign(dataBytes);
      return this.base64UrlEncode(signature);
    };
  }

  /**
   * Base64 URL decode
   */
  private base64UrlDecode(input: string): string {
    // Replace URL-safe characters
    let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    
    // Decode
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    return decoded;
  }

  /**
   * Base64 URL encode
   */
  private base64UrlEncode(buffer: Uint8Array): string {
    const base64 = Buffer.from(buffer).toString('base64');
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
