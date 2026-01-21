'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCheckMappedAccount, useTypink, txToaster, checkBalanceSufficiency } from 'typink';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { FileCode, CheckCircle2, AlertCircle, Copy, ExternalLink, Info, Upload } from 'lucide-react';
import { CONTRACT_ADDRESS } from '@/lib/config';
import { ContractDeployer } from 'dedot/contracts';
import { generateRandomHex } from 'dedot/utils';
import { DppContractContractApi } from '@/contracts/types/dpp-contract';
import dppContractMetadata from '@/contracts/artifacts/dpp_contract/dpp_contract.json';
import { useContractAddress } from '@/hooks/use-contract-address';

interface DppDeployProps {
  /** If true, removes Card wrapper (for use in Dialog) */
  noCard?: boolean;
}

export function DppDeploy({ noCard = false }: DppDeployProps) {
  const { isMapped } = useCheckMappedAccount();
  const { connectedAccount, client } = useTypink();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use contract address hook for easy switching
  const { setCustomAddress, setUseCustom } = useContractAddress();
  
  const [deployStep, setDeployStep] = useState<'idle' | 'uploading' | 'instantiating' | 'success'>('idle');
  const [codeHash, setCodeHash] = useState<string>('');
  const [contractAddress, setContractAddress] = useState<string>('');
  const [uploadedCodeHash, setUploadedCodeHash] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [wasmBytes, setWasmBytes] = useState<Uint8Array | null>(null);
  const [wasmHex, setWasmHex] = useState<string | null>(null); // Store hex string directly
  const [currentContractAddress] = useState<string>(CONTRACT_ADDRESS);
  const [isLoadingContract, setIsLoadingContract] = useState<boolean>(true);

  // Load contract file automatically on mount
  useEffect(() => {
    const loadContractFile = async () => {
      try {
        setIsLoadingContract(true);
        // Try to load the contract file from the artifacts directory
        // Using dynamic import to load the JSON file
        const contractModule = await import('@/contracts/artifacts/dpp_contract/dpp_contract.contract.json');
        const contractData = contractModule.default || contractModule;
        
        // Extract WASM/PolkaVM code from .contract file (contract_binary field)
        if (contractData.source?.contract_binary) {
          let codeHex = contractData.source.contract_binary;
          // Ensure it has 0x prefix
          if (!codeHex.startsWith('0x')) {
            codeHex = '0x' + codeHex;
          }
          setWasmHex(codeHex);
          // Also store as bytes for display purposes
          const wasmArray = new Uint8Array(
            codeHex.slice(2).match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
          );
          setWasmBytes(wasmArray);
          setError('');
        } else {
          throw new Error('WASM/PolkaVM code not found in contract file.');
        }
      } catch (e: any) {
        console.error('Auto-load contract error:', e);
        // Don't show error, just allow manual upload
        setError('');
      } finally {
        setIsLoadingContract(false);
      }
    };

    loadContractFile();
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const contractData = JSON.parse(text);
      
      // Extract WASM/PolkaVM code from .contract file (contract_binary field)
      if (contractData.source?.contract_binary) {
        let codeHex = contractData.source.contract_binary;
        // Ensure it has 0x prefix
        if (!codeHex.startsWith('0x')) {
          codeHex = '0x' + codeHex;
        }
        setWasmHex(codeHex);
        // Also store as bytes for display purposes
        const wasmArray = new Uint8Array(
          codeHex.slice(2).match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
        );
        setWasmBytes(wasmArray);
        toast.success('Contract file loaded successfully!');
        setError('');
      } else {
        throw new Error('WASM/PolkaVM code not found in contract file. Make sure you selected a .contract file.');
      }
    } catch (e: any) {
      console.error('File read error:', e);
      toast.error(e.message || 'Failed to read contract file');
      setError(e.message || 'Failed to read contract file');
    }
  };

  const handleDeploy = async () => {
    if (!client || !connectedAccount) {
      setError('Please connect your account first');
      return;
    }

    if (!wasmHex) {
      setError('Please load a .contract file first');
      return;
    }

    setError('');
    setDeployStep('instantiating');
    const toaster = txToaster('Deploying contract...');

    try {
      await checkBalanceSufficiency(client, connectedAccount.address);

      // Create ContractDeployer with the hex string directly (no conversion needed)
      // For ink! v6, contract_binary contains PolkaVM code which is what we need
      const deployer = new ContractDeployer<DppContractContractApi>(
        client,
        dppContractMetadata as any,
        wasmHex
      );

      // Generate random salt for deterministic address
      const salt = generateRandomHex();

      // Deploy the contract
      const deploymentResult = await deployer.tx
        .new({ salt })
        .signAndSend(connectedAccount.address, (progress) => {
          toaster.onTxProgress(progress);
        })
        .untilFinalized();

      // Get contract address from deployment result
      const deployedAddress = await deploymentResult.contractAddress();
      setContractAddress(deployedAddress);
      setDeployStep('success');
      toast.success(`Contract deployed! Address: ${deployedAddress}`);
    } catch (e: any) {
      console.error('Deploy error:', e);
      setError(e.message || 'Failed to deploy contract');
      setDeployStep('idle');
      toaster.onTxError(e);
    }
  };

  const content = (
    <div className='space-y-6'>
        {error && (
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Current Contract */}
        <div className='space-y-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <CheckCircle2 className='w-5 h-5 text-blue-600 dark:text-blue-400' />
              <h3 className='text-lg font-semibold'>Current Contract</h3>
            </div>
          </div>
          <div className='space-y-2'>
            <Label>Contract Address</Label>
            <div className='flex items-center gap-2'>
              <code className='text-xs bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded flex-1 break-all font-mono'>
                {currentContractAddress}
              </code>
              <Button
                size='sm'
                variant='outline'
                onClick={() => copyToClipboard(currentContractAddress, 'Address')}>
                <Copy className='w-4 h-4' />
              </Button>
            </div>
          </div>
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='outline'
              onClick={() => {
                window.open(`https://assethub-westend.subscan.io/account/${currentContractAddress}`, '_blank');
              }}>
              <ExternalLink className='w-4 h-4 mr-1' />
              View on Subscan
            </Button>
          </div>
        </div>

        {/* Step 1: Contract File Status */}
        <div className='space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
          <div className='flex items-center gap-2'>
            <FileCode className='w-5 h-5' />
            <h3 className='text-lg font-semibold'>Contract File</h3>
          </div>
          
          {isLoadingContract ? (
            <div className='space-y-2'>
              <p className='text-sm text-muted-foreground'>Loading…</p>
            </div>
          ) : wasmBytes ? (
            <div className='space-y-2'>
              <div className='bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-3'>
                <p className='text-xs text-green-600 dark:text-green-400 font-medium'>
                  ✓ Contract file ready ({wasmBytes.length.toLocaleString()} bytes)
                </p>
              </div>
              <details className='text-xs text-muted-foreground'>
                <summary className='cursor-pointer hover:text-foreground'>Use a different file</summary>
                <div className='mt-2 space-y-2'>
                  <Label>Upload .contract file</Label>
                  <Input
                    ref={fileInputRef}
                    type='file'
                    accept='.contract'
                    onChange={handleFileSelect}
                    className='text-xs'
                  />
                </div>
              </details>
            </div>
          ) : (
            <div className='space-y-2'>
              <Alert variant='destructive'>
                <AlertCircle className='h-4 w-4' />
                <AlertTitle>Contract file not found</AlertTitle>
                <AlertDescription>
                  Upload the compiled `.contract` file.
                </AlertDescription>
              </Alert>
              <div className='space-y-2'>
                <Label>Select file</Label>
                <Input
                  ref={fileInputRef}
                  type='file'
                  accept='.contract'
                  onChange={handleFileSelect}
                  className='flex-1'
                />
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Deploy Contract */}
        <div className='space-y-4 bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-6'>
          <div className='flex items-center gap-2'>
            <Upload className='w-5 h-5' />
            <h3 className='text-lg font-semibold'>Deploy</h3>
          </div>

          <Button
            onClick={handleDeploy}
            disabled={deployStep === 'instantiating' || !wasmHex || !connectedAccount || !isMapped || !client || isLoadingContract}
            className='w-full'>
            {deployStep === 'instantiating' ? 'Deploying...' : isLoadingContract ? 'Loading contract...' : 'Deploy Contract'}
          </Button>
        </div>

        {/* Success: New Contract Deployed */}
        {contractAddress && (
          <Alert>
            <CheckCircle2 className='h-4 w-4' />
            <AlertTitle>Contract deployed</AlertTitle>
            <AlertDescription className='space-y-2'>
              <div>
                Address: <code className='text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded'>{contractAddress}</code>
              </div>
              <div className='flex gap-2 mt-2'>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => copyToClipboard(contractAddress, 'Address')}>
                  <Copy className='w-4 h-4 mr-1' />
                  Copy Address
                </Button>
                <Button
                  size='sm'
                  variant='default'
                  onClick={() => {
                    setCustomAddress(contractAddress);
                    setUseCustom(true);
                    toast.success('Contract address set');
                  }}>
                  <CheckCircle2 className='w-4 h-4 mr-1' />
                  Set Active
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => {
                    window.open(`https://assethub-westend.subscan.io/account/${contractAddress}`, '_blank');
                  }}>
                  <ExternalLink className='w-4 h-4 mr-1' />
                  View on Subscan
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {isMapped === false && connectedAccount && (
          <Alert>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Account Mapping Required</AlertTitle>
            <AlertDescription>
              Your account needs to be mapped before deploying contracts on this network.
            </AlertDescription>
          </Alert>
        )}

        {!connectedAccount && (
          <Alert>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Account Not Connected</AlertTitle>
            <AlertDescription>
              Please connect your account to deploy contracts.
            </AlertDescription>
          </Alert>
        )}
    </div>
  );

  if (noCard) {
    return (
      <div className='space-y-6'>
        <div>
          <h2 className='text-2xl font-medium mb-2'>Contract Deployment</h2>
        </div>
        {content}
      </div>
    );
  }

  return (
    <Card className='bg-gray-200/70 dark:bg-white/5 border-none shadow-none'>
      <CardHeader className='pb-4'>
        <CardTitle className='text-2xl font-medium'>Contract Deployment</CardTitle>
      </CardHeader>
      <CardContent className='space-y-6'>
        {content}
      </CardContent>
    </Card>
  );
}
