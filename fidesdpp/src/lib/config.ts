/**
 * Configuration for FIDES-DPP contract and network
 */

const DEFAULT_CONTRACT_ADDRESS = '0x6270bcdff0ac0ecbb3d00c7b4d8272780738feba';

// Contract address on Westend Asset Hub
// Client: set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local
// Server: set CONTRACT_ADDRESS in .env.local
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  process.env.CONTRACT_ADDRESS ||
  DEFAULT_CONTRACT_ADDRESS;

// RPC endpoint for Westend Asset Hub
export const RPC_URL =
  process.env.NEXT_PUBLIC_POLKADOT_RPC_URL ||
  process.env.POLKADOT_RPC_URL ||
  'wss://westend-asset-hub-rpc.polkadot.io';

// Network name
export const NETWORK_NAME = 'Westend Asset Hub';

// Network configuration for Typink
export const WESTEND_ASSET_HUB = {
  id: 'westend-asset-hub',
  name: 'Westend Asset Hub',
  rpcUrls: [RPC_URL],
  nativeCurrency: {
    name: 'WND',
    symbol: 'WND',
    decimals: 12,
  },
  blockExplorerUrls: ['https://assethub-westend.subscan.io'],
};
