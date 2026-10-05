import type { ReactNode } from 'react';
import { BrowserRouter, HashRouter, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { SessionProvider, useSession } from '@/context/SessionContext';
import { ROUTER_MODE } from '@/lib/runtime';
import { ButtonLink, EmptyState, ToastProvider } from '@/components/ui';
import type { Capability } from '@/lib/permissions';
import { AppShell } from '@/components/layout/AppShell';
import { SignIn } from '@/pages/SignIn';
import { Home } from '@/pages/Home';
import { Tasks } from '@/pages/Tasks';
import { CpList } from '@/pages/CpList';
import { CpDetail } from '@/pages/CpDetail';
import { Wizard } from '@/pages/Wizard';
import { DraftPreview } from '@/pages/DraftPreview';
import { DeviationPanel } from '@/pages/DeviationPanel';
import { AgreementDetail } from '@/pages/AgreementDetail';
import { AgreementsList } from '@/pages/AgreementsList';
import { SignedUpload } from '@/pages/SignedUpload';
import { Verification } from '@/pages/Verification';
import { Renewal } from '@/pages/Renewal';
import { Termination } from '@/pages/Termination';
import { ReportView, Reports } from '@/pages/Reports';
import { AuditLog } from '@/pages/AuditLog';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import { Institutions } from '@/pages/admin/Institutions';
import { RateCards } from '@/pages/admin/RateCards';
import { Templates } from '@/pages/admin/Templates';
import { TemplateEditor } from '@/pages/admin/TemplateEditor';
import { Domains, Lists, Routing, Slas, Users } from '@/pages/admin/Config';
import { Legacy } from '@/pages/admin/Legacy';
import { System } from '@/pages/admin/System';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const location = useLocation();
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** UI guard; the mock API enforces the same rules on every call. */
function RequireCap({ cap, children }: { cap: Capability; children: ReactNode }) {
  const { can } = useSession();
  if (!can(cap)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <EmptyState
      icon={<Compass />}
      title="Page not found"
      description="The link may be wrong, or the page has moved."
      action={<ButtonLink to="/">Go to Home</ButtonLink>}
    />
  );
}

function SignInRoute() {
  const { user } = useSession();
  return user ? <Navigate to="/" replace /> : <SignIn />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/signin" element={<SignInRoute />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="cps" element={<CpList />} />
        <Route path="cps/:id" element={<CpDetail />} />
        <Route path="agreements" element={<AgreementsList />} />
        <Route path="agreements/new" element={<RequireCap cap="agreement.create"><Wizard /></RequireCap>} />
        <Route path="agreements/:id" element={<AgreementDetail />} />
        <Route path="agreements/:id/edit" element={<RequireCap cap="agreement.edit"><Wizard /></RequireCap>} />
        <Route path="agreements/:id/preview" element={<DraftPreview />} />
        <Route path="agreements/:id/deviation" element={<DeviationPanel />} />
        <Route path="agreements/:id/upload" element={<SignedUpload />} />
        <Route path="agreements/:id/verify" element={<RequireCap cap="gate2.verify"><Verification /></RequireCap>} />
        <Route path="agreements/:id/renewal" element={<Renewal />} />
        <Route path="agreements/:id/terminate" element={<Termination />} />
        <Route path="reports" element={<RequireCap cap="reports.view"><Reports /></RequireCap>} />
        <Route path="reports/:reportId" element={<RequireCap cap="reports.view"><ReportView /></RequireCap>} />
        <Route path="audit" element={<RequireCap cap="audit.view"><AuditLog /></RequireCap>} />
        <Route path="admin/templates/:id" element={<RequireCap cap="template.view"><TemplateEditor /></RequireCap>} />
        <Route path="admin" element={<AdminLayout />}>
          <Route path="institutions" element={<Institutions />} />
          <Route path="templates" element={<Templates />} />
          <Route path="rate-cards" element={<RateCards />} />
          <Route path="users" element={<Users />} />
          <Route path="routing" element={<Routing />} />
          <Route path="slas" element={<Slas />} />
          <Route path="lists" element={<Lists />} />
          <Route path="domains" element={<Domains />} />
          <Route path="legacy" element={<Legacy />} />
          <Route path="system" element={<System />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

// See lib/runtime.ts: real paths on a web server, #/paths from a file, in-memory in preview panes.
const Router = ROUTER_MODE === 'memory' ? MemoryRouter : ROUTER_MODE === 'hash' ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <SessionProvider>
          <AppRoutes />
        </SessionProvider>
      </ToastProvider>
    </Router>
  );
}
