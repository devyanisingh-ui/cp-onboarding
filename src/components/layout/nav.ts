import { BarChart3, Building2, Clock, FileText, FileUp, Globe, Home, Inbox, IndianRupee, List, Route, ScrollText, Server, Settings2, Users, UsersRound } from 'lucide-react';
import type { ComponentType } from 'react';
import type { User } from '@/types';
import { can, type Capability } from '@/lib/permissions';

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

/** Admin console sections (Admin layout tabs and the sub-header's breadcrumb labels). */
export const ADMIN_SECTIONS: { to: string; label: string; icon: ComponentType<{ className?: string }>; cap: Capability }[] = [
  { to: 'institutions', label: 'Institutions & locations', icon: Building2, cap: 'config.view' },
  { to: 'templates', label: 'Templates', icon: FileText, cap: 'template.view' },
  { to: 'rate-cards', label: 'Rate cards', icon: IndianRupee, cap: 'ratecard.view' },
  { to: 'users', label: 'Users & roles', icon: UsersRound, cap: 'config.view' },
  { to: 'routing', label: 'Routing rules', icon: Route, cap: 'config.view' },
  { to: 'slas', label: 'SLAs', icon: Clock, cap: 'config.view' },
  { to: 'lists', label: 'Master lists', icon: List, cap: 'config.view' },
  { to: 'domains', label: 'Allowed domains', icon: Globe, cap: 'config.view' },
  { to: 'legacy', label: 'Legacy import', icon: FileUp, cap: 'legacy.import' },
  { to: 'system', label: 'System & notifications', icon: Server, cap: 'config.view' },
];
