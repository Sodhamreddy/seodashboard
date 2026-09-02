'use client';

import { useMemo, useState } from 'react';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Instructions, PasteTarget } from '@/components/ui/Instructions';
import { Icon } from '@/components/ui/Icon';
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
  Textarea,
  cx,
} from '@/components/ui/primitives';
import { ToolAction, ToolField, ToolForm } from './ToolForm';
import {
  SCHEMA_TEMPLATES,
  buildSchema,
  type SchemaDetection,
  type SchemaTypeKey,
} from '@/lib/seo/schema';

const TYPE_ORDER: SchemaTypeKey[] = [
  'Organization',
  'LocalBusiness',
  'WebSite',
  'Article',
  'Product',
  'Service',
  'FAQPage',
  'BreadcrumbList',
];

export function SchemaTool({ defaultUrl }: { defaultUrl: string }) {
  const [url, setUrl] = useState(defaultUrl);
  const [detection, setDetection] = useState<SchemaDetection | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const [activeType, setActiveType] = useState<SchemaTypeKey>('Organization');
  const [values, setValues] = useState<Record<string, string>>({});

  const template = SCHEMA_TEMPLATES[activeType];
  // Validation and JSON-LD generation are pure functions, so they run inline on
  // every keystroke rather than round-tripping to the server.
  const built = useMemo(() => buildSchema(activeType, values), [activeType, values]);
  const errors = built.issues.filter((issue) => issue.severity === 'error');
  const warnings = built.issues.filter((issue) => issue.severity === 'warning');

  function selectType(type: SchemaTypeKey, prefill?: Record<string, string>) {
    setActiveType(type);
    setValues(prefill ?? detection?.prefill?.[type] ?? {});
  }

  async function detect(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');

    try {
      const response = await fetch('/api/tools/schema', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as SchemaDetection & { error?: string };

      if (!response.ok) {
        setError(data.error ?? 'Detection failed.');
        setDetection(null);
        return;
      }

      setDetection(data);
      // Open on the first recommendation, prefilled from the live page.
      const first = data.recommendations[0]?.type ?? activeType;
      setActiveType(first);
      setValues(data.prefill?.[first] ?? {});
    } catch {
      setError('Network error — could not reach the detector.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Instructions
        title="How to use the Schema Markup Generator"
        icon="code"
        steps={[
          <>
            Enter a page URL and press <strong className="text-ink">Detect existing schema</strong>.
            Any JSON-LD already on the page is read, validated, and used to prefill the generator.
          </>,
          <>
            Pick a schema type below — or click one of the{' '}
            <strong className="text-ink">recommended additions</strong>, which are based on what
            the page actually contains.
          </>,
          <>
            Fill the fields marked <strong className="text-ink">*</strong>. Google requires those;
            nothing is emitted until they are valid.
          </>,
          <>
            Copy the generated <code className="rounded bg-surface-sunken px-1 font-mono">&lt;script&gt;</code>{' '}
            block and paste it inside your page&apos;s{' '}
            <code className="rounded bg-surface-sunken px-1 font-mono">&lt;head&gt;</code>, then confirm
            with Google&apos;s Rich Results Test.
          </>,
        ]}
      />

      {/* ── Detect what already exists ─────────────────────────────── */}
      <Card>
        <ToolForm
          onSubmit={detect}
          hint="Reads every JSON-LD block on the page, validates it, and prefills the generator below."
        >
          <ToolField label="Page URL" htmlFor="schema-url">
            <Input
              id="schema-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/services"
              required
            />
          </ToolField>
          <ToolAction>
            <Button type="submit" loading={pending} icon="search">
              {pending ? 'Reading page…' : 'Detect existing schema'}
            </Button>
          </ToolAction>
        </ToolForm>

        {error && (
          <div className="mt-4">
            <Note tone="critical" icon="alert">
              {error}
            </Note>
          </div>
        )}
      </Card>

      {detection && (
        <section className="grid items-start gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader
              icon="code"
              title="Structured data on the page"
              subtitle={`${detection.blocks} JSON-LD block(s), ${detection.entities.length} entit${detection.entities.length === 1 ? 'y' : 'ies'}, ${detection.microdataItems} microdata item(s)`}
            />

            {detection.parseErrors.length > 0 && (
              <div className="mb-3">
                <Note tone="critical" icon="alert">
                  {detection.parseErrors.length} block(s) are not valid JSON and are ignored entirely by
                  Google: {detection.parseErrors[0].error}
                </Note>
              </div>
            )}

            {detection.entities.length === 0 ? (
              <EmptyState
                icon="code"
                title="No structured data found"
                description="This page is not eligible for any rich result. Generate the markup on the right."
              />
            ) : (
              <ul className="space-y-3">
                {detection.entities.map((entity, index) => (
                  <li key={index} className="rounded-lg border border-hairline bg-surface-sunken p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {entity.types.map((type) => (
                        <Badge key={type} tone="accent" icon={null}>
                          {type}
                        </Badge>
                      ))}
                      {entity.missingRequired.length > 0 ? (
                        <Badge tone="warning">
                          missing {entity.missingRequired.join(', ')}
                        </Badge>
                      ) : (
                        entity.known && <Badge tone="good">required fields present</Badge>
                      )}
                    </div>
                    <dl className="mt-2 space-y-0.5">
                      {entity.keyValues.map((pair) => (
                        <div key={pair.key} className="flex gap-2 text-2xs">
                          <dt className="w-28 shrink-0 truncate font-mono text-ink-muted">{pair.key}</dt>
                          <dd className="min-w-0 flex-1 break-words text-ink-secondary">{pair.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              icon="target"
              title="Recommended additions"
              subtitle="Based on what this page actually contains — URL depth, word count, question headings"
            />
            {detection.recommendations.length === 0 ? (
              <Note tone="good" icon="check">
                Nothing obvious is missing for this page type.
              </Note>
            ) : (
              <ul className="space-y-2">
                {detection.recommendations.map((recommendation) => (
                  <li key={recommendation.type}>
                    <button
                      type="button"
                      onClick={() => selectType(recommendation.type, detection.prefill?.[recommendation.type])}
                      className="flex w-full items-start gap-3 rounded-lg border border-hairline p-3 text-left hover:bg-surface-sunken"
                    >
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
                        <Icon name="plus" size={13} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-ink">
                          {SCHEMA_TEMPLATES[recommendation.type].label}
                        </span>
                        <span className="mt-0.5 block text-2xs leading-relaxed text-ink-secondary">
                          {recommendation.reason}
                        </span>
                        <span className="mt-1 block text-2xs text-ink-muted">
                          Wins: {SCHEMA_TEMPLATES[recommendation.type].richResult}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      {/* ── Generator ──────────────────────────────────────────────── */}
      <section>
        <SectionHeading
          title="Generate markup"
          subtitle="Required fields follow Google's rich-result documentation; validation runs as you type"
        />

        <div className="mb-4 flex flex-wrap gap-1.5">
          {TYPE_ORDER.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => selectType(type)}
              className={cx(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                activeType === type
                  ? 'border-transparent bg-accent text-white'
                  : 'border-hairline text-ink-secondary hover:bg-surface-sunken hover:text-ink',
              )}
            >
              {SCHEMA_TEMPLATES[type].label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title={template.label}
              subtitle={template.description}
              action={
                <a
                  href={template.docs}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-2xs text-accent underline underline-offset-2"
                >
                  Docs <Icon name="external" size={11} />
                </a>
              }
            />

            <div className="mb-4">
              <Badge tone="accent" icon="target">
                {template.richResult}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {template.fields.map((field) => {
                const multiline = field.kind === 'textarea' || field.kind === 'pairs' || field.kind === 'list';
                const fieldError = errors.find((issue) => issue.field === field.name);

                return (
                  <div key={field.name} className={multiline ? 'sm:col-span-2' : undefined}>
                    <Field
                      label={`${field.label}${field.required ? ' *' : ''}`}
                      htmlFor={`schema-${field.name}`}
                      hint={field.help}
                      error={fieldError?.message}
                    >
                      {multiline ? (
                        <Textarea
                          id={`schema-${field.name}`}
                          rows={field.kind === 'textarea' ? 3 : 5}
                          value={values[field.name] ?? ''}
                          placeholder={field.placeholder}
                          onChange={(event) =>
                            setValues((current) => ({ ...current, [field.name]: event.target.value }))
                          }
                        />
                      ) : (
                        <Input
                          id={`schema-${field.name}`}
                          type={field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text'}
                          step={field.kind === 'number' ? 'any' : undefined}
                          value={values[field.name] ?? ''}
                          placeholder={field.placeholder}
                          onChange={(event) =>
                            setValues((current) => ({ ...current, [field.name]: event.target.value }))
                          }
                        />
                      )}
                    </Field>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-4">
            {errors.length > 0 && (
              <Note tone="critical" icon="alert">
                <span className="font-semibold">
                  {errors.length} required field{errors.length > 1 ? 's' : ''} still missing or invalid.
                </span>{' '}
                Nothing is emitted until Google&apos;s required properties are satisfied.
              </Note>
            )}

            {warnings.length > 0 && (
              <Note tone="warning" icon="alert">
                <ul className="space-y-1">
                  {warnings.map((issue, index) => (
                    <li key={index}>{issue.message}</li>
                  ))}
                </ul>
              </Note>
            )}

            {built.scriptTag ? (
              <>
                <PasteTarget
                  where={
                    <>
                      Paste this inside{' '}
                      <code className="font-mono">&lt;head&gt;</code> …{' '}
                      <code className="font-mono">&lt;/head&gt;</code> — the whole{' '}
                      <code className="font-mono">&lt;script&gt;</code> tag, not just the JSON
                    </>
                  }
                  detail="Position within <head> does not matter. Everything asserted in the markup must also be visible to a visitor on the page — hidden content is a manual-action risk."
                />
                <CodeBlock
                  code={built.scriptTag}
                  label={`${activeType} JSON-LD`}
                  downloadName={`${activeType.toLowerCase()}-schema.html`}
                  maxHeight={520}
                />
                <Note tone="neutral" icon="external">
                  Paste into <code className="font-mono">&lt;head&gt;</code>, then confirm with the{' '}
                  <a
                    href={built.validatorUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline underline-offset-2"
                  >
                    Rich Results Test
                  </a>
                  . Everything asserted in markup must also be visible on the page.
                </Note>
              </>
            ) : (
              <EmptyState
                icon="code"
                title="Fill the required fields"
                description="Marked with an asterisk. The JSON-LD appears here the moment the markup would actually be valid."
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
