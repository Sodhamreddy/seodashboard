'use client';

import { useEffect, useMemo, useState } from 'react';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Icon } from '@/components/ui/Icon';
import { Instructions, PasteTarget } from '@/components/ui/Instructions';
import { LengthMeter } from '@/components/ui/data';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Note,
  SectionHeading,
  Select,
  cx,
  type Tone,
} from '@/components/ui/primitives';
import {
  DESC_MAX,
  DESC_MIN,
  TITLE_MAX,
  TITLE_MIN,
  renderHeadHtml,
  renderNextMetadata,
  type FieldStatus,
  type MetaSnippetInput,
  type MetaTagResult,
} from '@/lib/seo/meta';

const STATUS_TONE: Record<FieldStatus, Tone> = {
  ok: 'good',
  warn: 'warning',
  fail: 'critical',
  missing: 'critical',
};

const STATUS_LABEL: Record<FieldStatus, string> = {
  ok: 'Good',
  warn: 'Tune',
  fail: 'Fix',
  missing: 'Missing',
};

/** Small inline copy button used on every editable row. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-hairline px-2 text-2xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink"
    >
      <Icon name={copied ? 'check' : 'copy'} size={12} />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/** One editable generated value with its own counter and copy control. */
function EditableRow({
  label,
  value,
  onChange,
  limits,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  limits?: { min: number; max: number };
  multiline?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-raised p-3">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label className="text-2xs font-semibold uppercase tracking-[0.06em] text-ink-secondary">
          {label}
        </label>
        <CopyButton value={value} label={label} />
      </div>

      {multiline ? (
        <textarea
          value={value}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-hairline bg-surface px-2.5 py-2 text-xs leading-relaxed text-ink focus:border-accent focus:outline-none"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full rounded-md border border-hairline bg-surface px-2.5 text-xs text-ink focus:border-accent focus:outline-none"
        />
      )}

      {limits && (
        <div className="mt-2">
          <LengthMeter length={value.length} min={limits.min} max={limits.max} />
        </div>
      )}
      {hint && <p className="mt-1.5 text-2xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function MetaTagTool({ defaultUrl }: { defaultUrl: string }) {
  const [form, setForm] = useState({
    url: defaultUrl,
    primaryKeyword: '',
    brandName: '',
    pageType: 'website' as 'website' | 'article' | 'product',
  });
  const [result, setResult] = useState<MetaTagResult | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // The editable copy of what was generated. Edits rebuild the snippets live.
  const [draft, setDraft] = useState<MetaSnippetInput | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const dirty = useMemo(() => {
    if (!draft || !result) return false;
    return JSON.stringify(draft) !== JSON.stringify(result.snippet);
  }, [draft, result]);

  useEffect(() => {
    setSaveState('idle');
  }, [draft]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function editDraft(patch: Partial<MetaSnippetInput>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');

    try {
      const response = await fetch('/api/tools/meta-tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as MetaTagResult & { error?: string };

      if (!response.ok) {
        setError(data.error ?? 'Generation failed.');
        setResult(null);
        setDraft(null);
      } else {
        setResult(data);
        setDraft(data.snippet);
      }
    } catch {
      setError('Network error — could not reach the generator.');
    } finally {
      setPending(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setSaveState('saving');
    try {
      const response = await fetch('/api/tools/meta-tags/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: form.url, snippet: draft }),
      });
      setSaveState(response.ok ? 'saved' : 'idle');
    } catch {
      setSaveState('idle');
    }
  }

  // Snippets are rebuilt from the draft on every keystroke — no round-trip.
  const headHtml = draft ? renderHeadHtml(draft) : (result?.headHtml ?? '');
  const nextMetadata = draft ? renderNextMetadata(draft) : (result?.nextMetadata ?? '');

  return (
    <div className="space-y-6">
      <Instructions
        title="How to use the Meta Tag Generator"
        icon="tag"
        steps={[
          <>
            Paste the <strong className="text-ink">full URL</strong> of the page you want to
            optimise and press <strong className="text-ink">Generate meta tags</strong>. The live
            page is fetched and its existing tags are scored.
          </>,
          <>
            Optionally add a <strong className="text-ink">primary keyword</strong> — it is forced
            into the title and leads the description.
          </>,
          <>
            <strong className="text-ink">Edit any generated value</strong> in the boxes below. The
            code updates as you type, and the character meters show whether you are inside Google&apos;s
            truncation limits.
          </>,
          <>
            Copy the finished block and paste it inside your page&apos;s{' '}
            <code className="rounded bg-surface-sunken px-1 font-mono">&lt;head&gt;</code>,{' '}
            <strong className="text-ink">replacing</strong> the existing title, description and
            og/twitter tags so they are not duplicated.
          </>,
        ]}
      />

      <Card>
        <form onSubmit={run} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Page URL"
              htmlFor="meta-url"
              hint="The live page is fetched so suggestions build on its real H1 and copy."
            >
              <Input
                id="meta-url"
                value={form.url}
                onChange={(event) => update('url', event.target.value)}
                placeholder="https://example.com/services"
                required
              />
            </Field>
            <Field
              label="Primary keyword"
              htmlFor="meta-keyword"
              hint="Optional. Forces the phrase into the title and leads the description."
            >
              <Input
                id="meta-keyword"
                value={form.primaryKeyword}
                onChange={(event) => update('primaryKeyword', event.target.value)}
                placeholder="in-home senior care austin"
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Brand name" htmlFor="meta-brand" hint="Defaults to the detected brand.">
              <Input
                id="meta-brand"
                value={form.brandName}
                onChange={(event) => update('brandName', event.target.value)}
                placeholder="Auto-detect"
              />
            </Field>
            <Field label="og:type" htmlFor="meta-type" hint="website for most pages; article for blog posts.">
              <Select
                id="meta-type"
                value={form.pageType}
                onChange={(event) => update('pageType', event.target.value as typeof form.pageType)}
              >
                <option value="website">website</option>
                <option value="article">article</option>
                <option value="product">product</option>
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="submit" loading={pending} icon="play">
              {pending ? 'Reading page…' : 'Generate meta tags'}
            </Button>
            {result && (
              <p className="truncate text-2xs text-ink-muted">
                Brand detected as{' '}
                <span className="font-medium text-ink-secondary">{result.brand}</span>
              </p>
            )}
          </div>
        </form>

        {error && (
          <div className="mt-4">
            <Note tone="critical" icon="alert">
              {error}
            </Note>
          </div>
        )}
      </Card>

      {!result && !pending && !error && (
        <EmptyState
          icon="tag"
          title="No tags generated yet"
          description="Point the generator at a page. It reads the existing head, scores each tag, and writes replacements that fit Google's truncation limits."
        />
      )}

      {result && draft && (
        <>
          {/* ── Edit the generated values ───────────────────────────── */}
          <section>
            <SectionHeading
              title="Edit & copy"
              subtitle="Change anything here — the code below rebuilds as you type"
              action={
                <div className="flex items-center gap-2">
                  {dirty && <Badge tone="warning">edited</Badge>}
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="refresh"
                    onClick={() => setDraft(result.snippet)}
                    disabled={!dirty}
                  >
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    icon={saveState === 'saved' ? 'check' : 'download'}
                    loading={saveState === 'saving'}
                    onClick={saveDraft}
                  >
                    {saveState === 'saved' ? 'Saved' : 'Save'}
                  </Button>
                </div>
              }
            />

            {/* Title and description only — canonical and robots are still
                generated into the output block below, they just are not
                editable clutter in the main flow. */}
            <div className="grid gap-3 lg:grid-cols-2">
              <EditableRow
                label="Title tag"
                value={draft.title}
                onChange={(title) => editDraft({ title })}
                limits={{ min: TITLE_MIN, max: TITLE_MAX }}
              />
              <EditableRow
                label="Meta description"
                value={draft.description}
                onChange={(description) => editDraft({ description })}
                limits={{ min: DESC_MIN, max: DESC_MAX }}
                multiline
              />
            </div>
          </section>

          {/* ── Previews ───────────────────────────────────────────── */}
          <section className="grid items-start gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                icon="search"
                title="Google result preview"
                subtitle="How your edited snippet reads in the SERP"
              />
              <div className="rounded-xl border border-hairline bg-surface-sunken p-4">
                <p className="truncate text-2xs text-ink-secondary">
                  {result.preview.serp.breadcrumb}
                </p>
                <p className="mt-1 text-base font-medium leading-snug text-accent">{draft.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                  {draft.description}
                </p>
              </div>
            </Card>

            <Card>
              <CardHeader
                icon="doc"
                title="Tag audit"
                subtitle="What is on the page today, versus what you are about to publish"
              />
              <ul className="space-y-2">
                {result.fields
                  // Only the two tags this tool now edits.
                  .filter((field) => field.key === 'title' || field.key === 'description')
                  .map((field) => (
                  <li
                    key={field.key}
                    className="flex items-start justify-between gap-3 border-b border-hairline pb-2 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink">{field.label}</p>
                      <p
                        className={cx(
                          'mt-0.5 truncate text-2xs',
                          field.current ? 'text-ink-secondary' : 'italic text-ink-muted',
                        )}
                      >
                        {field.current || 'Not set on the page'}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[field.status]}>{STATUS_LABEL[field.status]}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          {/* ── Output ─────────────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionHeading
              title="Copy the code"
              subtitle="Rebuilt live from your edits above"
            />

            <PasteTarget
              where={
                <>
                  Paste inside <code className="font-mono">&lt;head&gt;</code> … {' '}
                  <code className="font-mono">&lt;/head&gt;</code>
                </>
              }
              detail="Remove the page's existing title, description and og:/twitter: tags first — duplicates make Google pick one at random."
            />

            <div className="grid items-start gap-4 xl:grid-cols-2">
              <CodeBlock
                code={headHtml}
                label="HTML — paste in <head>"
                downloadName="meta-tags.html"
                maxHeight={420}
              />
              <CodeBlock
                code={nextMetadata}
                label="Next.js — app/…/page.tsx"
                downloadName="metadata.ts"
                maxHeight={420}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
