import { AppProvider } from '@/providers/app-provider';
import { Toaster } from '@/components/ui/sonner';
import { AppBar } from '@/components/layout/app-bar';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { StatusBar } from '@/components/layout/status-bar';
import { MainContent } from '@/components/layout/main-content';
import { SidebarNavProvider } from '@/components/layout/sidebar-nav-provider';

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppProvider>
      <SidebarNavProvider>
        <div className='flex h-screen overflow-hidden'>
          <SidebarNav />
          <div className='flex-1 flex flex-col min-w-0 overflow-hidden relative'>
            <AppBar />
            <MainContent>{children}</MainContent>
            <StatusBar />
          </div>
        </div>
      </SidebarNavProvider>
      <Toaster />
    </AppProvider>
  );
}

