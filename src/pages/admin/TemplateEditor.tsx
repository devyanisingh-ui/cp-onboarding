import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  CheckCircle2,
  Copy,
  GripVertical,
  Heading,
  ListOrdered,
  PenLine,
  Pilcrow,
  Plus,
  Save,
  Send,
  Table2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { CpType, Institution, RateCard, TemplateBlock, TemplateContent, TemplateVersion } from '@/types';
import { api } from '@/services/mockApi';
import { errorMessage } from '@/services/errors';
import { useSession } from '@/context/SessionContext';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle, useMediaQuery } from '@/hooks/misc';
import { CP_TYPE_LABELS } from '@/lib/format';
import { VERSION_STATUS_META } from '@/lib/status';
import { renderAgreementHtml } from '@/lib/agreementTemplate';
import { FIELDS, FIELD_BY_KEY, FIELD_GROUPS, fieldApplies, token, tokensIn, type FieldDef } from '@/lib/templateFields';
import { blockText, isRequired, newBlockId, usedFieldKeys, validateContent } from '@/lib/templateContent';
import { sampleContext } from '@/lib/templateSample';
import { cn } from '@/lib/cn';
import { Alert, Badge, Button, Card, Drawer, EmptyState, ErrorState, Field, IconButton, Input, Menu, Modal, PageSkeleton, SearchInput, Select, Tabs, Textarea, Toggle, useToast } from '@/components/ui';
import { AgreementHtml, CommentDialog, PageHeader } from '@/components/common';

type TextProp = 'text' | 'title' | 'schoolText' | 'note';
interface Caret {
  blockId: string;
  prop: TextProp;
  start: number;
  end: number;
}

const BLOCK_META: Record<TemplateBlock['kind'], { label: string; icon: ReactNode }> = {
  heading: { label: 'Heading', icon: <Heading className="size-4" /> },
  paragraph: { label: 'Paragraph', icon: <Pilcrow className="size-4" /> },
  clause: { label: 'Clause', icon: <ListOrdered className="size-4" /> },
  signatures: { label: 'Signatures', icon: <PenLine className="size-4" /> },
  annexure: { label: 'Annexure-B rates', icon: <Table2 className="size-4" /> },
};

export function TemplateEditor() {
  const { id = '' } = useParams();
  const tpl = useApi(() => api.config.template(id), [id]);
  const lookups = useApi(() => api.config.lookups(), []);
  const rateCards = useApi(() => api.config.rateCards(), []);
  useDocumentTitle(tpl.data ? `Template ${CP_TYPE_LABELS[tpl.data.cpType]} v${tpl.data.version}` : 'Template editor');
  if (tpl.error) return <ErrorState error={tpl.error} onRetry={tpl.reload} />;
  if (!tpl.data || !lookups.data || !rateCards.data) return <PageSkeleton />;
  return <EditorInner key={`${tpl.data.id}-${tpl.data.status}`} template={tpl.data} institutions={lookups.data.institutions} rateCards={rateCards.data} />;
}

