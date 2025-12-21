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
}
declare class PreparedDataStore {
    private store;
    /**
     * Store prepared data
     */
    set(id: string, data: PreparedData): void;
    /**
     * Retrieve prepared data
     */
    get(id: string): PreparedData | undefined;
    /**
     * Delete prepared data
     */
    delete(id: string): void;
    /**
     * Clean expired entries
     */
    cleanExpired(): void;
}
export declare const preparedDataStore: PreparedDataStore;
export {};
//# sourceMappingURL=prepared-data-store.d.ts.map