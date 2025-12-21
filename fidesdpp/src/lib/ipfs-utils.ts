/**
 * Client-side utilities for IPFS operations
 * These functions call the API routes to interact with Pinata
 */

export interface IPFSUploadResult {
  cid: string;
  hash: string;
  url: string;
  size: number;
}

export interface IPFSRetrieveResult {
  data: any;
  hash: string;
  cid: string;
}

/**
 * Upload passport data to IPFS via Pinata
 * @param passportData - The passport data object to upload
 * @returns Promise with CID, hash, and URL
 */
export async function uploadToIPFS(passportData: any): Promise<IPFSUploadResult> {
  const response = await fetch("/api/ipfs/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ passportData }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upload to IPFS");
  }

  return response.json();
}

/**
 * Retrieve passport data from IPFS via Pinata gateway
 * @param cid - The IPFS CID to retrieve
 * @returns Promise with data, hash, and CID
 */
export async function retrieveFromIPFS(cid: string): Promise<IPFSRetrieveResult> {
  const response = await fetch(`/api/ipfs/retrieve?cid=${encodeURIComponent(cid)}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to retrieve from IPFS");
  }

  return response.json();
}

/**
 * Convert IPFS CID to gateway URL
 * @param cid - The IPFS CID
 * @param gatewayUrl - Optional custom gateway URL (defaults to env variable)
 * @returns Gateway URL
 */
export function getIPFSGatewayURL(cid: string, gatewayUrl?: string): string {
  const gateway = gatewayUrl || process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL || "ipfs.io";
  // Remove protocol if present
  const cleanGateway = gateway.replace(/^https?:\/\//, "");
  return `https://${cleanGateway}/ipfs/${cid}`;
}

/**
 * Convert hash string to hex format for contract
 * @param hash - Hash string (with or without 0x prefix)
 * @returns Hex string with 0x prefix
 */
export function formatHashForContract(hash: string): string {
  // Remove 0x if present, then add it back
  const cleanHash = hash.startsWith("0x") ? hash.slice(2) : hash;
  return `0x${cleanHash}`;
}
