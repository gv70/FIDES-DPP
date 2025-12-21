'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useTypink, txToaster } from 'typink';
import { useContractAddress } from '@/hooks/use-contract-address';
import { Loader2, AlertCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useMemo } from 'react';
import { Contract } from 'dedot/contracts';
import { ContractId, deployments } from '@/contracts/deployments';
import type { DppContractContractApi } from '@/contracts/types/dpp-contract';

interface PassportRevokeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId?: string;
  onSuccess?: () => void;
}

export function PassportRevokeModal({ open, onOpenChange, tokenId: initialTokenId, onSuccess }: PassportRevokeModalProps) {
  const { connectedAccount, client } = useTypink();
  const { activeAddress: contractAddress } = useContractAddress();
  const [isLoading, setIsLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>('');
  const [confirmed, setConfirmed] = useState(false);
  const [tokenId, setTokenId] = useState(initialTokenId || '');

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
      console.error('[PassportRevokeModal] Failed to create contract instance:', e);
      return null;
    }
  }, [client, contractAddress]);

  // Reset when modal opens/closes or initialTokenId changes
  useEffect(() => {
    if (open) {
      setTokenId(initialTokenId || '');
      setReason('');
      setConfirmed(false);
      setError('');
    }
  }, [open, initialTokenId]);

  const handleRevoke = async () => {
    if (!tokenId) {
      setError('Please enter a token ID');
      return;
    }

    if (!connectedAccount) {
      setError('Account not connected');
      return;
    }

    if (!confirmed) {
      setError('Please confirm revocation');
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

    try {
      const tx = (contract as any).tx.revokePassport(
        BigInt(tokenId),
        reason || undefined,
      );

      await tx
        .signAndSend(connectedAccount.address, (progress: any) => {
          toaster.onTxProgress(progress);
        })
        .untilFinalized();

      toast.success(`Passport ${tokenId} revoked successfully`);
      onOpenChange(false);
      setReason('');
      setConfirmed(false);
      onSuccess?.();
    } catch (e: any) {
      const errorMessage = e.message || 'Failed to revoke passport';
      setError(errorMessage);
      toast.error(errorMessage);
      toaster.onTxError(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600" />
            Revoke Passport
          </DialogTitle>
          <DialogDescription>
            This action will permanently revoke the passport on-chain. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="revoke-token-id">Token ID *</Label>
            <Input
              id="revoke-token-id"
              placeholder="Enter token ID to revoke"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="revoke-reason">Reason (Optional)</Label>
            <Textarea
              id="revoke-reason"
              placeholder="Enter reason for revocation..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">
                I confirm that I want to revoke passport {tokenId ? `#${tokenId}` : ''}. This action cannot be undone.
              </span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRevoke}
            disabled={isLoading || !confirmed || !connectedAccount || !tokenId}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Revoking...
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 mr-2" />
                Revoke Passport
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
