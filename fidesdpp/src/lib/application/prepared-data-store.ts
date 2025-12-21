/**
 * Shared Prepared Data Store
 * 
 * Singleton store for prepared passport data that persists across
 * different DppApplicationService instances (needed for server actions).
 * 
 * In production, this should be replaced with Redis or similar.
 * 
 * @license Apache-2.0
 */

interface PreparedData {
  input: any;
  untpDpp: any;
  vcPayload: any;
  createdAt: number;
  expiresAt: number;
  issuerDid?: string;
  useDidWeb?: boolean;
  issuerIdentity?: any;
  verificationKey?: string;
}

class PreparedDataStore {
  private store: Map<string, PreparedData> = new Map();

  /**
   * Store prepared data
   */
  set(id: string, data: PreparedData): void {
    this.store.set(id, data);
  }

  /**
   * Retrieve prepared data
   */
  get(id: string): PreparedData | undefined {
    const data = this.store.get(id);
    
    if (!data) {
      return undefined;
    }

    // Check expiration
    if (Date.now() > data.expiresAt) {
      this.store.delete(id);
      return undefined;
    }

    return data;
  }

  /**
   * Delete prepared data
   */
  delete(id: string): void {
    this.store.delete(id);
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): void {
    const now = Date.now();
    for (const [id, data] of this.store.entries()) {
      if (now > data.expiresAt) {
        this.store.delete(id);
      }
    }
  }
}

// Singleton instance
export const preparedDataStore = new PreparedDataStore();

// Clean expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    preparedDataStore.cleanExpired();
  }, 5 * 60 * 1000);
  timer.unref?.();
}

