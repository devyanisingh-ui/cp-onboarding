/**
 * CP contact verification: the CP proves that the email and mobile on their record reach them.
 *
 * It starts by itself when an agreement goes to Legal and runs alongside Legal's review; it never
 * holds the agreement up. A BD Executive can also send or resend it by hand. The CP (no app account;
 * the emailed link is their credential) opens /verify/<token>:
 *  1. "Confirm my email": opening the link from their inbox proves the email reaches them.
 *  2. A 6-digit code is sent to their mobile and they type it in: proves the mobile reaches them.
 *
 * No SMS provider is connected yet, so codes go to an SMS outbox (Admin → System), the same way
 * emails go to the email outbox when Resend is not set up. Only a hash of each code is kept.
 */
import type { Agreement, ContactCheck, ContactVerification, ContactVerificationView, CpMaster, User } from '@/types';
import { formatDateTime } from '@/lib/dates';
import { sha256Hex } from '@/lib/docExport';
import { ApiError, conflict, invalid, notFound } from '../errors';
import { nextId } from '../db';
import { sendExternalEmail } from '../notificationChannels';
import { assertCan, audit, commit, ctx, delay, getDb, notify, now } from './core';
import { cpFullAccess } from './dto';

export const LINK_DAYS = 7;
export const OTP_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 30;
export const OTP_MAX_PER_HOUR = 5;

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomCode(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0]! % 1_000_000).padStart(6, '0');
}

const hashCode = (token: string, code: string) => sha256Hex(new TextEncoder().encode(`${token}:${code}`));
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

/** Shown to the CP: enough to recognise their own email and mobile, not enough to read them out. */
export function maskEmail(email: string): string {
  const [name = '', domain = ''] = email.split('@');
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}
export function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  return `${'•'.repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}`;
}

function checkOf(v: ContactVerification | undefined, channel: 'email' | 'mobile', current: string): ContactCheck {
  const done = channel === 'email' ? v?.emailVerified : v?.mobileVerified;
  if (done && done.value.toLowerCase() === current.trim().toLowerCase()) return 'verified';
  return v?.linkSentAt ? 'pending' : 'not_started';
}

/** The CP's verification status for screens (never the token or the code). */
export function contactView(cp: CpMaster): ContactVerificationView {
  const v = cp.contactVerification;
  const email = checkOf(v, 'email', cp.email);
  const mobile = checkOf(v, 'mobile', cp.mobile);
  return {
    email,
    mobile,
    emailVerifiedAt: email === 'verified' ? v?.emailVerified?.at : undefined,
    mobileVerifiedAt: mobile === 'verified' ? v?.mobileVerified?.at : undefined,
    linkSentAt: v?.linkSentAt,
    linkExpired: !!v?.linkExpiresAt && v.linkExpiresAt < now(),
  };
}

export function isContactVerified(cp: CpMaster): boolean {
  const v = contactView(cp);
  return v.email === 'verified' && v.mobile === 'verified';
}

/**
 * Emails the CP a new verification link (the old one stops working). Does nothing if both email
 * and mobile are already verified for the details on record.
 */
export function startContactVerification(cp: CpMaster, by: User | 'system', reason: string): { link: string } | null {
  if (isContactVerified(cp)) return null;
  const v = (cp.contactVerification ??= {});
  v.token = randomToken();
  v.linkSentAt = now();
  v.linkExpiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
  v.sentById = by === 'system' ? 'system' : by.id;
  v.reason = reason;
  v.otp = undefined;
  const link = `/verify/${v.token}`;
  sendExternalEmail(cp.email, {
    title: 'Please verify your contact details for Apeejay',
    body: `Dear ${cp.contactPerson || cp.legalName},\n\nTo complete your Channel Partner onboarding with Apeejay, please confirm that this email address and your mobile number reach you. Open the link, confirm your email, then enter the code we send to your mobile.\n\nThe link is personal to you and works for ${LINK_DAYS} days. Do not forward it.`,
    link,
    kind: 'verification',
  });
  audit(by === 'system' ? 'system' : by, 'send', 'cp', cp.id, `Sent ${cp.legalName} a contact verification link (${maskEmail(cp.email)}) — ${reason}`);
  return { link };
}

/** Called when an agreement goes to Legal: verification runs alongside Legal's review. */
export function startForAgreement(a: Agreement, by: User | 'system'): void {
  const cp = getDb().cps.find((c) => c.id === a.cpId);
  if (cp) startContactVerification(cp, by, `agreement ${a.id} sent to Legal`);
}

// ---------------- BD Executive ----------------

/** Sends (or resends) the CP their verification link. Returns the link. */
export async function sendContactVerification(cpId: string): Promise<{ link: string }> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'kyc.upload');
  const cp = getDb().cps.find((c) => c.id === cpId);
  if (!cp || !cpFullAccess(user, cpId)) throw notFound('Channel Partner');
  if (isContactVerified(cp)) throw conflict('This CP’s email and mobile are already verified.');
  const res = startContactVerification(cp, user, 'sent by hand')!;
  commit();
  return res;
}

// ---------------- CP (public link) ----------------

function findByToken(token: string) {
  const cp = token ? getDb().cps.find((c) => c.contactVerification?.token === token) : undefined;
  if (!cp) throw new ApiError(404, 'This verification link is not valid. Ask your Apeejay contact to send you a new one.');
  const v = cp.contactVerification!;
  return { cp, v, expired: !!v.linkExpiresAt && v.linkExpiresAt < now() };
}

const cpActor = (cp: CpMaster) => ({ id: 'cp:verify', name: `${cp.legalName} (CP, verification link)` });

