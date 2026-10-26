import { handleRpc } from '@/../server/platform/rpc';
import '@/../server/features';

// Database work happens per request, never at build time.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/rpc/<feature>.<function> with { "args": [...] }. See server/platform/rpc.ts. */
export async function POST(request: Request, { params }: { params: Promise<{ procedure: string }> }): Promise<Response> {
  return handleRpc((await params).procedure, request);
}
