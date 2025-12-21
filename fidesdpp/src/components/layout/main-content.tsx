'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useSidebarNav } from './sidebar-nav-provider';

interface MainContentProps {
  children: ReactNode;
  className?: string;
}

export function MainContent({ children, className }: MainContentProps) {
  const { collapsed } = useSidebarNav();
  
  return (
    <main
      className={cn(
        'flex-1 overflow-y-auto overflow-x-hidden',
        'mt-16 mb-8', // Offset for AppBar (64px) and StatusBar (32px)
        'transition-all duration-300',
        'relative z-20', // Ensure content is above sidebar (z-10)
        collapsed ? 'lg:ml-16 lg:pl-4' : 'lg:ml-64 lg:pl-6', // Offset for Sidebar + padding
        'px-4', // Base padding for mobile
        'pt-6', // Top padding to separate from header
        'min-h-0', // Important for flex children to respect overflow
        'box-border', // Include padding in width calculation
        className
      )}
    >
      <div className="w-full max-w-full box-border">
        {children}
      </div>
    </main>
  );
}



