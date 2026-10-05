import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Institution, User } from '@/types';
import { api } from '@/services/mockApi';
import { getDb, subscribe } from '@/services/db';
import { runScheduledJobs } from '@/services/api/scheduler';
import { onUnauthorized } from '@/hooks/useApi';
import { useIdleTimer } from '@/hooks/misc';
import { Button, Modal } from '@/components/ui';
import { can, type Capability } from '@/lib/permissions';

interface SessionValue {
  user: User | null;
  signIn: typeof api.auth.signIn;
  signOut: (reason?: 'manual' | 'timeout') => Promise<void>;
  switchPersona: (userId: string) => Promise<void>;
  can: (cap: Capability) => boolean;
  /** Header institution switcher: '' means all institutions in the user's scope. */
  institutionId: string;
  setInstitutionId: (id: string) => void;
  myInstitutions: Institution[];
  endedReason: 'timeout' | 'expired' | null;
}

const Ctx = createContext<SessionValue | null>(null);
const IDLE_MS = 30 * 60 * 1000;
const WARN_MS = 2 * 60 * 1000;
const INST_KEY = 'cp-onboarding-institution';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => api.auth.currentUser());
  const [institutionId, setInst] = useState<string>(() => {
    try {
      return localStorage.getItem(INST_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [warn, setWarn] = useState(false);
  const [endedReason, setEndedReason] = useState<SessionValue['endedReason']>(null);

  // Keep the user object fresh if Admin edits roles/institutions.
  useEffect(() => subscribe(() => setUser(api.auth.currentUser())), []);

  // Scheduler: on load and every minute (production: server-side cron).
  useEffect(() => {
    runScheduledJobs();
    const iv = setInterval(() => runScheduledJobs(), 60_000);
    return () => clearInterval(iv);
  }, []);

  const signIn = useCallback<SessionValue['signIn']>(async (provider, email) => {
    const u = await api.auth.signIn(provider, email);
    setUser(u);
    setEndedReason(null);
    return u;
  }, []);

  const signOut = useCallback(async (reason: 'manual' | 'timeout' = 'manual') => {
    await api.auth.signOut(reason);
    setWarn(false);
    setUser(null);
    setEndedReason(reason === 'timeout' ? 'timeout' : null);
  }, []);

  const switchPersona = useCallback(async (userId: string) => {
    const u = await api.auth.switchPersona(userId);
    setUser(u);
  }, []);

  useEffect(
    () =>
      onUnauthorized(() => {
        setUser(null);
        setEndedReason('expired');
      }),
    [],
  );

  useIdleTimer(IDLE_MS, WARN_MS, () => setWarn(true), () => void signOut('timeout'), !!user);

  const myInstitutions = useMemo(() => {
    if (!user) return [];
    return getDb().institutions.filter((i) => can(user, 'scope.all') || user.institutionIds.includes(i.id));
  }, [user]);

  const setInstitutionId = useCallback((id: string) => {
    setInst(id);
    try {
      localStorage.setItem(INST_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  // Drop a remembered institution the current user cannot see.
  const effectiveInst = myInstitutions.some((i) => i.id === institutionId) ? institutionId : '';

  const value: SessionValue = {
    user,
    signIn,
    signOut,
    switchPersona,
    can: (cap) => can(user, cap),
    institutionId: effectiveInst,
    setInstitutionId,
    myInstitutions,
    endedReason,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal
        open={warn && !!user}
        onClose={() => setWarn(false)}
        title="Still there?"
        description="For security, you’ll be signed out after 30 minutes of inactivity."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => void signOut('manual')}>
              Sign out
            </Button>
            <Button data-autofocus onClick={() => setWarn(false)}>
              Stay signed in
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Your session will end in about 2 minutes. Unsaved changes on this page may be lost.</p>
      </Modal>
    </Ctx.Provider>
  );
}

export function useSession(): SessionValue {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession must be used inside SessionProvider');
  return c;
}

export function useUser(): User {
  const { user } = useSession();
  if (!user) throw new Error('No signed-in user');
  return user;
}
