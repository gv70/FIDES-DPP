/**
 * CLI Create Command with VC Integration
 * 
 * Creates a DPP with VC using hybrid flow (same as Web UI).
 * Uses DppApplicationService for CLI-Web parity.
 * 
 * @license Apache-2.0
 */

import { Command } from 'commander';
import * as fs from 'fs';
import { createDppService } from '../../../src/lib/factory/createDppService';
import type { CreatePassportFormInput } from '../../../src/lib/application/hybrid-types';
import { loadPolkadotAccount, validateEd25519Account, formatAccountInfo } from '../lib/account';

/**
 * Base64 URL encode (for JWT signature)
 */
function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString('base64');
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function createVcCommand(program: Command) {
  program
    .command('create-vc')
    .description('Create a new DPP with VC and register on-chain (uses same ApplicationService as Web UI)')
    .requiredOption('-j, --json <file>', 'DPP data JSON file')
    .requiredOption('-a, --account <keyring>', 'Account URI (e.g., //Alice)')
    .option('--backend <type>', 'IPFS backend: kubo, helia, pinata', 'kubo')
    .option('--key-type <type>', 'Key type: ed25519 or sr25519', 'ed25519')
    .option('--network <network>', 'Polkadot network', 'westend-asset-hub')
    .option('--issuer-did <did>', 'did:web issuer DID or domain (e.g., did:web:example.com or example.com)')
    .option('--json-output', 'Output result as JSON')
    .action(async (options) => {
      try {
        console.log('Creating DPP with Verifiable Credential\n');

        // 1. Load DPP data from JSON file
        console.log(`Loading DPP data from ${options.json}`);
        const dppDataRaw = fs.readFileSync(options.json, 'utf-8');
        const dppDataJson = JSON.parse(dppDataRaw);

        // 2. Load Polkadot account
        console.log(`Loading account ${options.account}`);
        const account = await loadPolkadotAccount(options.account, options.keyType);
        console.log(formatAccountInfo(account));
        console.log('');

        // 3. Validate environment
        if (!process.env.CONTRACT_ADDRESS) {
          throw new Error('CONTRACT_ADDRESS environment variable not set');
        }

        // 4. Create DPP service (same factory as Web UI)
	        const dppService = createDppService({
	          ipfsBackend: options.backend,
	          ipfsNodeUrl: process.env.IPFS_NODE_URL || 'http://127.0.0.1:5001',
	          ipfsGatewayUrl: process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:8080',
	          contractAddress: process.env.CONTRACT_ADDRESS,
	          rpcUrl: process.env.POLKADOT_RPC_URL || process.env.RPC_URL || 'wss://westend-asset-hub-rpc.polkadot.io',
	          enableStatusList: false,
	          enableAnagrafica: false,
	        });

        const normalizedIssuerDid = (() => {
          const raw = String(options.issuerDid || '').trim();
          if (!raw) return undefined;
          if (raw.startsWith('did:web:')) return raw;
          return `did:web:${raw}`;
        })();

        console.log(`Backend: ${options.backend}`);
        console.log(`Network: ${options.network}`);
        if (normalizedIssuerDid) console.log(`Issuer: ${normalizedIssuerDid}`);
        console.log('');

        // 5. Prepare passport creation (Phase 1: same as Web UI)
        console.log('Phase 1: Prepare');
        const formInput: CreatePassportFormInput = {
          productId: dppDataJson.productId,
          productName: dppDataJson.productName,
          productDescription: dppDataJson.productDescription,
          granularity: dppDataJson.granularity || 'Batch',
          batchNumber: dppDataJson.batchNumber,
          serialNumber: dppDataJson.serialNumber,
          manufacturer: dppDataJson.manufacturer || {
            name: dppDataJson.manufacturerName || 'Unknown Manufacturer',
            identifier: dppDataJson.manufacturerIdentifier,
            country: dppDataJson.manufacturerCountry,
            facility: dppDataJson.manufacturerFacility,
          },
          annexIII: dppDataJson.annexIII,
          issuerAddress: account.address,
          issuerPublicKey: `0x${Buffer.from(account.publicKey).toString('hex')}`,
          network: options.network,
          // did:web support
          useDidWeb: !!normalizedIssuerDid,
          issuerDid: normalizedIssuerDid,
        };

        // did:key path requires ed25519 for VC-JWT (EdDSA)
        if (!normalizedIssuerDid) {
          if (options.keyType !== 'ed25519') {
            throw new Error('did:key path requires --key-type ed25519. For sr25519, use --issuer-did did:web:example.com.');
          }
          validateEd25519Account(account);
        }

        const prepared = await dppService.preparePassportCreation(formInput);

        // 6. Sign VC-JWT (Phase 2: CLI uses account.sign() instead of browser wallet)
        console.log('Phase 2: Sign VC');
        let signedVcJwt: string;
        if (normalizedIssuerDid) {
          // did:web issuance happens server-side; the signature provided here is ignored.
          signedVcJwt = `${prepared.vcSignablePayload.signingInput}.`;
        } else {
          const signingInputBytes = new TextEncoder().encode(prepared.vcSignablePayload.signingInput);
          const signature = await account.sign(signingInputBytes);
          const signatureB64 = base64UrlEncode(signature);
          signedVcJwt = `${prepared.vcSignablePayload.signingInput}.${signatureB64}`;
        }

        // 7. Finalize passport creation (Phase 3: same as Web UI)
        console.log('Phase 3: Upload and register\n');
        const finalize = await dppService.finalizePassportCreation({
          preparedId: prepared.preparedId,
          signedVcJwt,
          issuerAddress: account.address,
          issuerPublicKey: `0x${Buffer.from(account.publicKey).toString('hex')}`,
        });

        if (!finalize.success) {
          throw new Error(finalize.error || 'Failed to finalize passport creation');
        }

        const registrationData = (finalize as any).registrationData as {
          datasetUri: string;
          payloadHash: string;
          datasetType: string;
          granularity: string;
          subjectIdHash?: string;
          ipfsCid: string;
          issuerDidWebStatus?: string;
          warning?: string;
          verificationKey?: string;
        };

        if (!registrationData?.datasetUri || !registrationData?.payloadHash) {
          throw new Error('Finalize did not return registration data');
        }

        // Submit on-chain tx using the shared chain adapter (same contract + RPC config)
        const chain = (dppService as any).chain;
        const registerResult = await chain.registerPassport(
          {
            datasetUri: registrationData.datasetUri,
            payloadHash: registrationData.payloadHash,
            datasetType: registrationData.datasetType,
            granularity: registrationData.granularity,
            subjectIdHash: registrationData.subjectIdHash,
          },
          account
        );
        await chain.waitForTransaction(registerResult.txHash);

        const renderBaseUrl = process.env.RENDER_BASE_URL || 'http://localhost:3000';
        const verifyUrl =
          registerResult.tokenId && registrationData.verificationKey
            ? `${renderBaseUrl.replace(/\/$/, '')}/render/${encodeURIComponent(registerResult.tokenId)}?key=${encodeURIComponent(
                registrationData.verificationKey
              )}`
            : undefined;

        const outputPayload = {
          success: true,
          tokenId: registerResult.tokenId,
          ipfsCid: registrationData.ipfsCid,
          datasetUri: registrationData.datasetUri,
          payloadHash: registrationData.payloadHash,
          txHash: registerResult.txHash,
          blockNumber: registerResult.blockNumber,
          ...(registrationData.issuerDidWebStatus && { issuerDidWebStatus: registrationData.issuerDidWebStatus }),
          ...(registrationData.warning && { warning: registrationData.warning }),
          ...(verifyUrl && { verifyUrl }),
        };

        if (options.jsonOutput) {
          console.log(JSON.stringify(outputPayload, null, 2));
          return;
        }

        console.log('Passport created');
        console.log(`Token ID: ${registerResult.tokenId}`);
        console.log(`IPFS CID: ${registrationData.ipfsCid}`);
        console.log(`Tx Hash: ${registerResult.txHash}`);
        console.log(`Block: ${registerResult.blockNumber || 'pending'}`);
        if (verifyUrl) console.log(`Verify URL: ${verifyUrl}`);
        if (registrationData.warning) console.log(`Warning: ${registrationData.warning}`);

      } catch (error: any) {
        console.error(`\nError: ${error.message}`);
        if (error.stack && process.env.DEBUG) {
          console.error('\nStack trace:', error.stack);
        }
        process.exit(1);
      }
    });
}
