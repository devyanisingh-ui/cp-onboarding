import { addDays, differenceInCalendarDays, format, isWeekend, parseISO } from 'date-fns';
import type { ISODate } from '@/types';

/** "Today" as an ISO date. Centralised so tests and the scheduler can reason about it. */
export function today(): ISODate {
  return toISODate(new Date());
}

export function toISODate(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd');
}

export function shiftDays(date: ISODate, days: number): ISODate {
  return toISODate(addDays(parseISO(date), days));
}

/** PRD §7: all dates print as DD Month YYYY. */
export function formatDate(date?: string | null): string {
  if (!date) return '—';
  return format(parseISO(date), 'dd MMMM yyyy');
}

export function formatShortDate(date?: string | null): string {
  if (!date) return '—';
  return format(parseISO(date), 'dd MMM yyyy');
}

export function formatDateTime(ts?: string | null): string {
  if (!ts) return '—';
  return format(parseISO(ts), 'dd MMM yyyy, HH:mm');
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

export function daysUntil(date: ISODate): number {
  return daysBetween(today(), date);
}

/** Adds working days (Mon–Fri). Public holidays would come from a master list in the real build. */
export function addWorkingDays(date: ISODate, days: number): ISODate {
  let d = parseISO(date);
  let left = days;
  while (left > 0) {
    d = addDays(d, 1);
    if (!isWeekend(d)) left--;
  }
  return toISODate(d);
}

export function relativeDays(date: ISODate): string {
  const n = daysUntil(date);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function timeAgo(ts: string): string {
  const diff = (Date.now() - parseISO(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return formatShortDate(ts);
}
