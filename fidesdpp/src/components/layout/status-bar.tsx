'use client';

import { useBlockInfo, useTypink, usePolkadotClient, useBalances, formatBalance } from 'typink';
import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarNav } from './sidebar-nav-provider';

export function StatusBar() {
  const { network, connectedAccount } = useTypink();
  const { best, finalized } = useBlockInfo();
  const { status } = usePolkadotClient();
  const { collapsed } = useSidebarNav();
  
  const addresses = useMemo(() => (connectedAccount ? [connectedAccount.address] : []), [connectedAccount]);
  const balances = useBalances(addresses);
  
  const balance = connectedAccount ? balances[connectedAccount.address] : null;
  const formattedBalance = balance ? formatBalance(balance.free, network) : '0';

  const getConnectionStatus = () => {
    switch (status) {
      case 'Connected':
        return { color: 'bg-green-500', label: 'Connected', icon: '✓' };
      case 'Connecting':
        return { color: 'bg-yellow-500', label: 'Connecting', icon: '⟳' };
      case 'Error':
        return { color: 'bg-red-500', label: 'Error', icon: '✗' };
      default:
        return { color: 'bg-gray-400', label: 'Not Connected', icon: '○' };
    }
  };

  const connectionStatus = getConnectionStatus();

  return (
    <footer className={cn(
      'fixed bottom-0 left-0 right-0 z-30 h-8 bg-[var(--sap-status-bg)] dark:bg-[var(--sap-status-bg)] border-t border-[var(--sap-border)] flex items-center px-4 transition-all duration-300',
      collapsed ? 'lg:pl-16' : 'lg:pl-64'
    )}>
      <div className="flex items-center gap-4 text-xs text-muted-foreground w-full">
        {/* Network Name */}
        <div className="flex items-center gap-2">
          <span className="font-medium">Network:</span>
          <span className="font-mono">{network.name || 'Unknown'}</span>
        </div>

        <div className="h-4 w-px bg-[var(--sap-border)]" />

        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', connectionStatus.color)} />
          <span>{connectionStatus.label}</span>
        </div>

        <div className="h-4 w-px bg-[var(--sap-border)]" />

        {/* Block Number (advanced) */}
        {best && (
          <>
            <div className="flex items-center gap-2">
              <span className="font-medium">Latest block:</span>
              <span className="font-mono">#{best.number?.toLocaleString() || 'N/A'}</span>
            </div>
            <div className="h-4 w-px bg-[var(--sap-border)]" />
          </>
        )}

        {/* Account Balance */}
        {connectedAccount && (
          <div className="flex items-center gap-2">
            <span className="font-medium">Account balance:</span>
            <span className="font-mono">{formattedBalance}</span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Network Type */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/70">
            {network.type === 'testnet' ? 'Testnet' : network.type === 'devnet' ? 'Devnet' : 'Mainnet'}
          </span>
        </div>
      </div>
    </footer>
  );
}


