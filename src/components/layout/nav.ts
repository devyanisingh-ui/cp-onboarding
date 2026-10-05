import { BarChart3, FileText, Home, Inbox, ScrollText, Settings2, Users } from 'lucide-react';
import type { ComponentType } from 'react';
import type { User } from '@/types';
import { can } from '@/lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

/** PRD §8 navigation, filtered by the user's roles. */
export function navFor(user: User): NavItem[] {
  const items: NavItem[] = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/tasks', label: 'My Tasks', icon: Inbox },
    { to: '/cps', label: 'CPs', icon: Users },
    { to: '/agreements', label: 'Agreements', icon: FileText },
  ];
  if (can(user, 'reports.view')) items.push({ to: '/reports', label: 'Reports', icon: BarChart3 });
  if (user.roles.includes('admin') || can(user, 'template.view') || can(user, 'config.view'))
    items.push({ to: '/admin', label: user.roles.includes('admin') ? 'Admin' : 'Templates & rates', icon: Settings2 });
  if (can(user, 'audit.view')) items.push({ to: '/audit', label: 'Audit log', icon: ScrollText });
  return items;
}
