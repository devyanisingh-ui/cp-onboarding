import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * Reticle (in-app verification, dev only) is optional: if `@reticlehq/vite-plugin` is not
 * installed — e.g. `npm install` was not re-run after pulling — the app still starts, without it.
 */
async function reticlePlugins(): Promise<Plugin[]> {
  try {
    const { reticle } = await import('@reticlehq/vite-plugin');
    return [reticle() as Plugin];
  } catch {
    console.warn('[vite] @reticlehq/vite-plugin is not installed; starting without Reticle. Run `npm install` to enable it.');
    return [];
  }
}

/**
 * `vite build --mode mobile` produces one self-contained HTML file (scripts, styles, fonts and
 * icon inlined) that runs when opened directly from a phone's storage — no server needed.
 */
function inlineHeadAssets(): Plugin {
  return {
    name: 'inline-head-assets',
    transformIndexHtml(html) {
      const icon = readFileSync(fileURLToPath(new URL('./public/icon.svg', import.meta.url)), 'utf8');
      const dataUri = `data:image/svg+xml,${encodeURIComponent(icon)}`;
      return html
        .replace(/<link rel="manifest"[^>]*>\s*/, '') // a web-app manifest can't load from a file
        .replace(/href="\.?\/icon\.svg"/g, `href="${dataUri}"`);
    },
  };
}

export default defineConfig(async ({ mode }) => {
  const mobile = mode === 'mobile';
  return {
    plugins: [...(mobile ? [] : await reticlePlugins()), react(), tailwindcss(), ...(mobile ? [inlineHeadAssets(), viteSingleFile()] : [])],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: mobile
      ? {
          outDir: 'dist-mobile',
          assetsInlineLimit: 100_000_000, // fonts become data URIs
          copyPublicDir: false,
          chunkSizeWarningLimit: 5000,
        }
      : undefined,
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
