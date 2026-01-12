import { ReactNode, useState } from 'react';
import { txToaster, useTypink, checkBalanceSufficiency } from 'typink';
import { Button } from '@/components/ui/button';
import { appendTxLog } from '@/lib/tx/tx-log';

export interface MapAccountButtonProps {
  onSuccess?: () => void;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  children?: ReactNode;
  refresh?: () => Promise<void>;
}

export default function MapAccountButton({
  onSuccess,
  size = 'sm',
  variant = 'default',
  children = 'Map Account',
}: MapAccountButtonProps) {
  const { client, connectedAccount } = useTypink();
  const [isLoading, setIsLoading] = useState(false);

  const handleMapAccount = async () => {
    const toaster = txToaster();
    try {
      setIsLoading(true);

      if (!client || !connectedAccount) {
        throw new Error('No connected account or client available');
      }

      await checkBalanceSufficiency(client, connectedAccount.address);

      let capturedTxHash: string | undefined;
      await client.tx.revive
        .mapAccount() // --
        .signAndSend(connectedAccount.address, (progress) => {
          toaster.onTxProgress(progress);
          try {
            const h = (progress as any)?.txHash?.toHex?.() || (progress as any)?.txHash?.toString?.() || '';
            if (h && !capturedTxHash) capturedTxHash = String(h);
          } catch {
            // ignore
          }

          if (progress.status.type === 'BestChainBlockIncluded' || progress.status.type === 'Finalized') {
            onSuccess?.();
          }
        })
        .untilFinalized();

      if (capturedTxHash) {
        appendTxLog({
          address: connectedAccount.address,
          action: 'account_map',
          txHash: capturedTxHash,
          network: 'assethub-westend',
        });
      }
    } catch (error: any) {
      console.error('Error mapping account:', error);
      toaster.onTxError(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button size={size} variant={variant} disabled={!connectedAccount || isLoading} onClick={handleMapAccount}>
      {isLoading ? 'Mapping...' : children}
    </Button>
  );
}
