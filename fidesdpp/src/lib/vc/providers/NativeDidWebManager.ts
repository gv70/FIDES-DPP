/**
 * Native DID:web Manager
 * 
 * FOSS implementation of DidWebProvider using Node.js crypto.
 * This is the DEFAULT and REQUIRED implementation.
 * 
 * @license Apache-2.0
 */

import crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { DidWebProvider, DidDocument } from './DidWebProvider';
import type { VcIssuerIdentity, VcIssuerIdentityMetadata } from '../issuer-identity';

interface StoredIssuerData {
  identity: VcIssuerIdentity;
  publicKeyJwk: any;
  privateKeyJwk: any;
  createdAt: string;
  updatedAt: string;
}

/**
 * Native DID:web Provider (FOSS, always available)
 * 
 * Uses Node.js crypto for Ed25519 key generation.
 * Storage: File-based (./data/didweb-issuers.json) or PostgreSQL.
 * 
 * Note: did:web requires hosting /.well-known/did.json on your domain.
 * This class generates DID documents; hosting is handled by Next.js API route.
 */
export class NativeDidWebManager implements DidWebProvider {
  private dataPath: string;
  private issuers: Map<string, StoredIssuerData> = new Map();
  private loaded: boolean = false;

  constructor(dataPath?: string) {
    const dataDirEnv =
      process.env.DIDWEB_DATA_PATH
        ? path.dirname(process.env.DIDWEB_DATA_PATH)
        : process.env.FIDES_DATA_DIR ||
          process.env.DATA_DIR ||
          (process.env.VERCEL ? '/tmp' : '');
    const defaultPath = dataDirEnv
      ? path.join(path.resolve(dataDirEnv), 'didweb-issuers.json')
      : './data/didweb-issuers.json';
    this.dataPath = dataPath || process.env.DIDWEB_DATA_PATH || defaultPath;
  }

  /**
   * Load issuers from file storage
   */
  private async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const dir = path.dirname(this.dataPath);
      await fs.mkdir(dir, { recursive: true });

      const content = await fs.readFile(this.dataPath, 'utf-8');
      const data = JSON.parse(content);

      for (const [did, issuerData] of Object.entries<any>(data)) {
        this.issuers.set(did, issuerData);
      }

      this.loaded = true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist - start empty
        this.loaded = true;
      } else {
        throw new Error(`Failed to load did:web issuers: ${error.message}`);
      }
    }
  }

  /**
   * Persist issuers to file storage
   */
  private async persist(): Promise<void> {
    const data: Record<string, StoredIssuerData> = {};
    
    for (const [did, issuerData] of this.issuers.entries()) {
      data[did] = issuerData;
    }

    const tempPath = `${this.dataPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, this.dataPath);
  }

  async registerIssuer(domain: string, metadata?: VcIssuerIdentityMetadata): Promise<VcIssuerIdentity> {
    await this.load();

    // Validate domain
    if (!this.isValidDomain(domain)) {
      throw new Error(`Invalid domain format: ${domain}`);
    }

    // Create did:web DID
    const did = `did:web:${domain}`;

    // Check if already exists
    const existing = this.issuers.get(did);
    if (existing) {
      return existing.identity;
    }

    // Generate Ed25519 key pair
    const { publicKey, privateKey, publicKeyJwk, privateKeyJwk } = this.generateEd25519KeyPair();

    // Create issuer identity
    const identity: VcIssuerIdentity = {
      did,
      signingKey: {
        type: 'ed25519',
        publicKey,
        privateKey,
      },
      method: 'did:web',
      metadata: {
        domain,
        registeredAt: new Date(),
        ...metadata,
      },
    };

    // Store
    this.issuers.set(did, {
      identity,
      publicKeyJwk,
      privateKeyJwk,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await this.persist();

    return identity;
  }

  async getIssuer(did: string): Promise<VcIssuerIdentity | null> {
    await this.load();

    const stored = this.issuers.get(did);
    return stored ? stored.identity : null;
  }

  async rotateKey(did: string): Promise<VcIssuerIdentity> {
    await this.load();

    const existing = this.issuers.get(did);
    if (!existing) {
      throw new Error(`Issuer not found: ${did}`);
    }

    // Generate new key pair
    const { publicKey, privateKey, publicKeyJwk, privateKeyJwk } = this.generateEd25519KeyPair();

    // Update identity
    const updatedIdentity: VcIssuerIdentity = {
      ...existing.identity,
      signingKey: {
        type: 'ed25519',
        publicKey,
        privateKey,
      },
    };

    // Store updated identity
    this.issuers.set(did, {
      identity: updatedIdentity,
      publicKeyJwk,
      privateKeyJwk,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    });

    await this.persist();

    return updatedIdentity;
  }

  async generateDidDocument(did: string): Promise<DidDocument> {
    await this.load();

    const stored = this.issuers.get(did);
    if (!stored) {
      throw new Error(`Issuer not found: ${did}`);
    }

    const verificationMethodId = `${did}#key-1`;

    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/jws-2020/v1',
      ],
      id: did,
      verificationMethod: [
        {
          id: verificationMethodId,
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk: stored.publicKeyJwk,
        },
      ],
      authentication: [verificationMethodId],
      assertionMethod: [verificationMethodId],
      service: [
        {
          id: `${did}#idr`,
          type: 'LinkedVerifiablePresentation',
          serviceEndpoint: process.env.IDR_BASE_URL 
            ? `${process.env.IDR_BASE_URL}/idr/products/`
            : 'https://dpp.example.com/idr/products/',
        },
      ],
    };
  }

  async listIssuers(): Promise<string[]> {
    await this.load();
    return Array.from(this.issuers.keys());
  }

  /**
   * Generate Ed25519 key pair using Node.js crypto
   */
  private generateEd25519KeyPair(): {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
    publicKeyJwk: any;
    privateKeyJwk: any;
  } {
    // Generate Ed25519 key pair using Node.js crypto
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'jwk' },
      privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
    });

    const publicKeyJwk = publicKey as any;
    const privateKeyJwk = privateKey as any;

    // Extract raw bytes from JWK 'x' field (base64url encoded)
    const publicKeyBytes = this.base64UrlDecode(publicKeyJwk.x);
    const privateKeyBytes = this.base64UrlDecode(privateKeyJwk.d);

    return {
      publicKey: publicKeyBytes,
      privateKey: privateKeyBytes,
      publicKeyJwk,
      privateKeyJwk,
    };
  }

  /**
   * Decode base64url string to Uint8Array
   */
  private base64UrlDecode(base64url: string): Uint8Array {
    // Convert base64url to base64
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    // Decode
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }

  /**
   * Validate domain format
   */
  private isValidDomain(domain: string): boolean {
    // Basic domain validation (alphanumeric, dots, hyphens)
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain);
  }
}

/**
 * Global singleton instance
 * TODO: Replace with dependency injection in production
 */
let globalInstance: NativeDidWebManager | null = null;

export function getDidWebManager(): NativeDidWebManager {
  if (!globalInstance) {
    globalInstance = new NativeDidWebManager();
  }
  return globalInstance;
}


