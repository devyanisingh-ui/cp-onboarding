import { withReticle } from '@reticlehq/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev-only Next.js badge sits over the sidebar footer; the terminal reports build errors anyway.
  devIndicators: false,
  // The browser-side email switch. The older VITE_ names from before the move to Next.js still work.
  env: {
    NEXT_PUBLIC_EMAIL_DELIVERY: process.env.NEXT_PUBLIC_EMAIL_DELIVERY ?? process.env.VITE_EMAIL_DELIVERY ?? '',
    NEXT_PUBLIC_EMAIL_RELAY_URL: process.env.NEXT_PUBLIC_EMAIL_RELAY_URL ?? process.env.VITE_EMAIL_RELAY_URL ?? '',
  },
};

export default withReticle(nextConfig);
