import type { User } from '@/types';

/** Username is the part of the work email before the "@" (e.g. kavya.iyer). */
export function usernameOf(user: Pick<User, 'email'>): string {
  return user.email.split('@')[0]!.toLowerCase();
}
