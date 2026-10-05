import { useState } from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Institution } from '@/types';
import { api } from '@/services/mockApi';
import { useAction, useApi } from '@/hooks/useApi';
import { useSession } from '@/context/SessionContext';
import { useDocumentTitle } from '@/hooks/misc';
import { Badge, Button, Card, CardBody, CardHeader, DL, ErrorState, Field, IconButton, Input, Modal, PageSkeleton, Select, Textarea, Toggle } from '@/components/ui';
import { ReadOnlyNote } from './AdminLayout';

const blank = (): Institution => ({
  id: '',
  legalName: '',
  shortCode: '',
  type: 'school',
  legalStatus: '',
  registeredAddress: '',
  city: '',
  state: '',
  regionId: 'north',
  jurisdictionCourt: '',
  arbitrationSeat: 'New Delhi',
  locations: [{ id: `loc-${Date.now()}`, name: 'Main Campus', city: '' }],
  signatoryName: '',
  signatoryDesignation: 'Principal',
  coordinatorName: '',
  programmeGroups: [],
  active: true,
});

export function Institutions() {
  useDocumentTitle('Institutions');
  const { can } = useSession();
  const { data, error, loading, reload } = useApi(() => api.config.lookups(), []);
  const [editing, setEditing] = useState<Institution | null>(null);
  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const regions = data!.regions;
  return (
    <div className="space-y-4">
      <ReadOnlyNote />
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Institution text is merged into templates; university and school clauses swap automatically.</p>
        {can('config.manage') && (
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing(blank())}>
            Add institution
          </Button>
        )}
      </div>
      {data!.institutions.map((i) => (
        <Card key={i.id}>
          <CardHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                {i.legalName} <Badge tone="grey">{i.shortCode}</Badge> <Badge tone={i.active ? 'green' : 'dark'}>{i.active ? 'Active' : 'Inactive'}</Badge>
              </span>
            }
            description={`${i.type === 'university' ? 'University' : 'School'} · ${regions.find((r) => r.id === i.regionId)?.name ?? ''}`}
            action={can('config.manage') ? <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(structuredClone(i))}>Edit</Button> : undefined}
          />
          <CardBody>
            <DL
              cols={3}
              items={[
                { label: 'Registered address', value: i.registeredAddress, full: true },
                { label: 'Signatory', value: `${i.signatoryName}, ${i.signatoryDesignation}` },
                { label: 'Coordinator', value: i.coordinatorName },
                { label: 'Jurisdiction / seat', value: `${i.jurisdictionCourt} · ${i.arbitrationSeat}` },
                { label: i.type === 'university' ? 'Programme groups' : 'Class groups', value: i.programmeGroups.join(', '), full: true },
                { label: 'Locations', value: <span className="flex flex-wrap gap-1.5">{i.locations.map((l) => <Badge key={l.id} tone="accent" icon={<MapPin className="size-3" />}>{l.name}, {l.city}</Badge>)}</span>, full: true },
              ]}
            />
          </CardBody>
        </Card>
      ))}
      {editing && <InstitutionModal value={editing} regions={regions} onClose={() => setEditing(null)} />}
    </div>
  );
}

function InstitutionModal({ value, regions, onClose }: { value: Institution; regions: { id: string; name: string }[]; onClose: () => void }) {
  const [v, setV] = useState(value);
  const [groups, setGroups] = useState(value.programmeGroups.join(', '));
  const save = useAction((i: Institution) => api.config.saveInstitution(i), { success: 'Institution saved', onSuccess: onClose });
  const set = <K extends keyof Institution>(k: K, x: Institution[K]) => setV((s) => ({ ...s, [k]: x }));
  const fe = save.fieldErrors;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={value.id ? `Edit ${value.shortCode}` : 'Add institution'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.loading} onClick={() => void save.run({ ...v, shortCode: v.shortCode.toUpperCase(), programmeGroups: groups.split(',').map((g) => g.trim()).filter(Boolean) })}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Legal name" required className="sm:col-span-2">
          <Input value={v.legalName} onChange={(e) => set('legalName', e.target.value)} />
        </Field>
        <Field label="Short code" required error={fe.shortCode} hint="2–6 capital letters, used in agreement IDs">
          <Input value={v.shortCode} onChange={(e) => set('shortCode', e.target.value.toUpperCase())} maxLength={6} disabled={!!value.id} />
        </Field>
        <Field label="Type" required>
          <Select value={v.type} onChange={(e) => set('type', e.target.value as Institution['type'])}>
            <option value="university">University</option>
            <option value="school">School</option>
          </Select>
        </Field>
        <Field label="Legal status text" className="sm:col-span-2" hint="Printed after the name in the agreement">
          <Textarea rows={2} value={v.legalStatus} onChange={(e) => set('legalStatus', e.target.value)} />
        </Field>
        <Field label="Registered address" className="sm:col-span-2">
          <Textarea rows={2} value={v.registeredAddress} onChange={(e) => set('registeredAddress', e.target.value)} />
        </Field>
        <Field label="City">
          <Input value={v.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="State">
          <Input value={v.state} onChange={(e) => set('state', e.target.value)} />
        </Field>
        <Field label="Region">
          <Select value={v.regionId} onChange={(e) => set('regionId', e.target.value)}>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Jurisdiction court">
          <Input value={v.jurisdictionCourt} onChange={(e) => set('jurisdictionCourt', e.target.value)} />
        </Field>
        <Field label="Arbitration seat">
          <Input value={v.arbitrationSeat} onChange={(e) => set('arbitrationSeat', e.target.value)} />
        </Field>
        <Field label="Default signatory">
          <Input value={v.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} />
        </Field>
        <Field label="Signatory designation">
          <Input value={v.signatoryDesignation} onChange={(e) => set('signatoryDesignation', e.target.value)} />
        </Field>
        <Field label="Coordinator">
          <Input value={v.coordinatorName} onChange={(e) => set('coordinatorName', e.target.value)} />
        </Field>
        <Field label={v.type === 'university' ? 'Allowed programme groups' : 'Allowed class groups'} hint="Comma separated" className="sm:col-span-2">
          <Input value={groups} onChange={(e) => setGroups(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium">Locations / campuses</p>
          <ul className="space-y-2">
            {v.locations.map((l, i) => (
              <li key={l.id} className="flex gap-2">
                <Input aria-label="Location name" value={l.name} onChange={(e) => set('locations', v.locations.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input aria-label="City" value={l.city} placeholder="City" onChange={(e) => set('locations', v.locations.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)))} />
                <IconButton label="Remove location" onClick={() => set('locations', v.locations.filter((_, j) => j !== i))} disabled={v.locations.length === 1}>
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button variant="link" size="sm" className="mt-2" icon={<Plus className="size-4" />} onClick={() => set('locations', [...v.locations, { id: `loc-${Date.now()}`, name: '', city: v.city }])}>
            Add location
          </Button>
        </div>
        <div className="sm:col-span-2">
          <Toggle checked={v.active} onChange={(x) => set('active', x)} label="Active" description="Inactive institutions can’t be chosen for new agreements." />
        </div>
      </div>
    </Modal>
  );
}
