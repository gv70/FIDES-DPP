'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface SidebarNavContextType {
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarNavContext = createContext<SidebarNavContextType | undefined>(undefined);

export function SidebarNavProvider({ children }: { children: ReactNode }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <SidebarNavContext.Provider value={{ isMobileOpen, setIsMobileOpen, collapsed, setCollapsed }}>
      {children}
    </SidebarNavContext.Provider>
  );
}

export function useSidebarNav() {
  const context = useContext(SidebarNavContext);
  if (!context) {
    throw new Error('useSidebarNav must be used within SidebarNavProvider');
  }
  return context;
}



