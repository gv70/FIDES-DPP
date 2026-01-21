/**
 * DID Web Manager
 * 
 * Manages organizational DID identities using the did:web method.
 * Stores and manages issuer keys for VC issuance.
 * 
 * Version B: Server-side Ed25519 signing with encrypted private key storage.
 * 
 * Storage: PostgreSQL for production, JSON file for development persistence.
 * 
 * @license Apache-2.0
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { VcIssuerIdentity, VcIssuerSigningKey } from './issuer-identity';
import type { Pool, PoolClient } from 'pg';
import { Pool as PgPool } from 'pg';

// Issuer verification status enum
export enum IssuerStatus {
  UNKNOWN = 'UNKNOWN',     // Not yet verified
  PENDING = 'PENDING',     // Registered, awaiting verification
  VERIFIED = 'VERIFIED',   // did.json hosted and verified
  FAILED = 'FAILED',       // Verification failed (did.json not accessible or key mismatch)
}

// Polkadot account authorization metadata
export interface PolkadotAccountAuthorization {
  address: string;              // Polkadot account address (SS58 format)
  network?: string;              // Network identifier (e.g., "asset-hub", "westend-asset-hub")
  addedAt?: Date;                // When this account was authorized
}

// Encrypted private key structure (AES-256-GCM)
export interface EncryptedPrivateKey {
  ivB64: string;                // Initialization vector (base64)
  ctB64: string;                // Ciphertext (base64)
  tagB64: string;               // Authentication tag (base64)
}

// Stored issuer identity with metadata
export interface StoredIssuerIdentity extends VcIssuerIdentity {
  status: IssuerStatus;         // Verification status
  lastError?: string;           // Last error message (if verification failed)
  lastAttemptAt?: Date;         // Last verification attempt timestamp
  authorizedPolkadotAccounts?: PolkadotAccountAuthorization[]; // Authorized Polkadot accounts for operational control
  encryptedPrivateKey?: EncryptedPrivateKey; // Encrypted Ed25519 seed (32 bytes)
}

/**
 * DID Web Manager
 * 
 * Provides centralized management of did:web issuer identities.
 * All VcIssuerIdentity instances for did:web are stored here.
 */
export class DidWebManager {
  private pool?: Pool;
  private devStorage: Map<string, StoredIssuerIdentity> = new Map();
  private jsonStoragePath: string;
  private jsonLastLoadedMtimeMs: number | null = null;
  private masterKey: Buffer | null = null;

  private isTestMode(): boolean {
    return process.env.FIDES_MODE === 'test' || process.env.TEST_MODE === '1';
  }

  private isSandboxLocalDid(did: string): boolean {
    if (!this.isTestMode()) return false;
    if (!did.startsWith('did:web:')) return false;

    const remainder = did.slice(8);
    const parts = remainder.split(':');
    const domainRaw = parts[0] || '';

    let domain: string;
    try {
      domain = decodeURIComponent(domainRaw);
    } catch {
      domain = domainRaw;
    }

    const host = domain.split(':')[0];
    return host === 'localhost' || host === '127.0.0.1';
  }

  constructor(pool?: Pool) {
    this.pool = pool;
    
    // Load master key for encryption (required for private key encryption)
    const masterKeyHex = process.env.DIDWEB_MASTER_KEY_HEX;
    if (masterKeyHex) {
      if (masterKeyHex.length !== 64) {
        throw new Error('DIDWEB_MASTER_KEY_HEX must be 64 hex characters (32 bytes)');
      }
      this.masterKey = Buffer.from(masterKeyHex, 'hex');
    } else {
      console.warn('[DidWebManager] DIDWEB_MASTER_KEY_HEX not set. Private keys will not be encrypted.');
    }
    
    // Use JSON file for persistence in development
    if (!pool) {
      const dataDirEnv =
        process.env.DIDWEB_DATA_PATH
          ? path.dirname(process.env.DIDWEB_DATA_PATH)
          : process.env.FIDES_DATA_DIR ||
            process.env.DATA_DIR ||
            (process.env.VERCEL ? '/tmp' : '');
      const projectRoot = process.cwd();
      const dataDir = dataDirEnv ? path.resolve(dataDirEnv) : path.join(projectRoot, 'data');
      const storageFile = this.isTestMode() ? 'issuers.test.json' : 'issuers.json';
      this.jsonStoragePath = process.env.DIDWEB_DATA_PATH || path.join(dataDir, storageFile);
      
      // Ensure data directory exists
      const jsonDir = path.dirname(this.jsonStoragePath);
      if (!fs.existsSync(jsonDir)) {
        fs.mkdirSync(jsonDir, { recursive: true });
      }
      
      // Load existing issuers from file (async, fire and forget for constructor compatibility)
      void this.loadFromJson().catch((error) => {
        console.error('[DidWebManager] Failed to load issuers from JSON file in constructor:', error.message);
      });
      console.warn('[DidWebManager] No PostgreSQL pool provided. Using JSON file storage:', this.jsonStoragePath);
    } else {
      this.jsonStoragePath = ''; // Not used when PostgreSQL is available
    }
  }

