'use client';

import { AccountSelection } from '@/components/shared/account-selection';
import { WalletSelection } from '@/components/shared/wallet-selection';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { AccountAvatar } from '@/components/shared/account-avatar';
import { useTypink } from 'typink';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarNav } from './sidebar-nav-provider';

export function AppBar() {
  const { accounts, connectedAccount } = useTypink();
  const { isMobileOpen, setIsMobileOpen, collapsed } = useSidebarNav();

  const handleMenuToggle = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-[var(--sap-blue)] border-b border-[var(--sap-border)] shadow-sm">
      <div className={cn(
        'flex h-full items-center justify-between transition-all duration-300',
        collapsed ? 'lg:pl-20 px-4' : 'lg:pl-72 px-4' // More padding when collapsed (80px = 64px sidebar + 16px gap)
      )}>
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-3">
          {/* Mobile Menu Button */}
          <button
            onClick={handleMenuToggle}
            className="lg:hidden p-2 rounded-sm text-white hover:bg-white/10 transition-colors"
            aria-label="Toggle menu"
          >
            {isMobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>

          <Link href="/" className="flex items-center gap-2">
            <span className="text-white font-semibold text-lg">Fides Product Passports</span>
          </Link>
        </div>

        {/* Right: Account Info + Theme Toggle */}
        <div className="flex items-center gap-3">
          {connectedAccount ? (
            <div className="flex items-center gap-2">
              <AccountAvatar account={connectedAccount} size={24} />
              <AccountSelection />
            </div>
          ) : accounts.length > 0 ? (
            <AccountSelection />
          ) : (
            <WalletSelection />
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

