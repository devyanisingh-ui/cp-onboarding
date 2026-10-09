import { useState } from 'react';
import { Pencil, Plus, Save, X } from 'lucide-react';
import type { MasterLists, Role, RoutingRule, SlaSettings, User } from '@/types';
import { api } from '@/services/mockApi';
import { useAction, useApi } from '@/hooks/useApi';
import { useSession } from '@/context/SessionContext';
import { useDocumentTitle } from '@/hooks/misc';
import { ROLE_LABELS } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, Checkbox, ErrorState, Field, IconButton, Input, Modal, PageSkeleton, Select, Table, TD, TH, Textarea, Toggle } from '@/components/ui';
import { ReadOnlyNote } from './AdminLayout';

type Lookups = Awaited<ReturnType<typeof api.config.lookups>>;
const ROLES = Object.keys(ROLE_LABELS) as Role[];

// ---------------- Users & roles ----------------

export function Users() {
  useDocumentTitle('Users & roles');
  const { can } = useSession();
  const { data, error, loading, reload } = useApi(() => api.config.lookups(), []);
  const [editing, setEditing] = useState<User | null>(null);
  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const d = data!;
  return (
    <div>
      <ReadOnlyNote />
      <Card>
        <CardHeader
          title="Users"
          description="A user can hold several roles. Region and institutions limit what they see."
          action={can('config.manage') ? <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing({ id: '', name: '', email: '', designation: '', roles: ['bd_exec'], regionId: d.regions[0]!.id, institutionIds: [], active: true })}>Add user</Button> : undefined}
        />
        {/* Phones: one card per user instead of a sideways-scrolling table. */}
        <ul className="divide-y divide-line/70 md:hidden" aria-label="Users">
          {d.users.map((u) => (
            <li key={u.id} className={cn('flex items-start gap-3 px-4 py-4', !u.active && 'opacity-60')}>
              <Avatar name={u.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{u.name}</p>
                <p className="truncate text-xs text-muted">{u.email}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {u.roles.map((r) => (
                    <Badge key={r} tone="accent">
                      {ROLE_LABELS[r]}
                    </Badge>
                  ))}
                  {!u.active && <Badge tone="dark">Inactive</Badge>}
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {u.institutionIds.map((i) => d.institutions.find((x) => x.id === i)?.shortCode).join(', ')}
                  {u.managerId && ` · reports to ${d.users.find((x) => x.id === u.managerId)?.name ?? '—'}`}
                </p>
              </div>
              {can('config.manage') && (
                <IconButton label={`Edit ${u.name}`} onClick={() => setEditing(structuredClone(u as User))}>
                  <Pencil className="size-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
        <Table caption="Users" className="hidden md:block">
          <thead>
            <tr>
              <TH>User</TH>
              <TH>Roles</TH>
              <TH className="hidden xl:table-cell">Institutions</TH>
              <TH className="hidden xl:table-cell">Manager</TH>
              <TH><span className="sr-only">Edit</span></TH>
            </tr>
          </thead>
          <tbody>
            {d.users.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} size="sm" />
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                      <p className="text-xs text-muted xl:hidden">{u.institutionIds.map((i) => d.institutions.find((x) => x.id === i)?.shortCode).join(', ')}</p>
                    </div>
                  </div>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r} tone="accent">
                        {ROLE_LABELS[r]}
                      </Badge>
                    ))}
                    {!u.active && <Badge tone="dark">Inactive</Badge>}
                  </div>
                </TD>
                <TD className="hidden text-ink-soft xl:table-cell">{u.institutionIds.map((i) => d.institutions.find((x) => x.id === i)?.shortCode).join(', ')}</TD>
                <TD className="hidden text-ink-soft xl:table-cell">{d.users.find((x) => x.id === u.managerId)?.name ?? '—'}</TD>
                <TD>
                  {can('config.manage') && (
                    <IconButton label={`Edit ${u.name}`} size="sm" onClick={() => setEditing(structuredClone(u as User))}>
                      <Pencil className="size-4" />
                    </IconButton>
                  )}
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {editing && <UserModal value={editing} lookups={d} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserModal({ value, lookups, onClose }: { value: User; lookups: Lookups; onClose: () => void }) {
  const [v, setV] = useState(value);
  const save = useAction(() => api.config.saveUser(v), { success: 'User saved', onSuccess: onClose });
  const fe = save.fieldErrors;
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  return (
    <Modal
      open
      onClose={onClose}
      title={value.id ? `Edit ${value.name}` : 'Add user'}
      description="Users sign in with SSO — no passwords are set here."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.loading} onClick={() => void save.run()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Work email" required error={fe.email}>
            <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          </Field>
          <Field label="Designation">
            <Input value={v.designation} onChange={(e) => setV({ ...v, designation: e.target.value })} />
          </Field>
          <Field label="Region">
            <Select value={v.regionId} onChange={(e) => setV({ ...v, regionId: e.target.value })}>
              {lookups.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Manager (for escalations)" className="sm:col-span-2">
            <Select value={v.managerId ?? ''} onChange={(e) => setV({ ...v, managerId: e.target.value || undefined })}>
              <option value="">None</option>
              {lookups.users.filter((u) => u.id !== v.id).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Roles {fe.roles && <span className="text-xs text-danger-700">— {fe.roles}</span>}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLES.map((r) => (
              <Checkbox key={r} label={ROLE_LABELS[r]} checked={v.roles.includes(r)} onChange={() => setV({ ...v, roles: toggle(v.roles, r) })} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Institutions {fe.institutionIds && <span className="text-xs text-danger-700">— {fe.institutionIds}</span>}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {lookups.institutions.map((i) => (
              <Checkbox key={i.id} label={`${i.shortCode} · ${i.legalName}`} checked={v.institutionIds.includes(i.id)} onChange={() => setV({ ...v, institutionIds: toggle(v.institutionIds, i.id) })} />
            ))}
          </div>
        </fieldset>
        <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Active" description="Inactive users cannot sign in." />
      </div>
    </Modal>
  );
}

// ---------------- Routing ----------------

export function Routing() {
  useDocumentTitle('Routing rules');
  const { can } = useSession();
  const lookups = useApi(() => api.config.lookups(), []);
  const { data, error, loading, reload } = useApi(() => api.config.listRouting(), []);
  const [rules, setRules] = useState<RoutingRule[] | null>(null);
  const save = useAction((r: RoutingRule[]) => api.config.saveRouting(r), { success: 'Routing saved', onSuccess: () => setRules(null) });
  if ((loading && !data) || !lookups.data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const list = rules ?? data!;
  const approvers = lookups.data.users.filter((u) => u.roles.includes('legal') || u.roles.includes('admin'));
  const edit = can('config.manage');
  const set = (i: number, p: Partial<RoutingRule>) => setRules(list.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div>
      <ReadOnlyNote />
      <Card>
        <CardHeader title="Legal approval routing" description="Standard agreements need no approval and go straight to signing. Agreements with approved deviations (non-standard) go to this Legal approver; overdue approvals escalate to the second contact." />
        {/* Phones: each rule as a small form instead of a wide table of dropdowns. */}
        <ul className="divide-y divide-line/70 md:hidden" aria-label="Routing rules">
          {list.map((r, i) => (
            <li key={r.id} className="space-y-3 px-4 py-4">
              <p className="text-sm font-semibold">
                {lookups.data!.institutions.find((x) => x.id === r.institutionId)?.shortCode}
              </p>
              <Field label="Legal approver">
                <Select disabled={!edit} value={r.approverId} onChange={(e) => set(i, { approverId: e.target.value })}>
                  {approvers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Escalate to">
                <Select disabled={!edit} value={r.escalateToId} onChange={(e) => set(i, { escalateToId: e.target.value })}>
                  {lookups.data!.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </li>
          ))}
        </ul>
        <Table caption="Routing rules" className="hidden md:block">
          <thead>
            <tr>
              <TH>Institution</TH>
              <TH>Legal approver</TH>
              <TH>Escalate to</TH>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={r.id}>
                <TD className="font-medium">{lookups.data!.institutions.find((x) => x.id === r.institutionId)?.shortCode}</TD>
                <TD>
                  <Select aria-label="Legal approver" disabled={!edit} value={r.approverId} onChange={(e) => set(i, { approverId: e.target.value })}>
                    {approvers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </TD>
                <TD>
                  <Select aria-label="Escalate to" disabled={!edit} value={r.escalateToId} onChange={(e) => set(i, { escalateToId: e.target.value })}>
                    {lookups.data!.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
        {edit && (
          <div className="flex justify-end gap-2 border-t border-line p-4">
            {rules && (
              <Button variant="secondary" onClick={() => setRules(null)}>
                Discard
              </Button>
            )}
            <Button icon={<Save className="size-4" />} disabled={!rules} loading={save.loading} onClick={() => void save.run(list)}>
              Save routing
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------- SLAs ----------------

const SLA_FIELDS: { key: keyof SlaSettings; label: string; hint: string }[] = [
  { key: 'gate1Days', label: 'Legal approval of non-standard agreements', hint: 'Working days' },
  { key: 'deviationDays', label: 'Deviation review (Legal)', hint: 'Working days' },
  { key: 'signingDays', label: 'Physical signing & upload (BD Executive)', hint: 'Working days' },
  { key: 'gate2Days', label: 'Gate 2 verification (Admin)', hint: 'Working days' },
  { key: 'versionApprovalDays', label: 'Rate card / template approval (Legal)', hint: 'Working days' },
  { key: 'graceDays', label: 'Escalation grace period', hint: 'Working days after the due date' },
  { key: 'renewalLeadDays', label: 'Renewal decision task', hint: 'Days before expiry' },
  { key: 'renewalEscalationDays', label: 'Renewal escalation to Admin', hint: 'Days before expiry' },
  { key: 'digestHourIst', label: 'Daily digest time', hint: 'Hour (IST, 0–23)' },
];

export function Slas() {
  useDocumentTitle('SLAs');
  const { can } = useSession();
  const { data, error, loading, reload } = useApi(() => api.config.settings(), []);
  const [v, setV] = useState<SlaSettings | null>(null);
  const save = useAction((s: SlaSettings) => api.config.saveSla(s), { success: 'SLAs saved', onSuccess: () => setV(null) });
  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const s = v ?? data!.sla;
  return (
    <div>
      <ReadOnlyNote />
      <Card>
        <CardHeader title="Service levels" description="A reminder goes out when a task falls due; it escalates to the owner’s manager after the grace period." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {SLA_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <Input type="number" min={0} disabled={!can('config.manage')} value={s[f.key]} onChange={(e) => setV({ ...s, [f.key]: Number(e.target.value) })} />
            </Field>
          ))}
        </CardBody>
        {can('config.manage') && (
          <div className="flex justify-end border-t border-line p-4">
            <Button icon={<Save className="size-4" />} disabled={!v} loading={save.loading} onClick={() => void save.run(s)}>
              Save SLAs
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------- Master lists ----------------

export function Lists() {
  useDocumentTitle('Master lists');
  const { can } = useSession();
  const { data, error, loading, reload } = useApi(() => api.config.settings(), []);
  const [v, setV] = useState<MasterLists | null>(null);
  const save = useAction((l: MasterLists) => api.config.saveMasterLists(l), { success: 'Lists saved', onSuccess: () => setV(null) });
  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const l = v ?? data!.masterLists;
  const edit = can('config.manage');
  const area = (key: 'terminationReasons' | 'nonRenewalReasons' | 'stampStates', label: string) => (
    <Field label={label} hint="One per line">
      <Textarea rows={7} disabled={!edit} value={l[key].join('\n')} onChange={(e) => setV({ ...l, [key]: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
    </Field>
  );
  return (
    <div>
      <ReadOnlyNote />
      <Card>
        <CardHeader title="Master lists" description="Reasons and pick-lists used across the app." />
        <CardBody className="grid gap-5 md:grid-cols-3">
          {area('terminationReasons', 'Termination reasons')}
          {area('nonRenewalReasons', 'Non-renewal reasons')}
          {area('stampStates', 'Stamp paper states')}
          <div className="md:col-span-3">
            <p className="mb-2 text-sm font-medium">Document types</p>
            <div className="flex flex-wrap gap-1.5">
              {l.documentTypes.map((t) => (
                <Badge key={t.id} tone="grey">
                  {t.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardBody>
        {edit && (
          <div className="flex justify-end border-t border-line p-4">
            <Button icon={<Save className="size-4" />} disabled={!v} loading={save.loading} onClick={() => void save.run(l)}>
              Save lists
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------- Allowed domains ----------------

export function Domains() {
  useDocumentTitle('Allowed domains');
  const { can } = useSession();
  const { data, error, loading, reload } = useApi(() => api.config.settings(), []);
  const [input, setInput] = useState('');
  const save = useAction((d: string[]) => api.config.saveDomains(d), { success: 'Domains saved', onSuccess: () => setInput('') });
  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const domains = data!.allowedDomains;
  const edit = can('config.manage');
  return (
    <div>
      <ReadOnlyNote />
      <Card>
        <CardHeader title="Allowed sign-in domains" description="Only Google Workspace or Microsoft 365 accounts on these domains (and their subdomains) can sign in." />
        <CardBody className="space-y-4">
          <ul className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <li key={d} className="flex items-center gap-1.5 rounded-full border border-line bg-canvas py-1 pl-3 pr-1.5 text-sm font-medium">
                {d}
                {edit && (
                  <button type="button" aria-label={`Remove ${d}`} className="hit-area rounded-full p-0.5 text-subtle hover:bg-line hover:text-ink" onClick={() => void save.run(domains.filter((x) => x !== d))}>
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {edit && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim()) void save.run([...domains, input]);
              }}
            >
              <label className="flex-1 sm:max-w-xs">
                <span className="sr-only">New domain</span>
                <Input placeholder="e.g. apeejay.org" value={input} onChange={(e) => setInput(e.target.value)} />
              </label>
              <Button type="submit" variant="secondary" icon={<Plus className="size-4" />} loading={save.loading}>
                Add
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
