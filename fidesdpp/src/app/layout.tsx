import './globals.css';
import { AppProvider } from '@/providers/app-provider';
import { Toaster } from '@/components/ui/sonner';
import type { Metadata } from 'next';
import { AppBar } from '@/components/layout/app-bar';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { StatusBar } from '@/components/layout/status-bar';
import { MainContent } from '@/components/layout/main-content';
import { ThemeProvider } from 'next-themes';
import { SidebarNavProvider } from '@/components/layout/sidebar-nav-provider';

export const metadata: Metadata = {
  title: 'Fides Product Passports',
  description: 'Create and share product passports customers can verify in seconds',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body>
        <ThemeProvider attribute='class'>
          <AppProvider>
            <SidebarNavProvider>
              <div className='flex h-screen overflow-hidden'>
                <SidebarNav />
                <div className='flex-1 flex flex-col min-w-0 overflow-hidden relative'>
                  <AppBar />
                  <MainContent>
                    {children}
                  </MainContent>
                  <StatusBar />
                </div>
              </div>
            </SidebarNavProvider>
            <Toaster />
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
