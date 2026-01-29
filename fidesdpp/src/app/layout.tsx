import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';

export const metadata: Metadata = {
  title: 'Fides Product Passports',
  description: 'Create and share product passports customers can verify in seconds',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider attribute='class'>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
