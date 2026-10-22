import { defineConfig, type Plugin } from 'vitest/config';
import { loadEnv } from 'vite';
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

/**
 * Serves the Resend email relay (`server/sendEmail.ts`) at /api/send-email during `npm run dev`,
 * the same path the Vercel function uses in production. Reads RESEND_API_KEY etc. from `.env`.
 */
function emailRelay(env: Record<string, string>): Plugin {
  return {
    name: 'email-relay',
    configureServer(server) {
      // Say at startup whether real email is set up, and what is missing if not: a half-configured
      // .env otherwise fails silently (the outbox still fills, nothing arrives).
      const log = server.config.logger;
      const on = env.VITE_EMAIL_DELIVERY === 'resend';
      const missing = ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_URL'].filter((k) => !env[k]?.trim());
      if (on && missing.length) log.warn(`[email] VITE_EMAIL_DELIVERY=resend but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set in .env: no email will be sent.`);
      else if (on) log.info(`[email] Sending through Resend from ${env.EMAIL_FROM}${env.EMAIL_REDIRECT_TO?.trim() ? `, all redirected to ${env.EMAIL_REDIRECT_TO.trim()}` : ''}.`);
      else if (!missing.length) log.warn('[email] RESEND_API_KEY etc. are set but VITE_EMAIL_DELIVERY is not "resend": the app only fills the outbox and sends nothing.');
      server.middlewares.use('/api/send-email', async (req, res) => {
        try {
          const { handleSendEmail } = await import('./server/sendEmail');
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const request = new Request('http://localhost/api/send-email', {
            method: req.method,
            headers: { 'content-type': req.headers['content-type'] ?? '' },
            body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
          });
          const response = await handleSendEmail(request, env);
          const body = await response.text();
          // One line per email in the terminal: sent, or Resend's reason for refusing it.
          const result = JSON.parse(body || '{}') as { id?: string; error?: string };
          if (response.ok) log.info(`[email] Sent (Resend id ${result.id}).`, { timestamp: true });
          else log.warn(`[email] Not sent (${response.status}): ${result.error ?? 'unknown error'}`, { timestamp: true });
          res.statusCode = response.status;
          res.setHeader('content-type', response.headers.get('content-type') ?? 'application/json');
          res.end(body);
        } catch (e) {
          log.warn(`[email] Not sent: ${e instanceof Error ? e.message : 'email relay failed'}`, { timestamp: true });
          // Never let one failed email crash the dev server.
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Email relay failed.' }));
        }
      });
    },
  };
}

export default defineConfig(async ({ mode }) => {
  const mobile = mode === 'mobile';
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [...(mobile ? [] : await reticlePlugins()), react(), tailwindcss(), emailRelay(env), ...(mobile ? [inlineHeadAssets(), viteSingleFile()] : [])],
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
