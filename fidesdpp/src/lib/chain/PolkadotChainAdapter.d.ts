/**
 * Polkadot Chain Adapter for v0.2 Contract
 *
 * Implements ChainAdapter interface for ink! v0.2 minimal anchor contract.
 *
 * @license Apache-2.0
 */
import type { ChainAdapter, PassportRegistration, RegisterResult, OnChainPassport, TransactionResult, ContractEventType, ContractEvent, Unsubscribe } from './ChainAdapter';
import type { PolkadotAccount } from '../vc/types';
export interface PolkadotChainAdapterConfig {
    rpcUrl: string;
    contractAddress: string;
    abiPath: string;
}
export declare class PolkadotChainAdapter implements ChainAdapter {
    private config;
    private dedotClient?;
    private dedotContract?;
    private api?;
    private contract?;
    constructor(config: PolkadotChainAdapterConfig);
    /**
     * Ensure API and contract are connected (for @polkadot/api-contract methods)
     */
    private ensureConnected;
    /**
     * Ensure Dedot client and contract are connected (for readPassport method)
     *
     * Uses Dedot instead of @polkadot/api-contract to support Asset Hub's reviveApi
     */
    private ensureDedotConnected;
    /**
     * Register a new passport on-chain
     */
    registerPassport(registration: PassportRegistration, signerAccount: PolkadotAccount): Promise<RegisterResult>;
    /**
     * Read passport data from chain
     *
     * Uses Dedot for contract queries (works on Asset Hub with reviveApi).
     * The contract returns Option<PassportRecord>:
     * - None if token_id doesn't exist
     * - Some(PassportRecord) if found
     */
    readPassport(tokenId: string): Promise<OnChainPassport>;
    /**
     * Update dataset URI (after uploading new version to IPFS)
     *
     * NOTE: Granularity is IMMUTABLE after registration.
     * This method only updates dataset_uri, payload_hash, dataset_type, and subject_id_hash.
     */
    updateDataset(tokenId: string, datasetUri: string, payloadHash: string, datasetType: string, subjectIdHash: string | undefined, signerAccount: PolkadotAccount): Promise<TransactionResult>;
    /**
     * Revoke a passport
     */
    revokePassport(tokenId: string, reason: string | undefined, signerAccount: PolkadotAccount): Promise<TransactionResult>;
    /**
     * Wait for transaction to be included in a block
     *
     * Note: Already handled in signAndSend above
     */
    waitForTransaction(txHash: string): Promise<void>;
    /**
     * Subscribe to contract events
     */
    subscribeToEvents(eventType: ContractEventType, callback: (event: ContractEvent) => void): Unsubscribe;
    /**
     * Check if account has authority to issue/update passports
     *
     * In v0.2, any account can register (authority is implicit = issuer)
     */
    hasAuthority(account: string): Promise<boolean>;
    /**
     * Convert hex string to Uint8Array[32]
     */
    private hexToBytes32;
    /**
     * Convert Uint8Array to hex string
     */
    private bytes32ToHex;
    /**
     * Convert Dedot FixedBytes<32> to hex string
     *
     * Used for payloadHash and subjectIdHash from Dedot contract queries
     */
    private toHex;
    /**
     * Normalize hash from various formats to 0x... hex string
     */
    private normalizeHash;
    /**
     * Map TypeScript Granularity to contract enum variant
     */
    private mapGranularityToContract;
    /**
     * Map contract Granularity enum to TypeScript type
     */
    private mapGranularityFromContract;
    /**
     * Map on-chain status enum to TypeScript type
     */
    private mapStatus;
    /**
     * Disconnect from chain (cleanup)
     */
    disconnect(): Promise<void>;
}
//# sourceMappingURL=PolkadotChainAdapter.d.ts.map