function EditorInner({ template, institutions, rateCards }: { template: TemplateVersion; institutions: Institution[]; rateCards: RateCard[] }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { can, user } = useSession();
  const editable = template.status === 'draft' && can('template.manage');
  const [content, setContent] = useState<TemplateContent>(() => structuredClone(template.content!));
  const [changeNote, setChangeNote] = useState(template.changeNote);
  const [effectiveFrom, setEffectiveFrom] = useState(template.effectiveFrom);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const caret = useRef<Caret | null>(null);
  const [panel, setPanel] = useState<'insert' | 'preview' | 'fields' | 'checks'>('preview');
  const [mobileTab, setMobileTab] = useState<'build' | 'preview' | 'fields' | 'checks'>('build');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  // ≥1536: palette | canvas | panel. 1280–1535: canvas | panel (palette is a panel tab). Below: tabs.
  const wide = useMediaQuery('(min-width: 1280px)');
  const ultra = useMediaQuery('(min-width: 1536px)');
  const activePanel = ultra && panel === 'insert' ? 'preview' : panel;
  const cpType = template.cpType;

  const issues = useMemo(() => validateContent(content, cpType), [content, cpType]);
  const used = useMemo(() => usedFieldKeys(content), [content]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ---------- Mutations ----------
  const update = (fn: (c: TemplateContent) => TemplateContent) => {
    if (!editable) return;
    setContent((c) => fn(structuredClone(c)));
    setDirty(true);
  };
  const setBlock = (blockId: string, patch: Partial<Record<TextProp, string | undefined>>) =>
    update((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === blockId ? ({ ...b, ...patch } as TemplateBlock) : b)) }));
  const move = (from: number, to: number) =>
    update((c) => {
      if (to < 0 || to >= c.blocks.length) return c;
      const blocks = [...c.blocks];
      const [b] = blocks.splice(from, 1);
      blocks.splice(to, 0, b!);
      return { ...c, blocks };
    });
  const remove = (blockId: string) => update((c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== blockId) }));
  const duplicate = (i: number) =>
    update((c) => {
      const copy = { ...structuredClone(c.blocks[i]!), id: newBlockId(c.blocks[i]!.kind) };
      const blocks = [...c.blocks];
      blocks.splice(i + 1, 0, copy);
      return { ...c, blocks };
    });
  const add = (kind: TemplateBlock['kind']) => {
    const id = newBlockId(kind);
    const block: TemplateBlock =
      kind === 'clause'
        ? { id, kind, title: 'New clause', text: '' }
        : kind === 'heading'
          ? { id, kind, text: 'Heading' }
          : kind === 'paragraph'
            ? { id, kind, text: '' }
            : kind === 'annexure'
              ? { id, kind, title: 'Annexure-B — Consideration per admitted student', note: 'Slabs are the number of admissions in the admission cycle.' }
              : { id, kind: 'signatures' };
    update((c) => {
      const at = selected ? c.blocks.findIndex((b) => b.id === selected) + 1 : c.blocks.length;
      const blocks = [...c.blocks];
      blocks.splice(at <= 0 ? c.blocks.length : at, 0, block);
      return { ...c, blocks };
    });
    setSelected(id);
    setTimeout(() => document.getElementById(`block-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  /** Inserts {{field}} at the caret of the last text box the user was in. */
  const insertField = (f: FieldDef) => {
    if (!editable) return;
    const c = caret.current;
    const target = c ?? (selected ? { blockId: selected, prop: 'text' as TextProp, start: -1, end: -1 } : null);
    const block = target && content.blocks.find((b) => b.id === target.blockId);
    if (!target || !block || !(target.prop in block || target.prop === 'text') || block.kind === 'signatures') {
      toast.info('Click into a text box first', 'Then pick a field to insert it at the cursor.');
      return;
    }
    const current = ((block as Record<string, unknown>)[target.prop] as string | undefined) ?? '';
    const start = target.start < 0 ? current.length : target.start;
    const end = target.end < 0 ? current.length : target.end;
    const t = token(f.key);
    setBlock(block.id, { [target.prop]: current.slice(0, start) + t + current.slice(end) });
    const pos = start + t.length;
    caret.current = { ...target, start: pos, end: pos };
    setPaletteOpen(false);
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(`[data-block="${block.id}"][data-prop="${target.prop}"]`);
      el?.focus();
      el?.setSelectionRange(pos, pos);
    }, 0);
    toast.success(`Inserted “${f.label}”`);
  };

  const trackCaret = (blockId: string, prop: TextProp) => (e: { currentTarget: HTMLTextAreaElement | HTMLInputElement }) => {
    caret.current = { blockId, prop, start: e.currentTarget.selectionStart ?? 0, end: e.currentTarget.selectionEnd ?? 0 };
  };

  // ---------- Persistence ----------
  const save = useAction(() => api.config.saveTemplateDraft(template.id, { content, changeNote, effectiveFrom }), { success: 'Template saved', onSuccess: () => setDirty(false) });
  const sendToLegal = async () => {
    if (!changeNote.trim()) return toast.error('Describe what changed', 'Legal needs a short note on what this version changes.');
    const s = await save.run();
    if (!s.ok) return;
    try {
      await api.config.submitTemplate(template.id);
      toast.success('Sent to Legal for approval');
      navigate('/admin/templates');
    } catch (e) {
      toast.error('Could not send', errorMessage(e));
    }
  };
  const discard = useAction(() => api.config.discardTemplateDraft(template.id), { success: 'Draft discarded', onSuccess: () => (setDirty(false), navigate('/admin/templates')) });
  const approve = useAction(() => api.config.decideTemplate(template.id, 'approve'), { success: 'Approved — Admin can now publish', onSuccess: () => navigate('/admin/templates') });
  const reject = useAction((c: string) => api.config.decideTemplate(template.id, 'reject', c), { success: 'Returned to Admin', onSuccess: () => navigate('/admin/templates') });
  const publish = useAction(() => api.config.publishTemplate(template.id), { success: 'Published — new drafts use this version', onSuccess: () => navigate('/admin/templates') });

  const scope = template.institutionId ? institutions.find((i) => i.id === template.institutionId)?.shortCode : 'All institutions';
  const status = VERSION_STATUS_META[template.status];

  const palette = <FieldPalette cpType={cpType} used={used} onPick={insertField} disabled={!editable} />;
  const preview = <PreviewPanel content={content} template={template} institutions={institutions} rateCards={rateCards} />;
  const fieldsPanel = <UsedFields content={content} cpType={cpType} editable={editable} onToggle={(k, v) => update((c) => ({ ...c, required: { ...c.required, [k]: v } }))} />;
  const checks = <Checks errors={issues.errors} warnings={issues.warnings} />;
  const canvas = (
    <Canvas
      content={content}
      editable={editable}
      selected={selected}
      setSelected={setSelected}
      cpType={cpType}
      onText={setBlock}
      onMove={move}
      onRemove={remove}
      onDuplicate={duplicate}
      onAdd={add}
      trackCaret={trackCaret}
      onOpenPalette={ultra ? undefined : wide ? () => setPanel('insert') : () => setPaletteOpen(true)}
    />
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Templates', to: '/admin/templates' }, { label: `${CP_TYPE_LABELS[cpType]} v${template.version}` }]}
        title={`${CP_TYPE_LABELS[cpType]} template · v${template.version}`}
        subtitle={`${scope} · ${editable ? 'Draft — edits are saved as this new version only. Published versions are never changed.' : 'Read-only.'}`}
        badges={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            {dirty && <Badge tone="amber">Unsaved changes</Badge>}
          </>
        }
        actions={
          <>
            {editable && (
              <>
                {!template.approvedById && (
                  <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDiscard(true)}>
                    Discard
                  </Button>
                )}
                <Button variant="secondary" icon={<Save className="size-4" />} loading={save.loading} disabled={!dirty} onClick={() => void save.run()}>
                  Save draft
                </Button>
                <Button icon={<Send className="size-4" />} disabled={issues.errors.length > 0} onClick={() => void sendToLegal()}>
                  Send to Legal
                </Button>
              </>
            )}
            {template.status === 'pending_approval' && can('template.approve') && (
              <>
                <Button variant="danger" icon={<X className="size-4" />} onClick={() => setRejecting(true)}>
                  Return
                </Button>
                <Button variant="success" icon={<Check className="size-4" />} loading={approve.loading} disabled={template.uploadedById === user?.id} onClick={() => void approve.run()}>
                  Approve
                </Button>
              </>
            )}
            {template.status === 'approved' && can('template.manage') && (
              <Button icon={<Upload className="size-4" />} loading={publish.loading} onClick={() => void publish.run()}>
                Publish
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 space-y-3">
        {template.rejectComment && template.status === 'draft' && (
          <Alert tone="error" title="Returned by Legal">
            {template.rejectComment}
          </Alert>
        )}
        {template.status === 'pending_approval' && !can('template.approve') && <Alert tone="info">Waiting for Legal. It can be published once approved.</Alert>}
        {issues.errors.length > 0 && editable && (
          <Alert tone="error" title={`${issues.errors.length} problem${issues.errors.length === 1 ? '' : 's'} to fix before sending to Legal`}>
            {issues.errors[0]}
            {issues.errors.length > 1 && (
              <button type="button" className="ml-1 font-semibold underline" onClick={() => (setPanel('checks'), setMobileTab('checks'))}>
                See all
              </button>
            )}
          </Alert>
        )}
      </div>

      <Card className="mb-5 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_180px]">
          <Field label="Document title" required>
            <Input value={content.title} disabled={!editable} onChange={(e) => update((c) => ({ ...c, title: e.target.value }))} />
          </Field>
          <Field label="Subtitle" optional>
            <Input value={content.subtitle ?? ''} disabled={!editable} onChange={(e) => update((c) => ({ ...c, subtitle: e.target.value }))} />
          </Field>
          <Field label="Effective from" required>
            <Input type="date" value={effectiveFrom} disabled={!editable} onChange={(e) => (setEffectiveFrom(e.target.value), setDirty(true))} />
          </Field>
          <Field label="What changed in this version" required={editable} className="md:col-span-3" hint="Shown to Legal when they review it.">
            <Textarea rows={2} value={changeNote} disabled={!editable} onChange={(e) => (setChangeNote(e.target.value), setDirty(true))} placeholder="e.g. Clause 4 now pays within 30 days; added GSTIN to the parties paragraph." />
          </Field>
        </div>
      </Card>

      {wide ? (
        <div className={cn('grid items-start gap-5', ultra ? 'grid-cols-[240px_minmax(0,1fr)_minmax(0,460px)]' : 'grid-cols-[minmax(0,1fr)_minmax(0,420px)]')}>
          {ultra && <Card className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-hidden">{palette}</Card>}
          <div className="min-w-0">{canvas}</div>
          <Card className="sticky top-20 flex max-h-[calc(100dvh-6rem)] flex-col overflow-hidden">
            <div className="px-4 pt-2">
              <Tabs
                label="Template side panel"
                active={activePanel}
                onChange={setPanel}
                tabs={[
                  ...(ultra || !editable ? [] : [{ id: 'insert' as const, label: 'Insert field' }]),
                  { id: 'preview' as const, label: 'Preview' },
                  { id: 'fields' as const, label: 'Fields', count: used.length },
                  { id: 'checks' as const, label: 'Checks', count: issues.errors.length + issues.warnings.length || undefined },
                ]}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{activePanel === 'insert' ? palette : activePanel === 'preview' ? preview : activePanel === 'fields' ? fieldsPanel : checks}</div>
          </Card>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <Tabs
              label="Template editor sections"
              active={mobileTab}
              onChange={setMobileTab}
              tabs={[
                { id: 'build', label: 'Build' },
                { id: 'preview', label: 'Preview' },
                { id: 'fields', label: 'Fields', count: used.length },
                { id: 'checks', label: 'Checks', count: issues.errors.length + issues.warnings.length || undefined },
              ]}
            />
          </div>
          {mobileTab === 'build' && canvas}
          {mobileTab !== 'build' && <Card>{mobileTab === 'preview' ? preview : mobileTab === 'fields' ? fieldsPanel : checks}</Card>}
          <Drawer open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Insert a field">
            {palette}
          </Drawer>
        </>
      )}

      <Modal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        size="sm"
        title="Discard this draft?"
        description="The draft version is removed. Published versions are not affected."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button variant="danger" loading={discard.loading} onClick={() => void discard.run()}>
              Discard draft
            </Button>
          </>
        }
      />
      <CommentDialog open={rejecting} onClose={() => setRejecting(false)} title="Return template to Admin" description="Admin can edit the draft and send it again." confirmLabel="Return" onConfirm={async (c) => (await reject.run(c)).ok} />
    </div>
  );
}

// ---------------- Field palette ----------------

function FieldPalette({ cpType, used, onPick, disabled }: { cpType: CpType; used: string[]; onPick: (f: FieldDef) => void; disabled: boolean }) {
  const [q, setQ] = useState('');
  const list = FIELDS.filter((f) => !q || `${f.label} ${f.key}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex h-full max-h-[inherit] flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Braces className="size-4 text-primary-600" aria-hidden /> Fields
        </p>
        <p className="text-xs text-muted">{disabled ? 'Fields this template can use.' : 'Click a text box, then a field to insert it. You can also drag a field into the text.'}</p>
        <SearchInput label="Search fields" placeholder="Search fields" value={q} onChange={setQ} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {FIELD_GROUPS.map((g) => {
          const items = list.filter((f) => f.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="mb-3">
              <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-subtle">{g}</p>
              <ul className="space-y-0.5">
                {items.map((f) => {
                  const applies = fieldApplies(f, cpType);
                  return (
                    <li key={f.key}>
                      <button
                        type="button"
                        disabled={disabled}
                        draggable={!disabled}
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', token(f.key))}
                        onClick={() => onPick(f)}
                        title={applies ? `Insert {{${f.key}}}` : `Doesn’t apply to ${CP_TYPE_LABELS[cpType]} CPs`}
                        className={cn(
                          'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors enabled:hover:bg-primary-50 disabled:cursor-default',
                          !applies && 'opacity-50',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ink">{f.label}</span>
                          <span className="block truncate font-mono text-[10.5px] text-subtle">{f.key}</span>
                        </span>
                        {used.includes(f.key) && <CheckCircle2 className="size-3.5 shrink-0 text-success-600" aria-label="Used in template" />}
                        {!disabled && <Plus className="size-3.5 shrink-0 text-subtle opacity-0 group-hover:opacity-100" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {!list.length && <p className="px-2 py-6 text-center text-sm text-muted">No fields match.</p>}
      </div>
    </div>
  );
}

// ---------------- Canvas ----------------

function Canvas({
  content,
  editable,
  selected,
  setSelected,
  cpType,
  onText,
  onMove,
  onRemove,
  onDuplicate,
  onAdd,
  trackCaret,
  onOpenPalette,
}: {
  content: TemplateContent;
  editable: boolean;
  selected: string | null;
  setSelected: (id: string) => void;
  cpType: CpType;
  onText: (id: string, patch: Partial<Record<TextProp, string | undefined>>) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onDuplicate: (i: number) => void;
  onAdd: (kind: TemplateBlock['kind']) => void;
  trackCaret: (blockId: string, prop: TextProp) => (e: { currentTarget: HTMLTextAreaElement | HTMLInputElement }) => void;
  onOpenPalette?: () => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  let clauseNo = 0;
  const hasSig = content.blocks.some((b) => b.kind === 'signatures');
  const hasAnnex = content.blocks.some((b) => b.kind === 'annexure');
  const addMenu = (
    <Menu
      label="Add block"
      align="left"
      trigger={(p) => (
        <Button {...p} variant="secondary" icon={<Plus className="size-4" />}>
          Add block
        </Button>
      )}
      items={[
        { label: 'Clause (numbered)', icon: BLOCK_META.clause.icon, onSelect: () => onAdd('clause') },
        { label: 'Paragraph', icon: BLOCK_META.paragraph.icon, onSelect: () => onAdd('paragraph') },
        { label: 'Heading', icon: BLOCK_META.heading.icon, onSelect: () => onAdd('heading') },
        { label: 'Signatures', icon: BLOCK_META.signatures.icon, onSelect: () => onAdd('signatures'), disabled: hasSig },
        { label: 'Annexure-B rate table', icon: BLOCK_META.annexure.icon, onSelect: () => onAdd('annexure'), disabled: hasAnnex },
      ]}
    />
  );

  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">{selected ? 'New blocks are added below the selected block.' : 'Select a block to add new ones below it.'}</p>
          <div className="flex gap-2">
            {onOpenPalette && (
              <Button variant="secondary" icon={<Braces className="size-4" />} onClick={onOpenPalette}>
                Insert field
              </Button>
            )}
            {addMenu}
          </div>
        </div>
      )}
      {!content.blocks.length && <EmptyState icon={<ListOrdered />} title="This template is empty" description="Add clauses, paragraphs, the signatures block and the Annexure-B rate table." action={editable ? addMenu : undefined} />}
      <ol className="space-y-3" aria-label="Template blocks">
        {content.blocks.map((b, i) => {
          if (b.kind === 'clause') clauseNo++;
          const isSel = selected === b.id;
          const unknown = tokensIn(blockText(b)).filter((k) => !FIELD_BY_KEY[k]);
          const meta = BLOCK_META[b.kind];
          return (
            <li
              key={b.id}
              id={`block-${b.id}`}
              onFocusCapture={() => setSelected(b.id)}
              onClick={() => setSelected(b.id)}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                setDragOver(i);
              }}
              onDrop={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                onMove(dragFrom, i);
                setDragFrom(null);
                setDragOver(null);
              }}
              className={cn(
                'rounded-xl border bg-white/90 shadow-card transition-all duration-150',
                isSel && editable ? 'border-primary-400 ring-2 ring-primary-100' : 'border-line',
                dragOver === i && dragFrom !== i && 'border-dashed border-primary-500',
                dragFrom === i && 'opacity-50',
              )}
            >
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                {editable && (
                  <span
                    draggable
                    onDragStart={(e) => {
                      setDragFrom(i);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('application/x-block', b.id);
                    }}
                    onDragEnd={() => (setDragFrom(null), setDragOver(null))}
                    className="cursor-grab text-subtle hover:text-ink-soft active:cursor-grabbing"
                    aria-hidden
                    title="Drag to reorder"
                  >
                    <GripVertical className="size-4" />
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <span className="text-primary-600">{meta.icon}</span>
                  {b.kind === 'clause' ? `Clause ${clauseNo}` : meta.label}
                </span>
                {unknown.length > 0 && (
                  <Badge tone="red" icon={<AlertCircle className="size-3" aria-hidden />}>
                    Unknown field
                  </Badge>
                )}
                {editable && (
                  <span className="ml-auto flex items-center">
                    <IconButton label="Move up" size="sm" disabled={i === 0} onClick={() => onMove(i, i - 1)}>
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton label="Move down" size="sm" disabled={i === content.blocks.length - 1} onClick={() => onMove(i, i + 1)}>
                      <ArrowDown className="size-4" />
                    </IconButton>
                    {b.kind !== 'signatures' && b.kind !== 'annexure' && (
                      <IconButton label="Duplicate block" size="sm" onClick={() => onDuplicate(i)}>
                        <Copy className="size-4" />
                      </IconButton>
                    )}
                    <IconButton label="Delete block" size="sm" onClick={() => onRemove(b.id)} className="hover:text-danger-700">
                      <Trash2 className="size-4" />
                    </IconButton>
                  </span>
                )}
              </div>
              <div className="space-y-3 p-3">
                <BlockBody block={b} editable={editable} cpType={cpType} onText={onText} trackCaret={trackCaret} />
              </div>
            </li>
          );
        })}
      </ol>
      {editable && content.blocks.length > 0 && <div className="flex justify-center pt-1">{addMenu}</div>}
    </div>
  );
}

function BlockBody({
  block: b,
  editable,
  cpType,
  onText,
  trackCaret,
}: {
  block: TemplateBlock;
  editable: boolean;
  cpType: CpType;
  onText: (id: string, patch: Partial<Record<TextProp, string | undefined>>) => void;
  trackCaret: (blockId: string, prop: TextProp) => (e: { currentTarget: HTMLTextAreaElement | HTMLInputElement }) => void;
}) {
  const textProps = (prop: TextProp) => ({
    'data-block': b.id,
    'data-prop': prop,
    readOnly: !editable,
    onSelect: trackCaret(b.id, prop),
    onKeyUp: trackCaret(b.id, prop),
    onClick: trackCaret(b.id, prop),
    onFocus: trackCaret(b.id, prop),
  });
  switch (b.kind) {
    case 'heading':
      return <Input aria-label="Heading text" value={b.text} {...textProps('text')} onChange={(e) => onText(b.id, { text: e.target.value })} className="font-semibold uppercase tracking-wide" />;
    case 'paragraph':
      return (
        <>
          <Textarea aria-label="Paragraph text" rows={Math.min(8, Math.max(2, Math.ceil(b.text.length / 90)))} value={b.text} placeholder="Type the paragraph. Use **bold** for emphasis and insert fields from the palette." {...textProps('text')} onChange={(e) => onText(b.id, { text: e.target.value })} />
          <TokenChips text={b.text} cpType={cpType} />
        </>
      );
    case 'clause':
      return (
        <>
          <Input aria-label="Clause title" value={b.title} {...textProps('title')} onChange={(e) => onText(b.id, { title: e.target.value })} className="font-semibold" placeholder="Clause title" />
          <Textarea aria-label="Clause text" rows={Math.min(9, Math.max(3, Math.ceil(b.text.length / 90)))} value={b.text} placeholder="Clause wording" {...textProps('text')} onChange={(e) => onText(b.id, { text: e.target.value })} />
          <TokenChips text={b.text} cpType={cpType} />
          {(editable || b.schoolText) && (
            <div className="rounded-lg bg-sunken/50 p-3">
              <Toggle
                checked={b.schoolText !== undefined}
                disabled={!editable}
                onChange={(on) => onText(b.id, { schoolText: on ? b.text : undefined })}
                label="Different wording for schools"
                description="Universities use the text above; schools use this version."
              />
              {b.schoolText !== undefined && (
                <Textarea
                  aria-label="School wording"
                  className="mt-3"
                  rows={Math.min(9, Math.max(3, Math.ceil(b.schoolText.length / 90)))}
                  value={b.schoolText}
                  {...textProps('schoolText')}
                  onChange={(e) => onText(b.id, { schoolText: e.target.value })}
                />
              )}
            </div>
          )}
        </>
      );
    case 'signatures':
      return <p className="text-sm text-muted">Two signature blocks: the institution’s signing authority (name and designation) and the CP — the CP name is entered once and repeated here automatically.</p>;
    case 'annexure':
      return (
        <>
          <Input aria-label="Annexure title" value={b.title} {...textProps('title')} onChange={(e) => onText(b.id, { title: e.target.value })} className="font-semibold" />
          <Input aria-label="Annexure note" value={b.note ?? ''} placeholder="Note under the title (optional)" {...textProps('note')} onChange={(e) => onText(b.id, { note: e.target.value })} />
          <p className="text-xs text-muted">The rate table is filled from the institution’s current rate card (and any approved deviations), so a new rate card changes it without editing the template.</p>
        </>
      );
  }
}

/** Readable chips for the {{fields}} used in a text box. */
function TokenChips({ text, cpType }: { text: string; cpType: CpType }) {
  const keys = [...new Set(tokensIn(text))];
  if (!keys.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((k) => {
        const f = FIELD_BY_KEY[k];
        const bad = !f;
        const na = f && !fieldApplies(f, cpType);
        return (
          <span
            key={k}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
              bad ? 'bg-danger-50 text-danger-700 ring-red-200' : na ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-primary-50 text-primary-800 ring-primary-200',
            )}
            title={bad ? 'Unknown field' : na ? `Doesn’t apply to ${CP_TYPE_LABELS[cpType]}` : k}
          >
            <Braces className="size-3" aria-hidden />
            {f?.label ?? k}
          </span>
        );
      })}
    </div>
  );
}

// ---------------- Side panels ----------------

function PreviewPanel({ content, template, institutions, rateCards }: { content: TemplateContent; template: TemplateVersion; institutions: Institution[]; rateCards: RateCard[] }) {
  const options = institutions.filter((i) => (!template.institutionId || i.id === template.institutionId) && rateCards.some((r) => r.institutionId === i.id && r.status === 'published'));
  const [instId, setInstId] = useState(options[0]?.id ?? '');
  const inst = options.find((i) => i.id === instId) ?? options[0];
  const rc = inst && rateCards.filter((r) => r.institutionId === inst.id && r.status === 'published').sort((a, b) => b.version - a.version)[0];
  const html = useMemo(() => (inst && rc ? renderAgreementHtml(sampleContext({ ...template, content }, inst, rc)) : ''), [content, template, inst, rc]);
  if (!inst || !rc) return <p className="p-5 text-sm text-muted">No institution with a published rate card to preview against.</p>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-sunken/40 px-4 py-2.5 text-xs text-muted">
        <span>Sample data for a fictional CP at</span>
        <label className="w-36">
          <span className="sr-only">Preview institution</span>
          <Select size="sm" value={inst.id} onChange={(e) => setInstId(e.target.value)}>
            {options.map((i) => (
              <option key={i.id} value={i.id}>
                {i.shortCode} ({i.type})
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="p-4 sm:p-6">
        <AgreementHtml html={html} />
      </div>
    </div>
  );
}

function UsedFields({ content, cpType, editable, onToggle }: { content: TemplateContent; cpType: CpType; editable: boolean; onToggle: (key: string, required: boolean) => void }) {
  const keys = usedFieldKeys(content);
  if (!keys.length) return <p className="p-5 text-sm text-muted">The template doesn’t use any fields yet.</p>;
  return (
    <div>
      <p className="border-b border-line px-4 py-3 text-xs text-muted">Required fields must be filled before a draft can be submitted; empty ones show as yellow placeholders in the preview.</p>
      <ul className="divide-y divide-line">
        {keys.map((k) => {
          const f = FIELD_BY_KEY[k];
          if (!f) {
            return (
              <li key={k} className="flex items-center gap-2 px-4 py-3 text-sm text-danger-700">
                <AlertCircle className="size-4" aria-hidden /> Unknown field <code className="font-mono text-xs">{k}</code>
              </li>
            );
          }
          const applies = fieldApplies(f, cpType);
          return (
            <li key={k} className="px-4 py-3">
              <Toggle
                checked={applies && isRequired(content, f)}
                disabled={!editable || !applies}
                onChange={(v) => onToggle(k, v)}
                label={f.label}
                description={applies ? `${f.source} · ${k}` : `Doesn’t apply to ${CP_TYPE_LABELS[cpType]} CPs — prints empty`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Checks({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (!errors.length && !warnings.length)
    return (
      <div className="flex items-center gap-2 p-5 text-sm text-success-700">
        <CheckCircle2 className="size-5" aria-hidden /> No problems found. Ready to send to Legal.
      </div>
    );
  return (
    <ul className="divide-y divide-line">
      {errors.map((e) => (
        <li key={e} className="flex gap-2 px-4 py-3 text-sm text-danger-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {e}
        </li>
      ))}
      {warnings.map((w) => (
        <li key={w} className="flex gap-2 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
        </li>
      ))}
    </ul>
  );
}