  /**
   * Encrypt Ed25519 seed (32 bytes) using AES-256-GCM
   * 
   * @param seed - Ed25519 seed (32 bytes)
   * @returns Encrypted private key structure
   */
  private encryptPrivateKey(seed: Uint8Array): EncryptedPrivateKey {
    if (!this.masterKey) {
      throw new Error('DIDWEB_MASTER_KEY_HEX not set. Cannot encrypt private key.');
    }
    if (seed.length !== 32) {
      throw new Error(`Invalid seed length: expected 32 bytes, got ${seed.length}`);
    }

    // Generate random IV (12 bytes for GCM)
    const iv = crypto.randomBytes(12);
    
    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    
    // Encrypt
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(seed)),
      cipher.final()
    ]);
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    return {
      ivB64: iv.toString('base64'),
      ctB64: encrypted.toString('base64'),
      tagB64: tag.toString('base64'),
    };
  }

  /**
   * Decrypt Ed25519 seed from encrypted structure
   * 
   * @param encrypted - Encrypted private key structure
   * @returns Ed25519 seed (32 bytes)
   */
  private decryptPrivateKey(encrypted: EncryptedPrivateKey): Uint8Array {
    if (!this.masterKey) {
      throw new Error('DIDWEB_MASTER_KEY_HEX not set. Cannot decrypt private key.');
    }

    const iv = Buffer.from(encrypted.ivB64, 'base64');
    const ciphertext = Buffer.from(encrypted.ctB64, 'base64');
    const tag = Buffer.from(encrypted.tagB64, 'base64');

    // Validate IV length (12 bytes for AES-GCM)
    if (iv.length !== 12) {
      throw new Error(`Invalid IV length: expected 12 bytes, got ${iv.length}`);
    }

    // Validate tag length (16 bytes for AES-GCM)
    if (tag.length !== 16) {
      throw new Error(`Invalid authentication tag length: expected 16 bytes, got ${tag.length}`);
    }

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    if (decrypted.length !== 32) {
      throw new Error(`Invalid decrypted seed length: expected 32 bytes, got ${decrypted.length}`);
    }

    return new Uint8Array(decrypted);
  }

  /**
   * Get decrypted private key seed for a DID
   * 
   * Decrypts the private key and returns the 32-byte Ed25519 seed.
   * 
   * @param did - DID identifier
   * @returns Ed25519 seed (32 bytes)
   */
  async getDecryptedPrivateKeySeed(did: string): Promise<Uint8Array> {
    const identity = await this.getIssuerIdentity(did);
    if (!identity) {
      throw new Error(`Issuer not found for DID: ${did}`);
    }

    if (!identity.encryptedPrivateKey) {
      throw new Error(`No encrypted private key found for DID: ${did}`);
    }

    // Decrypt the seed
    return this.decryptPrivateKey(identity.encryptedPrivateKey);
  }

  /**
   * Get signing key (KeyObject) for a DID
   * 
   * Decrypts the private key, reconstructs JWK, and creates a KeyObject
   * suitable for crypto.sign() operations.
   * 
   * @param did - DID identifier
   * @returns Node.js crypto KeyObject for signing
   */
  async getDidWebSigningKey(did: string): Promise<crypto.KeyObject> {
    const identity = await this.getIssuerIdentity(did);
    if (!identity) {
      throw new Error(`Issuer not found for DID: ${did}`);
    }

    if (!identity.encryptedPrivateKey) {
      throw new Error(`No encrypted private key found for DID: ${did}`);
    }

    // Decrypt the seed
    const seed = this.decryptPrivateKey(identity.encryptedPrivateKey);
    const publicKey = identity.signingKey.publicKey;

    // Reconstruct JWK format
    // Ed25519 JWK: { kty: "OKP", crv: "Ed25519", x: base64url(publicKey), d: base64url(seed) }
    const jwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: this.base64UrlEncode(Buffer.from(publicKey)),
      d: this.base64UrlEncode(Buffer.from(seed)),
    };

    // Create KeyObject from JWK
    const keyObject = crypto.createPrivateKey({
      format: 'jwk',
      key: jwk,
    });

    return keyObject;
  }

  /**
   * Convert did:web DID to HTTPS URL
   * 
   * Handles both simple domain and path-based DIDs:
   * - did:web:domain → https://domain/.well-known/did.json
   * - did:web:domain:path:to → https://domain/path/to/did.json
   * 
   * @param did - DID identifier (e.g., "did:web:example.com" or "did:web:example.com:path:to")
   * @returns HTTPS URL to DID document
   */
  didWebToUrl(did: string): string {
    if (!did.startsWith('did:web:')) {
      throw new Error(`Invalid did:web format: ${did}`);
    }

    // Remove "did:web:" prefix
    const remainder = did.slice(8); // "did:web:" is 8 characters
    
    // Split by colon to get domain and path parts
    const parts = remainder.split(':');
    const domainRaw = parts[0];
    const pathParts = parts.slice(1);
    const domain = decodeURIComponent(domainRaw);

    const protocol = this.isSandboxLocalDid(did) ? 'http' : 'https';

    if (pathParts.length === 0) {
      // Simple domain: https://domain/.well-known/did.json
      return `${protocol}://${domain}/.well-known/did.json`;
    } else {
      // Path-based: https://domain/path/to/did.json
      // Encode each path segment for URL safety
      const path = pathParts.map(encodeURIComponent).join('/');
      return `${protocol}://${domain}/${path}/did.json`;
    }
  }

  /**
   * Register a new did:web issuer identity
   * 
   * Generates a new Ed25519 key pair and stores it securely (encrypted).
   * Sets initial status to PENDING.
   * 
   * @param domain - Domain for did:web (e.g., "company.com")
   * @param organizationName - Name of organization
   * @returns Registered issuer identity (without private key in memory)
   */
  async registerIssuer(
    domain: string,
    organizationName: string
  ): Promise<StoredIssuerIdentity> {
    // Generate DID identifier
    const did = `did:web:${domain}`;

    // Check if already registered
    const existing = await this.getIssuerIdentity(did);
    if (existing) {
      throw new Error(`Issuer already registered for domain: ${domain}`);
    }

    // Generate Ed25519 key pair for signing
    const keyPair = this.generateEd25519KeyPair();

    // Encrypt private key before storage
    const encryptedPrivateKey = this.encryptPrivateKey(keyPair.privateKey);

    const identity: StoredIssuerIdentity = {
      did,
      method: 'did:web',
      signingKey: {
        type: 'ed25519',
        publicKey: keyPair.publicKey,
        // DO NOT store privateKey in memory - only encrypted version
      },
      metadata: {
        domain,
        organizationName,
        registeredAt: new Date(),
      },
      status: IssuerStatus.PENDING, // Initial status
      encryptedPrivateKey,
    };

    // Store in database or dev storage
    if (this.pool) {
      await this.storeInPostgres(identity);
    } else {
      this.devStorage.set(did, identity);
      await this.saveToJson();
    }

    return identity;
  }

  /**
   * Register a new did:web issuer identity for an explicit DID (supports path-based DIDs).
   *
   * Examples:
   * - did:web:example.com
   * - did:web:example.com:pilots:abc123
   *
   * This is useful when you want multiple isolated issuer identities under a single domain,
   * e.g. pilot/test identities served from path-based did.json endpoints.
   */
  async registerIssuerDid(
    did: string,
    organizationName: string,
    options?: {
      /** Override initial status (default: PENDING) */
      status?: IssuerStatus;
      /** Extra metadata fields to persist */
      metadata?: Record<string, unknown>;
    }
  ): Promise<StoredIssuerIdentity> {
    if (!did || typeof did !== 'string' || !did.startsWith('did:web:')) {
      throw new Error(`Invalid did:web DID: ${did}`);
    }

    const existing = await this.getIssuerIdentity(did);
    if (existing) {
      throw new Error(`Issuer already registered for DID: ${did}`);
    }

    const remainder = did.slice(8);
    const parts = remainder.split(':');
    const domainRaw = parts[0];
    const pathParts = parts.slice(1);
    const domain = decodeURIComponent(domainRaw);

    const keyPair = this.generateEd25519KeyPair();
    const encryptedPrivateKey = this.encryptPrivateKey(keyPair.privateKey);

    const identity: StoredIssuerIdentity = {
      did,
      method: 'did:web',
      signingKey: {
        type: 'ed25519',
        publicKey: keyPair.publicKey,
      },
      metadata: {
        domain,
        organizationName,
        registeredAt: new Date(),
        ...(pathParts.length ? { path: pathParts } : {}),
        ...(options?.metadata || {}),
      },
      status: options?.status ?? IssuerStatus.PENDING,
      encryptedPrivateKey,
    };

    if (this.pool) {
      await this.storeInPostgres(identity);
    } else {
      this.devStorage.set(did, identity);
      await this.saveToJson();
    }

    return identity;
  }

  /**
   * Get issuer identity by DID
   * 
   * @param did - DID identifier (e.g., "did:web:company.com")
   * @returns Issuer identity or null if not found
   */
  /**
   * Reload issuers from storage (useful after external updates)
   * 
   * This is particularly useful for JSON storage when the file is modified
   * outside of this manager instance (e.g., by another process or script).
   */
  async reload(): Promise<void> {
    if (this.pool) {
      // PostgreSQL: no need to reload, queries are always fresh
      return;
    } else {
      // JSON storage: reload from file
      await this.loadFromJson();
    }
  }

  async getIssuerIdentity(did: string): Promise<StoredIssuerIdentity | null> {
    if (this.pool) {
      return this.getFromPostgres(did);
    } else {
      await this.loadFromJson({ clear: true, quiet: true, ifChanged: true });
      return this.devStorage.get(did) || null;
    }
  }

  /**
   * Update persisted metadata for an existing issuer identity.
   *
   * This is used to store issuer-specific configuration such as trusted supplier allowlists.
   *
   * @param did - did:web DID
   * @param patch - Partial metadata to merge (shallow)
   * @returns Updated issuer identity
   */
  async updateIssuerMetadata(did: string, patch: Record<string, unknown>): Promise<StoredIssuerIdentity> {
    const existing = await this.getIssuerIdentity(did);
    if (!existing) {
      throw new Error(`Issuer not found: ${did}`);
    }

    const updated: StoredIssuerIdentity = {
      ...existing,
      metadata: {
        ...(existing.metadata || {}),
        ...(patch || {}),
      },
    };

    if (this.pool) {
      const query = `UPDATE issuer_identities SET metadata = $2 WHERE did = $1`;
      await this.pool.query(query, [did, JSON.stringify(updated.metadata || {})]);
    } else {
      this.devStorage.set(did, updated);
      await this.saveToJson();
    }

    return updated;
  }

  /**
   * List all registered issuer identities
   * 
   * @returns Array of issuer identities
   */
  async listIssuers(): Promise<StoredIssuerIdentity[]> {
    if (this.pool) {
      return this.listFromPostgres();
    } else {
      await this.loadFromJson({ clear: true, quiet: true, ifChanged: true });
      return Array.from(this.devStorage.values());
    }
  }

  /**
   * Verify a did:web issuer by fetching and validating the hosted did.json
   * 
   * This method:
   * 1. Converts DID to URL using didWebToUrl()
   * 2. Fetches the did.json document
   * 3. Verifies that the public key in the did.json matches the stored public key
   * 4. Updates the issuer status to VERIFIED or FAILED
   * 
   * @param did - DID identifier (e.g., "did:web:company.com")
   * @returns Verification result { success: boolean, status: IssuerStatus, error?: string }
   */
  async verifyDidWeb(did: string): Promise<{ success: boolean; status: IssuerStatus; error?: string }> {
    // Get stored issuer identity
    const identity = await this.getIssuerIdentity(did);
    if (!identity) {
      return {
        success: false,
        status: IssuerStatus.UNKNOWN,
        error: `Issuer not found for DID: ${did}`,
      };
    }

    try {
      // Convert DID to URL using proper parser
      const didDocUrl = this.didWebToUrl(did);
      console.log(`[DidWebManager] Fetching DID document from: ${didDocUrl}`);
      
      const response = await fetch(didDocUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const didDocument = await response.json();

      // Validate DID document structure
      if (didDocument.id !== did) {
        throw new Error(`DID mismatch: expected ${did}, got ${didDocument.id}`);
      }

      if (!didDocument.verificationMethod || didDocument.verificationMethod.length === 0) {
        throw new Error('DID document has no verificationMethod');
      }

      // Extract public key from verificationMethod
      const vm = didDocument.verificationMethod[0];
      if (!vm.publicKeyMultibase) {
        throw new Error('VerificationMethod missing publicKeyMultibase');
      }

      // Decode public key from multibase and compare with stored key
      const storedPublicKeyHex = Buffer.from(identity.signingKey.publicKey).toString('hex');
      
      // Extract public key from multibase (z-prefixed base58btc)
      const hostedPublicKey = this.extractPublicKeyFromMultibase(vm.publicKeyMultibase);
      const hostedPublicKeyHex = Buffer.from(hostedPublicKey).toString('hex');

      if (storedPublicKeyHex !== hostedPublicKeyHex) {
        throw new Error(
          `Public key mismatch: stored key (${storedPublicKeyHex.substring(0, 16)}...) ` +
          `does not match hosted key (${hostedPublicKeyHex.substring(0, 16)}...)`
        );
      }

      // Verification successful
      console.log(`[DidWebManager] DID verification successful for ${did}`);
      
      // Update status
      identity.status = IssuerStatus.VERIFIED;
      identity.lastAttemptAt = new Date();
      identity.lastError = undefined;
      
      if (this.pool) {
        await this.updateStatusInPostgres(did, IssuerStatus.VERIFIED, undefined);
      } else {
        this.devStorage.set(did, identity);
        await this.saveToJson();
      }

      return {
        success: true,
        status: IssuerStatus.VERIFIED,
      };

    } catch (error: any) {
      console.error(`[DidWebManager] DID verification failed for ${did}:`, error.message);
      
      // Update status
      identity.status = IssuerStatus.FAILED;
      identity.lastError = error.message;
      identity.lastAttemptAt = new Date();
      
      if (this.pool) {
        await this.updateStatusInPostgres(did, IssuerStatus.FAILED, error.message);
      } else {
        this.devStorage.set(did, identity);
        await this.saveToJson();
      }

      return {
        success: false,
        status: IssuerStatus.FAILED,
        error: error.message,
      };
    }
  }

  /**
   * Generate Ed25519 key pair
   * 
   * Uses Node.js crypto to generate a keypair and exports as JWK to get raw 32-byte keys.
   * 
   * @returns Ed25519 key pair (public key 32 bytes, privateKey/seed 32 bytes)
   */
  private generateEd25519KeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
    // Generate Ed25519 key pair using Node.js crypto
    const { publicKey: publicKeyObj, privateKey: privateKeyObj } = crypto.generateKeyPairSync('ed25519');

    // Export as JWK to get raw bytes
    const publicKeyJwk = publicKeyObj.export({ format: 'jwk' });
    const privateKeyJwk = privateKeyObj.export({ format: 'jwk' });

    if (!publicKeyJwk.x || !privateKeyJwk.d) {
      throw new Error('Failed to export Ed25519 keys in JWK format');
    }

    // Decode base64url to get raw 32-byte keys
    const publicKeyBytes = this.base64UrlDecode(publicKeyJwk.x);
    const privateKeyBytes = this.base64UrlDecode(privateKeyJwk.d);

    // Validate key lengths (Ed25519: 32 bytes each)
    if (publicKeyBytes.length !== 32) {
      throw new Error(`Invalid Ed25519 public key length: ${publicKeyBytes.length} (expected 32)`);
    }
    if (privateKeyBytes.length !== 32) {
      throw new Error(`Invalid Ed25519 private key length: ${privateKeyBytes.length} (expected 32)`);
    }

    // Log only public key (NEVER log private key)
    console.log('[DidWebManager] Generated Ed25519 keypair:');
    console.log(`  Public key: ${Buffer.from(publicKeyBytes).toString('hex').substring(0, 40)}... (${publicKeyBytes.length} bytes)`);

    return {
      publicKey: publicKeyBytes,      // 32 bytes
      privateKey: privateKeyBytes,     // 32 bytes (seed, JWK 'd' parameter)
    };
  }

  /**
   * Extract public key from multibase-encoded string (z-prefixed base58btc)
   * 
   * @param multibase - Multibase-encoded public key (e.g., "z6Mkh...")
   * @returns Public key bytes (32 bytes for Ed25519)
   */
  private extractPublicKeyFromMultibase(multibase: string): Uint8Array {
    if (!multibase.startsWith('z')) {
      throw new Error(`Invalid multibase format: expected 'z' prefix, got '${multibase[0]}'`);
    }

    // Base58 decode (simple implementation for Ed25519 keys)
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const encoded = multibase.slice(1); // Remove 'z' prefix

    // Decode base58
    let num = BigInt(0);
    for (const char of encoded) {
      const index = ALPHABET.indexOf(char);
      if (index === -1) {
        throw new Error(`Invalid base58 character: ${char}`);
      }
      num = num * BigInt(58) + BigInt(index);
    }

    // Convert BigInt to byte array
    const bytes: number[] = [];
    while (num > 0) {
      bytes.unshift(Number(num % BigInt(256)));
      num = num / BigInt(256);
    }

    // Handle leading zeros
    for (let i = 0; i < encoded.length && encoded[i] === ALPHABET[0]; i++) {
      bytes.unshift(0);
    }

    const decoded = new Uint8Array(bytes);

    // Check multicodec prefix (0xed01 for Ed25519)
    if (decoded.length < 2 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
      throw new Error(
        `Invalid multicodec prefix: expected 0xed01 (Ed25519), ` +
        `got 0x${decoded[0].toString(16)}${decoded[1].toString(16)}`
      );
    }

    // Extract public key (skip 2-byte prefix)
    const publicKey = decoded.slice(2);

    // Validate length (32 bytes for Ed25519)
    if (publicKey.length !== 32) {
      throw new Error(`Invalid public key length: expected 32 bytes, got ${publicKey.length}`);
    }

    return publicKey;
  }

  /**
   * Get Polkadot accounts service endpoint URL for a DID
   * 
   * Constructs the URL for the dynamic Polkadot accounts endpoint based on the DID structure:
   * - did:web:example.com → https://example.com/.well-known/polkadot-accounts.json
   * - did:web:example.com:issuers:review-1 → https://example.com/issuers/review-1/polkadot-accounts.json
   * 
   * @param did - DID identifier
   * @returns HTTPS URL to Polkadot accounts endpoint
   */
  getPolkadotAccountsServiceEndpoint(did: string): string {
    if (!did.startsWith('did:web:')) {
      throw new Error(`Invalid did:web format: ${did}`);
    }

    // Remove "did:web:" prefix
    const remainder = did.slice(8); // "did:web:" is 8 characters
    
    // Split by colon to get domain and path parts
    const parts = remainder.split(':');
    const domainRaw = parts[0];
    const pathParts = parts.slice(1);
    const domain = decodeURIComponent(domainRaw);

    const protocol = this.isSandboxLocalDid(did) ? 'http' : 'https';

    if (pathParts.length === 0) {
      // Simple domain: https://domain/.well-known/polkadot-accounts.json
      return `${protocol}://${domain}/.well-known/polkadot-accounts.json`;
    } else {
      // Path-based: https://domain/path/to/polkadot-accounts.json
      // Encode each path segment for URL safety
      const path = pathParts.map(encodeURIComponent).join('/');
      return `${protocol}://${domain}/${path}/polkadot-accounts.json`;
    }
  }

  /**
   * Generate Polkadot accounts document for dynamic endpoint
   * 
   * Reads authorizedPolkadotAccounts from storage and groups by network.
   * This document is served at the endpoint returned by getPolkadotAccountsServiceEndpoint().
   * 
   * @param did - DID identifier
   * @returns Polkadot accounts document
   */
  async generatePolkadotAccountsDocument(did: string): Promise<any> {
    const identity = await this.getIssuerIdentity(did);
    if (!identity) {
      throw new Error(`Issuer not found for DID: ${did}`);
    }

    // Group accounts by network (default to "asset-hub" if not specified)
    const accountsByNetwork = new Map<string, string[]>();
    
    if (identity.authorizedPolkadotAccounts && identity.authorizedPolkadotAccounts.length > 0) {
      for (const account of identity.authorizedPolkadotAccounts) {
        const network = account.network || 'asset-hub';
        if (!accountsByNetwork.has(network)) {
          accountsByNetwork.set(network, []);
        }
        accountsByNetwork.get(network)!.push(account.address);
      }
    }

    // Build accounts array grouped by network
    const accounts = Array.from(accountsByNetwork.entries()).map(([network, addresses]) => ({
      network: `polkadot:${network}`,
      addresses,
    }));

    return {
      did,
      updatedAt: new Date().toISOString(),
      accounts,
      policy: 'canIssueDpp',
    };
  }

  /**
   * Generate DID document for publishing to /.well-known/did.json
   * 
   * Includes Ed25519 verification key (required for UNTP) and optional
   * Polkadot account authorization service pointing to dynamic endpoint.
   * 
   * The DID document does NOT contain the list of accounts directly.
   * Instead, it references a dynamic endpoint via serviceEndpoint.
   * 
   * @param did - DID identifier
   * @param includePolkadotAccounts - Whether to include Polkadot accounts service (default: true)
   * @returns DID document object
   */
  async generateDidDocument(did: string, includePolkadotAccounts: boolean = true): Promise<any> {
    const identity = await this.getIssuerIdentity(did);
    if (!identity) {
      throw new Error(`Issuer not found for DID: ${did}`);
    }

    // Encode public key as multibase (z-prefixed base58btc with Ed25519 multicodec prefix)
    const publicKeyMultibase = this.publicKeyToMultibase(identity.signingKey.publicKey);

    const didDocument: any = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: did,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase,
        },
      ],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
    };

    // Add Polkadot account authorization service pointing to dynamic endpoint
    if (includePolkadotAccounts) {
      // Always include service (even if no accounts yet) for consistency
      // The endpoint will return empty accounts array if none are configured
      const serviceEndpoint = this.getPolkadotAccountsServiceEndpoint(did);
      
      didDocument.service = [
        {
          id: `${did}#polkadot-accounts`,
          type: 'PolkadotAccounts',
          serviceEndpoint,
        },
      ];
    }

    return didDocument;
  }

  /**
   * Encode public key as multibase (z-prefixed base58btc with Ed25519 multicodec prefix)
   * 
   * @param publicKey - Public key bytes (32 bytes for Ed25519)
   * @returns Multibase-encoded public key (e.g., "z6Mkh...")
   */
  private publicKeyToMultibase(publicKey: Uint8Array): string {
    // Ed25519 multicodec prefix: 0xed01
    const prefix = new Uint8Array([0xed, 0x01]);
    const combined = new Uint8Array(prefix.length + publicKey.length);
    combined.set(prefix);
    combined.set(publicKey, prefix.length);

    // Base58 encode (simple implementation)
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    
    let num = BigInt(0);
    for (const byte of combined) {
      num = num * BigInt(256) + BigInt(byte);
    }

    const encoded: string[] = [];
    while (num > 0) {
      encoded.unshift(ALPHABET[Number(num % BigInt(58))]);
      num = num / BigInt(58);
    }

    // Handle leading zeros
    for (const byte of combined) {
      if (byte !== 0) break;
      encoded.unshift(ALPHABET[0]);
    }

    // Add multibase prefix 'z' (indicates base58btc encoding)
    return 'z' + encoded.join('');
  }

  /**
   * Base64URL encode
   * 
   * @param input - Bytes to encode
   * @returns Base64URL-encoded string
   */
  private base64UrlEncode(input: Buffer): string {
    return input.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Base64URL decode
   * 
   * @param input - Base64URL-encoded string
   * @returns Decoded bytes
   */
  private base64UrlDecode(input: string): Uint8Array {
    // Convert base64url to base64
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    // Decode
    return Buffer.from(padded, 'base64');
  }

  // JSON file storage methods (for development)

  /**
   * Load issuers from JSON file
   * 
   * Migrates old format (privateKey in plaintext) to new format (encrypted) on first load.
   */
  private async loadFromJson(options?: { clear?: boolean; quiet?: boolean; ifChanged?: boolean }): Promise<void> {
    if (!this.jsonStoragePath || !fs.existsSync(this.jsonStoragePath)) {
      return; // File doesn't exist yet, start with empty storage
    }

    try {
      if (options?.ifChanged) {
        try {
          const stat = fs.statSync(this.jsonStoragePath);
          const mtimeMs = typeof stat.mtimeMs === 'number' ? stat.mtimeMs : new Date(stat.mtime).getTime();
          if (this.jsonLastLoadedMtimeMs != null && mtimeMs === this.jsonLastLoadedMtimeMs) {
            return;
          }
        } catch {
          // fall through and attempt load
        }
      }

      if (options?.clear) {
        this.devStorage.clear();
      }

      const data = fs.readFileSync(this.jsonStoragePath, 'utf-8');
      const issuers: any[] = JSON.parse(data);
      let needsMigration = false;

      for (const issuer of issuers) {
        // Parse authorized Polkadot accounts if present
        let authorizedPolkadotAccounts: PolkadotAccountAuthorization[] | undefined;
        if (issuer.authorizedPolkadotAccounts) {
          authorizedPolkadotAccounts = issuer.authorizedPolkadotAccounts.map((acc: any) => ({
            address: acc.address,
            network: acc.network,
            addedAt: acc.addedAt ? new Date(acc.addedAt) : undefined,
          }));
        }

        // Handle private key: migrate from plaintext to encrypted if needed
        let encryptedPrivateKey: EncryptedPrivateKey | undefined;
        
        if (issuer.encryptedPrivateKey) {
          // Already encrypted (new format)
          encryptedPrivateKey = issuer.encryptedPrivateKey;
        } else if (issuer.signingKey?.privateKey) {
          // Old format: plaintext private key - migrate to encrypted
          if (this.masterKey) {
            const privateKeyBytes = new Uint8Array(Buffer.from(issuer.signingKey.privateKey, 'base64'));
            encryptedPrivateKey = this.encryptPrivateKey(privateKeyBytes);
            needsMigration = true;
            console.log(`[DidWebManager] Migrating private key for ${issuer.did} to encrypted format`);
          } else {
            throw new Error(
              `Private key found in plaintext for ${issuer.did} but DIDWEB_MASTER_KEY_HEX not set. ` +
              `Cannot migrate. Please set DIDWEB_MASTER_KEY_HEX environment variable.`
            );
          }
        }

        const identity: StoredIssuerIdentity = {
          did: issuer.did,
          method: issuer.method,
          signingKey: {
            type: issuer.signingKey.type,
            publicKey: new Uint8Array(Buffer.from(issuer.signingKey.publicKey, 'base64')),
            // DO NOT include privateKey in memory
          },
          metadata: issuer.metadata,
          status: issuer.status,
          lastError: issuer.lastError,
          lastAttemptAt: issuer.lastAttemptAt ? new Date(issuer.lastAttemptAt) : undefined,
          authorizedPolkadotAccounts,
          encryptedPrivateKey,
        };

        this.devStorage.set(issuer.did, identity);
      }

      // Save migrated data if needed (await to ensure it completes)
      if (needsMigration) {
        console.log('[DidWebManager] Migrated issuers to encrypted format. Saving...');
        try {
          await this.saveToJson();
          console.log('[DidWebManager] Successfully saved migrated issuers to encrypted format');
        } catch (saveError: any) {
          console.error('[DidWebManager] Failed to save migrated issuers:', saveError.message);
          throw saveError; // Re-throw to ensure migration failure is visible
        }
      }

      try {
        const stat = fs.statSync(this.jsonStoragePath);
        this.jsonLastLoadedMtimeMs =
          typeof stat.mtimeMs === 'number' ? stat.mtimeMs : new Date(stat.mtime).getTime();
      } catch {
        // ignore
      }

      if (!options?.quiet) {
        console.log(`[DidWebManager] Loaded ${issuers.length} issuer(s) from JSON file`);
      }
    } catch (error: any) {
      console.error('[DidWebManager] Failed to load issuers from JSON file:', error.message);
      // Continue with empty storage on error
    }
  }

  /**
   * Save issuers to JSON file
   * 
   * Only saves encrypted private keys, never plaintext.
   */
  private async saveToJson(): Promise<void> {
    if (!this.jsonStoragePath) {
      return; // Not using JSON storage
    }

    try {
      const issuers = Array.from(this.devStorage.values()).map((identity) => ({
        did: identity.did,
        method: identity.method,
        signingKey: {
          type: identity.signingKey.type,
          // Only save public key (base64)
          publicKey: Buffer.from(identity.signingKey.publicKey).toString('base64'),
          // DO NOT save privateKey in plaintext
        },
        metadata: identity.metadata,
        status: identity.status,
        lastError: identity.lastError,
        lastAttemptAt: identity.lastAttemptAt?.toISOString(),
        authorizedPolkadotAccounts: identity.authorizedPolkadotAccounts?.map(acc => ({
          address: acc.address,
          network: acc.network,
          addedAt: acc.addedAt?.toISOString(),
        })),
        // Save encrypted private key structure
        encryptedPrivateKey: identity.encryptedPrivateKey,
      }));

      // Write atomically (write to temp file, then rename)
      const tempPath = this.jsonStoragePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(issuers, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.jsonStoragePath);
    } catch (error: any) {
      console.error('[DidWebManager] Failed to save issuers to JSON file:', error.message);
      // Don't throw - allow operation to continue even if save fails
    }
  }

  // PostgreSQL storage methods

  private async storeInPostgres(identity: StoredIssuerIdentity): Promise<void> {
    if (!this.pool) throw new Error('PostgreSQL pool not initialized');

    const query = `
      INSERT INTO issuer_identities (
        did, method, public_key, encrypted_private_key, metadata, status, last_attempt_at, last_error, authorized_polkadot_accounts
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    await this.pool.query(query, [
      identity.did,
      identity.method,
      Buffer.from(identity.signingKey.publicKey),
      identity.encryptedPrivateKey ? JSON.stringify(identity.encryptedPrivateKey) : null,
      JSON.stringify(identity.metadata),
      identity.status,
      identity.lastAttemptAt || null,
      identity.lastError || null,
      identity.authorizedPolkadotAccounts ? JSON.stringify(identity.authorizedPolkadotAccounts) : null,
    ]);
  }

  private async getFromPostgres(did: string): Promise<StoredIssuerIdentity | null> {
    if (!this.pool) throw new Error('PostgreSQL pool not initialized');

    const query = `
      SELECT * FROM issuer_identities WHERE did = $1
    `;

    const result = await this.pool.query(query, [did]);
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    
    // Parse authorized Polkadot accounts if present
    let authorizedPolkadotAccounts: PolkadotAccountAuthorization[] | undefined;
    if (row.authorized_polkadot_accounts) {
      try {
        const parsed = typeof row.authorized_polkadot_accounts === 'string'
          ? JSON.parse(row.authorized_polkadot_accounts)
          : row.authorized_polkadot_accounts;
        authorizedPolkadotAccounts = parsed.map((acc: any) => ({
          address: acc.address,
          network: acc.network,
          addedAt: acc.addedAt ? new Date(acc.addedAt) : undefined,
        }));
      } catch (error) {
        console.warn(`[DidWebManager] Failed to parse authorized_polkadot_accounts for ${did}:`, error);
      }
    }

    // Parse encrypted private key
    let encryptedPrivateKey: EncryptedPrivateKey | undefined;
    if (row.encrypted_private_key) {
      try {
        const parsed = typeof row.encrypted_private_key === 'string'
          ? JSON.parse(row.encrypted_private_key)
          : row.encrypted_private_key;
        encryptedPrivateKey = parsed;
      } catch (error) {
        console.warn(`[DidWebManager] Failed to parse encrypted_private_key for ${did}:`, error);
      }
    } else if (row.private_key) {
      // Migration: old format with plaintext private_key
      if (this.masterKey) {
        try {
          const privateKeyBytes = new Uint8Array(row.private_key);
          encryptedPrivateKey = this.encryptPrivateKey(privateKeyBytes);
          // Update database with encrypted version and clear plaintext
          await this.migratePrivateKeyInPostgres(did, encryptedPrivateKey);
          console.log(`[DidWebManager] Migrated private key for ${did} to encrypted format in database`);
        } catch (error) {
          console.error(`[DidWebManager] Failed to migrate private key for ${did}:`, error);
        }
      } else {
        console.warn(
          `[DidWebManager] Plaintext private_key found for ${did} but DIDWEB_MASTER_KEY_HEX not set. ` +
          `Cannot migrate. Please set DIDWEB_MASTER_KEY_HEX environment variable.`
        );
      }
    }

    return {
      did: row.did,
      method: row.method,
      signingKey: {
        type: 'ed25519',
        publicKey: new Uint8Array(row.public_key),
        // DO NOT include privateKey in memory
      },
      metadata: row.metadata,
      status: row.status,
      lastAttemptAt: row.last_attempt_at,
      lastError: row.last_error,
      authorizedPolkadotAccounts,
      encryptedPrivateKey,
    };
  }

  private async listFromPostgres(): Promise<StoredIssuerIdentity[]> {
    if (!this.pool) throw new Error('PostgreSQL pool not initialized');

    const query = `
      SELECT * FROM issuer_identities ORDER BY did
    `;

    const result = await this.pool.query(query);
    return result.rows.map((row) => {
      // Parse authorized Polkadot accounts if present
      let authorizedPolkadotAccounts: PolkadotAccountAuthorization[] | undefined;
      if (row.authorized_polkadot_accounts) {
        try {
          const parsed = typeof row.authorized_polkadot_accounts === 'string'
            ? JSON.parse(row.authorized_polkadot_accounts)
            : row.authorized_polkadot_accounts;
          authorizedPolkadotAccounts = parsed.map((acc: any) => ({
            address: acc.address,
            network: acc.network,
            addedAt: acc.addedAt ? new Date(acc.addedAt) : undefined,
          }));
        } catch (error) {
          console.warn(`[DidWebManager] Failed to parse authorized_polkadot_accounts for ${row.did}:`, error);
        }
      }

      // Parse encrypted private key
      let encryptedPrivateKey: EncryptedPrivateKey | undefined;
      if (row.encrypted_private_key) {
        try {
          const parsed = typeof row.encrypted_private_key === 'string'
            ? JSON.parse(row.encrypted_private_key)
            : row.encrypted_private_key;
          encryptedPrivateKey = parsed;
        } catch (error) {
          console.warn(`[DidWebManager] Failed to parse encrypted_private_key for ${row.did}:`, error);
        }
      }

      return {
        did: row.did,
        method: row.method,
        signingKey: {
          type: 'ed25519',
          publicKey: new Uint8Array(row.public_key),
          // DO NOT include privateKey in memory
        },
        metadata: row.metadata,
        status: row.status,
        lastAttemptAt: row.last_attempt_at,
        lastError: row.last_error,
        authorizedPolkadotAccounts,
        encryptedPrivateKey,
      };
    });
  }

  private async updateStatusInPostgres(did: string, status: IssuerStatus, lastError?: string): Promise<void> {
    if (!this.pool) throw new Error('PostgreSQL pool not initialized');

    const query = `
      UPDATE issuer_identities 
      SET status = $2, last_attempt_at = $3, last_error = $4
      WHERE did = $1
    `;

    await this.pool.query(query, [did, status, new Date(), lastError || null]);
  }

  /**
   * Migrate plaintext private_key to encrypted_private_key in PostgreSQL
   * 
   * Sets encrypted_private_key and clears private_key (sets to NULL) to remove plaintext.
   */
  private async migratePrivateKeyInPostgres(did: string, encryptedPrivateKey: EncryptedPrivateKey): Promise<void> {
    if (!this.pool) throw new Error('PostgreSQL pool not initialized');

    const query = `
      UPDATE issuer_identities 
      SET encrypted_private_key = $2, private_key = NULL
      WHERE did = $1
    `;

    await this.pool.query(query, [did, JSON.stringify(encryptedPrivateKey)]);
  }

  /**
   * Add authorized Polkadot account to issuer identity
   * 
   * @param did - DID identifier
   * @param address - Polkadot account address (SS58 format)
   * @param network - Network identifier (optional, defaults to "asset-hub")
   * @returns Updated issuer identity
   */
  async addAuthorizedPolkadotAccount(
    did: string,
    address: string,
    network?: string
  ): Promise<StoredIssuerIdentity> {
    const identity = await this.getIssuerIdentity(did);
    if (!identity) {
      throw new Error(`Issuer not found for DID: ${did}`);
    }

    // Initialize array if not present
    if (!identity.authorizedPolkadotAccounts) {
      identity.authorizedPolkadotAccounts = [];
    }

    // Check if already exists
    const existing = identity.authorizedPolkadotAccounts.find(
      acc => acc.address === address && acc.network === (network || 'asset-hub')
    );
    if (existing) {
      return identity; // Already authorized
    }

    // Add new account
    identity.authorizedPolkadotAccounts.push({
      address,
      network: network || 'asset-hub',
      addedAt: new Date(),
    });

    // Persist changes
    if (this.pool) {
      await this.updatePolkadotAccountsInPostgres(did, identity.authorizedPolkadotAccounts);
    } else {
      this.devStorage.set(did, identity);
      await this.saveToJson();
    }

    return identity;
  }

  /**
   * Remove authorized Polkadot account from issuer identity
   * 
   * @param did - DID identifier
   * @param address - Polkadot account address to remove
   * @param network - Network identifier (optional, removes from all networks if not specified)
   * @returns Updated issuer identity
   */
  async removeAuthorizedPolkadotAccount(
    did: string,
    address: string,
    network?: string
  ): Promise<StoredIssuerIdentity> {
    const identity = await this.getIssuerIdentity(did);
    if (!identity) {
      throw new Error(`Issuer not found for DID: ${did}`);
    }

    if (!identity.authorizedPolkadotAccounts || identity.authorizedPolkadotAccounts.length === 0) {
      return identity; // No accounts to remove
    }

    // Filter out the account
    identity.authorizedPolkadotAccounts = identity.authorizedPolkadotAccounts.filter(
      acc => !(acc.address === address && (!network || acc.network === network))
    );

    // Persist changes
    if (this.pool) {
      await this.updatePolkadotAccountsInPostgres(did, identity.authorizedPolkadotAccounts);
    } else {
      this.devStorage.set(did, identity);
      await this.saveToJson();
    }

    return identity;
  }

  /**
   * Check if a Polkadot account is authorized for a DID (local storage check)
   * 
   * This method checks the local storage (database/JSON) for authorized accounts.
   * Use this on the issuer server side.
   * 
   * @param did - DID identifier
   * @param address - Polkadot account address to check
   * @param network - Network identifier (optional, defaults to "asset-hub")
   * @returns true if authorized, false otherwise
   */
  async isPolkadotAccountAuthorizedLocal(
    did: string,
    address: string,
    network?: string
  ): Promise<boolean> {
    const identity = await this.getIssuerIdentity(did);
    if (!identity) {
      return false;
    }

    if (!identity.authorizedPolkadotAccounts || identity.authorizedPolkadotAccounts.length === 0) {
      return false;
    }

    // Check if address is in authorized list
    const targetNetwork = network || 'asset-hub';
    return identity.authorizedPolkadotAccounts.some(
      acc => acc.address === address && acc.network === targetNetwork
    );
  }

  /**
   * Check if a Polkadot account is authorized for a DID (remote verification)
   * 
   * This method resolves the DID document, fetches the Polkadot accounts endpoint,
   * and verifies the account is authorized. Use this for third-party verification.
   * 
   * @param did - DID identifier
   * @param address - Polkadot account address to check
   * @param network - Network identifier (optional, defaults to "asset-hub")
   * @returns true if authorized, false otherwise
   */
  async isPolkadotAccountAuthorizedRemote(
    did: string,
    address: string,
    network?: string
  ): Promise<boolean> {
    // Resolve DID document
    const didUrl = this.didWebToUrl(did);
    let response: Response;
    try {
      response = await fetch(didUrl, {
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
    } catch (fetchError: any) {
      const errorMessage = fetchError.message || 'Unknown error';
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('aborted');
      const detail = isTimeout ? 'timeout' : 'network error';
      throw new Error(`Authorization check failed (${detail}) while fetching DID document: ${didUrl}`);
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(`Authorization check rate-limited while fetching DID document: ${didUrl}`);
      }
      throw new Error(`Authorization check failed fetching DID document: HTTP ${response.status} (${didUrl})`);
    }

    const didDocument = await response.json();

    // Extract service endpoint URL
    const serviceEndpointUrl = this.extractPolkadotAccountsServiceEndpoint(didDocument);
    if (!serviceEndpointUrl) {
      return false; // No PolkadotAccounts service found
    }

    // Fetch accounts from endpoint
    let accountsResponse: Response;
    try {
      accountsResponse = await fetch(serviceEndpointUrl, {
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
    } catch (fetchError: any) {
      const errorMessage = fetchError.message || 'Unknown error';
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('aborted');
      const detail = isTimeout ? 'timeout' : 'network error';
      throw new Error(`Authorization check failed (${detail}) while fetching Polkadot accounts: ${serviceEndpointUrl}`);
    }

    if (!accountsResponse.ok) {
      if (accountsResponse.status === 429) {
        throw new Error(`Authorization check rate-limited while fetching Polkadot accounts: ${serviceEndpointUrl}`);
      }
      throw new Error(
        `Authorization check failed fetching Polkadot accounts: HTTP ${accountsResponse.status} (${serviceEndpointUrl})`
      );
    }

    const accountsDoc = await accountsResponse.json();

    // Verify account is in the list
    const targetNetwork = network || 'asset-hub';
    const networkPrefix = `polkadot:${targetNetwork}`;

    if (!accountsDoc.accounts || !Array.isArray(accountsDoc.accounts)) {
      return false;
    }

    for (const accountGroup of accountsDoc.accounts) {
      if (accountGroup.network === networkPrefix && accountGroup.addresses) {
        return accountGroup.addresses.includes(address);
      }
    }

    return false;
  }

  /**
   * Extract Polkadot accounts service endpoint URL from a resolved DID document
   * 
   * This is a utility method to parse the DID document service field
   * and extract the serviceEndpoint URL (string) for PolkadotAccounts service.
   * 
   * @param didDocument - Resolved DID document
   * @returns Service endpoint URL string, or null if not found
   */
  extractPolkadotAccountsServiceEndpoint(didDocument: any): string | null {
    const services = Array.isArray(didDocument?.service) ? didDocument.service : [];
    const svc = services.find((s: any) => s?.type === 'PolkadotAccounts');
    return (typeof svc?.serviceEndpoint === 'string') ? svc.serviceEndpoint : null;
  }

  /**
   * Fetch and parse Polkadot accounts from remote endpoint
   * 
   * Fetches the accounts document from the serviceEndpoint URL and returns
   * the parsed accounts grouped by network.
   * 
   * @param serviceEndpointUrl - URL to Polkadot accounts endpoint
   * @returns Map of network -> addresses array, or null if fetch fails
   */
  async fetchPolkadotAccountsFromEndpoint(serviceEndpointUrl: string): Promise<Map<string, string[]> | null> {
    try {
      const response = await fetch(serviceEndpointUrl);
      if (!response.ok) {
        console.warn(`[DidWebManager] Failed to fetch Polkadot accounts from ${serviceEndpointUrl}: HTTP ${response.status}`);
        return null;
      }

      const accountsDoc = await response.json();
      const accountsByNetwork = new Map<string, string[]>();

      if (!accountsDoc.accounts || !Array.isArray(accountsDoc.accounts)) {
        return accountsByNetwork; // Empty map
      }

      for (const accountGroup of accountsDoc.accounts) {
        if (accountGroup.network && accountGroup.addresses && Array.isArray(accountGroup.addresses)) {
          // Extract network name (remove "polkadot:" prefix if present)
          const network = accountGroup.network.replace(/^polkadot:/, '');
          accountsByNetwork.set(network, accountGroup.addresses);
        }
      }

      return accountsByNetwork;
    } catch (error: any) {
      console.error(`[DidWebManager] Error fetching Polkadot accounts from ${serviceEndpointUrl}:`, error.message);
      return null;
    }
  }

  /**
   * Update Polkadot accounts in PostgreSQL
   */
  private async updatePolkadotAccountsInPostgres(
    did: string,
    accounts: PolkadotAccountAuthorization[]
  ): Promise<void> {
    if (!this.pool) throw new Error('PostgreSQL pool not initialized');

    const query = `
      UPDATE issuer_identities 
      SET authorized_polkadot_accounts = $2
      WHERE did = $1
    `;

    await this.pool.query(query, [did, JSON.stringify(accounts)]);
  }
}

// Singleton instance
let manager: DidWebManager | null = null;

/**
 * Get the global DidWebManager instance
 * 
 * @returns Singleton DidWebManager instance
 */
export function getDidWebManager(): DidWebManager {
  if (!manager) {
    // Initialize with PostgreSQL pool if available
    let pool: Pool | undefined;
    const isTestMode = process.env.FIDES_MODE === 'test' || process.env.TEST_MODE === '1';
    if (!isTestMode && process.env.DATABASE_URL) {
      pool = new PgPool({ connectionString: process.env.DATABASE_URL });
    }
    
    manager = new DidWebManager(pool);
  }
  return manager;
}
