'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTypink, txToaster } from 'typink';
import { useContractAddress } from '@/hooks/use-contract-address';
import { AlertCircle, ArrowRightLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Contract } from 'dedot/contracts';
import { ContractId, deployments } from '@/contracts/deployments';
import type { DppContractContractApi } from '@/contracts/types/dpp-contract';
import { decodeAddress } from '@polkadot/util-crypto';
import { keccakAsU8a } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { appendTxLog } from '@/lib/tx/tx-log';
import { usePilotContext } from '@/hooks/use-pilot-context';
import { PassportTokenLookup } from '@/components/shared/passport-token-lookup';

interface PassportTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId?: string;
  onSuccess?: () => void;
}

export function PassportTransferModal({ open, onOpenChange, tokenId: initialTokenId, onSuccess }: PassportTransferModalProps) {
  const { connectedAccount, client } = useTypink();
  const { activeAddress: contractAddress } = useContractAddress();
  const { pilotId } = usePilotContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [tokenId, setTokenId] = useState(initialTokenId || '');
  const [toAddress, setToAddress] = useState('');

  const contract = useMemo(() => {
    if (!client) return null;
    if (!contractAddress) return null;
    if (!contractAddress.startsWith('0x')) return null;
    const deployment = deployments.find(d => d.id === ContractId.DPP_CONTRACT);
    if (!deployment?.metadata) return null;
    try {
      return new Contract<DppContractContractApi>(
        client,
        deployment.metadata as any,
        contractAddress as `0x${string}`
      );
    } catch (e) {
      console.error('[PassportTransferModal] Failed to create contract instance:', e);
      return null;
    }
  }, [client, contractAddress]);

  useEffect(() => {
    if (!open) return;
    setTokenId(initialTokenId || '');
    setToAddress('');
    setError('');
  }, [open, initialTokenId]);

  const toH160 = (address: string): string => {
    const raw = address.trim();
    if (!raw) throw new Error('Address is required');

    if (/^0x[0-9a-fA-F]{40}$/.test(raw)) {
      return raw.toLowerCase();
    }

    const accountId32 = decodeAddress(raw);
    // Match the Asset Hub contracts `Address` (H160) mapping used by backend/CLI:
    // keccak256(AccountId32)[12..32]
    const hash = keccakAsU8a(accountId32, 256);
    const h160 = hash.slice(12);
    return u8aToHex(h160).toLowerCase();
  };

  const handleTransfer = async () => {
    if (!tokenId) {
      setError('Please enter a token ID');
      return;
    }
    if (!toAddress.trim()) {
      setError('Please enter a destination address');
      return;
    }
    if (!connectedAccount) {
      setError('Account not connected');
      return;
    }
    if (!contractAddress) {
      setError('Contract address not available');
      return;
    }
    if (!client) {
      setError('Client not available');
      return;
    }
    if (!contract) {
      setError('Contract not available');
      return;
    }

    setIsLoading(true);
    setError('');
    const toaster = txToaster();
    let capturedTxHash: string | undefined;

    try {
      const tokenIdBigInt = BigInt(tokenId);
      const destination = toH160(toAddress);
      const callerH160 = toH160(connectedAccount.address);

      try {
        const ownerResult = await (contract as any).query.ownerOf(tokenIdBigInt, {
          caller: connectedAccount.address,
        });
        const owner = ownerResult?.output ? String(ownerResult.output) : null;
        if (owner && owner.toLowerCase() !== callerH160.toLowerCase()) {
          throw new Error(`Only the token owner can transfer this passport. Owner: ${owner}`);
        }
      } catch (ownerCheckError: any) {
        throw new Error(ownerCheckError?.message || 'Ownership check failed');
      }

      const tx = (contract as any).tx.transfer(destination, tokenIdBigInt);

      await tx
        .signAndSend(connectedAccount.address, (progress: any) => {
          try {
            const h = progress?.txHash?.toHex?.() || progress?.txHash?.toString?.() || '';
            if (h && !capturedTxHash) capturedTxHash = String(h);
          } catch {
            // ignore
          }
          toaster.onTxProgress(progress);
        })
        .untilFinalized();

      if (capturedTxHash) {
        appendTxLog({
          address: connectedAccount.address,
          action: 'passport_transfer',
          tokenId,
          txHash: capturedTxHash,
          network: 'assethub-westend',
          pilotId: pilotId || undefined,
        });
      }
      toast.success(`Passport ${tokenId} transferred`);
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      const errorMessage = e.message || 'Failed to transfer passport';
      setError(errorMessage);
      toast.error(errorMessage);
      toaster.onTxError(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <ArrowRightLeft className='h-5 w-5' />
            Transfer Passport
          </DialogTitle>
          <DialogDescription>
            Transfer custody of a passport to another account. Only the current owner can transfer a token.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {error && (
            <Alert variant='destructive'>
              <AlertCircle className='h-4 w-4' />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <PassportTokenLookup
            defaultOpen
            disabled={isLoading}
            onResolvedTokenId={(foundTokenId) => {
              setError('');
              setTokenId(foundTokenId);
            }}
          />

          <details className='bg-white/40 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-4'>
            <summary className='cursor-pointer text-sm font-semibold'>Or enter passport ID (technical)</summary>
            <div className='mt-3 space-y-2'>
              <Label htmlFor='transfer-token-id' className='text-xs text-muted-foreground'>Passport ID *</Label>
              <Input
                id='transfer-token-id'
                placeholder='Enter passport ID'
                value={tokenId}
                onChange={(e) => setTokenId(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </details>

          <div className='space-y-2'>
            <Label htmlFor='transfer-to'>Destination Address *</Label>
            <Input
              id='transfer-to'
              placeholder='SS58 or 0x (H160)'
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              disabled={isLoading}
            />
            <p className='text-xs text-muted-foreground'>
              For contracts on Asset Hub, account addresses are mapped to H160. You can paste an SS58 address and the app will map it.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={isLoading || !connectedAccount || !tokenId || !toAddress.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                Transferring...
              </>
            ) : (
              <>
                <ArrowRightLeft className='h-4 w-4 mr-2' />
                Transfer
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
