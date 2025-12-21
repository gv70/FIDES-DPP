/**
 * Chain Adapter Interface
 * 
 * Abstract interface for interacting with ink! smart contract on Asset Hub
 * 
 * @license Apache-2.0
 */

import type { PolkadotAccount } from '../vc/types';

export interface ChainAdapter {
  /**
   * Register a new passport on-chain
   * 
   * @param registration - Passport data to register
   * @param signerAccount - Polkadot account to sign transaction
   * @returns Transaction result with token ID
   */
  registerPassport(
    registration: PassportRegistration,
    signerAccount: PolkadotAccount
  ): Promise<RegisterResult>;

  /**
   * Read passport data from chain
   * 
   * @param tokenId - Token ID to read
   * @returns On-chain passport data
   */
  readPassport(tokenId: string): Promise<OnChainPassport>;

  /**
   * Update dataset URI (after uploading new version to IPFS)
   * 
   * @param tokenId - Token ID to update
   * @param datasetUri - New IPFS URI (ipfs://...)
   * @param payloadHash - New payload hash
   * @param datasetType - Content type
   * @param signerAccount - Polkadot account to sign transaction
   * @returns Transaction result
   */
  /**
   * Update passport dataset (new version on IPFS)
   * 
   * NOTE: Granularity is IMMUTABLE after registration.
   * If you need to change granularity, revoke the old passport and register a new one.
   * 
   * @param subjectIdHash - Optional SHA-256 hash of canonical subject ID (0x... hex or undefined)
   */
  updateDataset(
    tokenId: string,
    datasetUri: string,
    payloadHash: string,
    datasetType: string,
    subjectIdHash: string | undefined,
    signerAccount: PolkadotAccount
  ): Promise<TransactionResult>;

  /**
   * Revoke a passport
   * 
   * @param tokenId - Token ID to revoke
   * @param reason - Optional revocation reason
   * @param signerAccount - Polkadot account to sign transaction
   * @returns Transaction result
   */
  revokePassport(
    tokenId: string,
    reason: string | undefined,
    signerAccount: PolkadotAccount
  ): Promise<TransactionResult>;

  /**
   * Wait for transaction to be included in a block
   * 
   * @param txHash - Transaction hash
   */
  waitForTransaction(txHash: string): Promise<void>;

  /**
   * Subscribe to contract events
   * 
   * @param eventType - Type of event to subscribe to
   * @param callback - Callback function for events
   * @returns Unsubscribe function
   */
  subscribeToEvents(
    eventType: ContractEventType,
    callback: (event: ContractEvent) => void
  ): Unsubscribe;

  /**
   * Check if account has authority to issue/update passports
   * 
   * @param account - Account address to check
   * @returns True if account has authority
   */
  hasAuthority(account: string): Promise<boolean>;
}

/**
 * Granularity level - mirrors UNTP granularityLevel and ESPR Article 10(1)(f)
 */
export type Granularity = 'ProductClass' | 'Batch' | 'Item';

export interface PassportRegistration {
  datasetUri: string;
  payloadHash: string;
  datasetType: string;
  granularity: Granularity; // ProductClass, Batch, or Item
  subjectIdHash?: string; // Optional: SHA-256 of canonical subject ID
  product?: any; // Optional: for adapter-specific use (not sent to v0.2 contract)
  manufacturer?: any; // Optional: for adapter-specific use (not sent to v0.2 contract)
}

export interface RegisterResult {
  tokenId: string;
  txHash: string;
  blockNumber: number;
}

export interface OnChainPassport {
  tokenId: string;
  issuer: string;
  datasetUri: string;
  payloadHash: string;
  datasetType: string; // "application/vc+jwt" for v0.2
  granularity: Granularity; // ProductClass, Batch, or Item
  subjectIdHash?: string; // SHA-256 of canonical subject ID (0x... hex)
  status: PassportStatus;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export type PassportStatus = 'Draft' | 'Active' | 'Suspended' | 'Revoked' | 'Archived';

export interface TransactionResult {
  txHash: string;
  blockNumber: number;
}

export type ContractEventType = 
  | 'PassportRegistered' 
  | 'PassportUpdated' 
  | 'PassportRevoked';

export interface ContractEvent {
  type: ContractEventType;
  tokenId: string;
  blockNumber: number;
  data: any;
}

export type Unsubscribe = () => void;
