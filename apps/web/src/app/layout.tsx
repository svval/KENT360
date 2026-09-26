import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { type ReactNode } from 'react';
import { AuthProvider } from '@/providers/auth-provider';
import { BrandingProvider } from '@/providers/branding-provider';
import { QueryProvider } from '@/providers/query-provider';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'KENT360 – Akıllı Belediye Operasyon Platformu',
    template: '%s · KENT360',
  },
  description:
    'KENT360 – Akıllı Belediye Operasyon ve Kent Zekâsı Platformu. Vatandaş talepleri, saha operasyonları ve mahalle analitiği tek platformda.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0B1F3A',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className={inter.variable}>
      <body>
        <QueryProvider>
          <AuthProvider>
            <BrandingProvider>{children}</BrandingProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
