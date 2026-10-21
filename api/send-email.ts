import { handleSendEmail } from '../server/sendEmail';

/** Vercel function: POST /api/send-email. Configure the env vars in the Vercel project settings. */
export function POST(request: Request): Promise<Response> {
  return handleSendEmail(request, process.env);
}