export interface ContactVerifySession {
  cpName: string;
  contactPerson: string;
  emailMasked: string;
  mobileMasked: string;
  email: ContactCheck;
  mobile: ContactCheck;
  expired: boolean;
  /** A code was sent and is still valid. */
  codeSent: boolean;
  /** Seconds until another code may be sent (0 = now). */
  resendIn: number;
}

export async function getVerifySession(token: string): Promise<ContactVerifySession> {
  await delay();
  const { cp, v, expired } = findByToken(token);
  const view = contactView(cp);
  const last = v.otp?.sentAt ? Date.parse(v.otp.sentAt) : 0;
  return {
    cpName: cp.legalName,
    contactPerson: cp.contactPerson,
    emailMasked: maskEmail(cp.email),
    mobileMasked: maskMobile(cp.mobile),
    email: view.email,
    mobile: view.mobile,
    expired,
    codeSent: !!v.otp && v.otp.expiresAt > now(),
    resendIn: Math.max(0, Math.ceil((last + OTP_RESEND_SECONDS * 1000 - Date.now()) / 1000)),
  };
}

function checkOpen(expired: boolean) {
  if (expired) throw conflict('This link has expired. Ask your Apeejay contact to send a new one.');
}

/** Both done: tell the people working on this CP. */
function onBothVerified(cp: CpMaster) {
  if (!isContactVerified(cp)) return;
  // The link stays readable, so the CP sees the confirmation (and again if they reopen it);
  // every action on it is a no-op once both are verified, and it expires as usual.
  const d = getDb();
  const owners = d.agreements.filter((a) => a.cpId === cp.id).map((a) => a.ownerId);
  const reviewing = d.tasks.filter((t) => t.cpId === cp.id && t.type === 'gate1_approval' && t.status === 'open').map((t) => t.assigneeId);
  notify([...owners, ...reviewing, cp.createdById], { title: 'CP contact details verified', body: `${cp.legalName} confirmed their email and mobile.`, link: `/cps/${cp.id}` });
  audit(cpActor(cp), 'verify', 'cp', cp.id, `${cp.legalName} verified their email and mobile`);
}

export async function confirmEmail(token: string): Promise<void> {
  await delay('write');
  const { cp, v, expired } = findByToken(token);
  checkOpen(expired);
  if (contactView(cp).email === 'verified') return;
  v.emailVerified = { value: cp.email, at: now() };
  audit(cpActor(cp), 'verify', 'cp', cp.id, `${cp.legalName} confirmed their email (${maskEmail(cp.email)})`);
  onBothVerified(cp);
  commit();
}

/** Sends a new 6-digit code to the CP's mobile (the previous one stops working). */
export async function sendMobileCode(token: string): Promise<{ sentTo: string }> {
  await delay('write');
  const { cp, v, expired } = findByToken(token);
  checkOpen(expired);
  if (contactView(cp).mobile === 'verified') throw conflict('Your mobile number is already verified.');
  const nowMs = Date.now();
  if (v.otp && nowMs - Date.parse(v.otp.sentAt) < OTP_RESEND_SECONDS * 1000) throw conflict(`Please wait ${OTP_RESEND_SECONDS} seconds before asking for another code.`);
  v.otpSends = (v.otpSends ?? []).filter((t) => nowMs - Date.parse(t) < 3_600_000);
  if (v.otpSends.length >= OTP_MAX_PER_HOUR) throw conflict('Too many codes sent. Try again in an hour, or ask your Apeejay contact for help.');
  const code = randomCode();
  v.otp = { codeHash: await hashCode(v.token!, code), sentAt: now(), expiresAt: minutesFromNow(OTP_MINUTES), attempts: 0 };
  v.otpSends.push(v.otp.sentAt);
  const d = getDb();
  (d.sms ??= []).push({
    id: nextId('sms', 'S-'),
    to: cp.mobile,
    kind: 'otp',
    body: `${code} is your Apeejay CP verification code. It is valid for ${OTP_MINUTES} minutes. Do not share it with anyone.`,
    sentAt: now(),
  });
  audit(cpActor(cp), 'send', 'cp', cp.id, `Verification code sent to ${maskMobile(cp.mobile)}`);
  commit();
  return { sentTo: maskMobile(cp.mobile) };
}

export async function verifyMobileCode(token: string, code: string): Promise<void> {
  await delay('write');
  const { cp, v, expired } = findByToken(token);
  checkOpen(expired);
  if (contactView(cp).mobile === 'verified') return;
  const entered = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(entered)) throw invalid('Enter the 6-digit code from the text message.', { code: '6 digits' });
  const otp = v.otp;
  if (!otp || otp.expiresAt < now()) throw conflict('This code has expired. Ask for a new code.');
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw conflict('Too many wrong codes. Ask for a new code.');
  if ((await hashCode(v.token!, entered)) !== otp.codeHash) {
    otp.attempts++;
    // The failed attempt must count, so save before refusing.
    commit();
    const left = OTP_MAX_ATTEMPTS - otp.attempts;
    throw invalid(left > 0 ? `That code is not right. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong codes. Ask for a new code.', { code: 'Wrong code' });
  }
  v.otp = undefined;
  v.mobileVerified = { value: cp.mobile, at: now() };
  audit(cpActor(cp), 'verify', 'cp', cp.id, `${cp.legalName} verified their mobile (${maskMobile(cp.mobile)})`);
  onBothVerified(cp);
  commit();
}

/** For the CP detail and agreement screens: "Link sent 28 Oct 2026, 10:15". */
export function linkSentText(view: ContactVerificationView): string | undefined {
  return view.linkSentAt ? `Link sent ${formatDateTime(view.linkSentAt)}${view.linkExpired ? ' (expired)' : ''}` : undefined;
}
