import { handleSendEmail, type RelayEnv } from '@/../server/sendEmail';

// Reads RESEND_API_KEY etc. on every request, never at build time.
export const dynamic = 'force-dynamic';

/** POST sends one outbox email through Resend; GET reports which settings the server can see. */
export async function POST(request: Request): Promise<Response> {
  const response = await handleSendEmail(request, process.env as RelayEnv);
  // One line per email in the server log: sent, or Resend's reason for refusing it.
  const result = (await response.clone().json().catch(() => ({}))) as { id?: string; error?: string };
  if (response.ok) console.info(`[email] Sent (Resend id ${result.id}).`);
  else console.warn(`[email] Not sent (${response.status}): ${result.error ?? 'unknown error'}`);
  return response;
}

export function GET(request: Request): Promise<Response> {
  return handleSendEmail(request, process.env as RelayEnv);
}
