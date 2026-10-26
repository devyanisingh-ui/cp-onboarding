import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { ReticleDev } from './reticle-dev';
import '@/index.css';

export const metadata: Metadata = {
  title: 'CP Onboarding · Apeejay',
  description: 'Create, approve, sign, verify and renew Channel Partner agreements for Apeejay institutions.',
  manifest: '/manifest.webmanifest',
  icons: { icon: { url: '/icon.svg', type: 'image/svg+xml' }, apple: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b6480',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Dev-only in-app verification (Reticle); nothing is rendered in production. */}
        {process.env.NODE_ENV === 'development' ? <ReticleDev /> : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
