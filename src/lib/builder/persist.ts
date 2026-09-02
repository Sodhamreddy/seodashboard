import { GRID_COLS, type ReportDoc } from './types';
import { starterDoc } from './templates';

/**
 * Browser-side persistence.
 *
 * The document lives in localStorage: autosave writes the current document,
 * and a separate ring of revisions gives the history button something to restore
 * from. Both are guarded — a corrupt or hand-edited entry must degrade to the
 * starter document, never throw during render.
 */

const DOC_KEY = 'seodash-report-builder-v1';
const REVISIONS_KEY = 'seodash-report-builder-revisions-v1';
const MAX_REVISIONS = 20;

export type Revision = { at: string; name: string; doc: ReportDoc };

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

/**
 * Coerce anything claiming to be a document into a valid one, or return null.
 * Spans and row counts are clamped rather than rejected: a slightly wrong number
 * from an older build should not cost the user their whole report.
 */
export function sanitizeDoc(input: unknown): ReportDoc | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Partial<ReportDoc>;
  if (candidate.version !== 1 || !Array.isArray(candidate.pages) || candidate.pages.length === 0) {
    return null;
  }

  const template = starterDoc();

  return {
    version: 1,
    id: typeof candidate.id === 'string' ? candidate.id : template.id,
    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : 'Dashboard',
    client: typeof candidate.client === 'string' ? candidate.client : template.client,
    // Whitelisted explicitly: this sanitiser rebuilds the doc field by field, so
    // anything not listed is dropped on every load. Omitting clientDomain made
    // the picker's binding vanish on reload and the top bar read
    // "Not linked to a client" even though a client had been chosen.
    clientDomain:
      typeof candidate.clientDomain === 'string' && candidate.clientDomain.includes('.')
        ? candidate.clientDomain
        : undefined,
    range: candidate.range ?? template.range,
    dataMode: candidate.dataMode === 'live' ? 'live' : 'sample',
    accent: candidate.accent ?? template.accent,
    density: candidate.density === 'compact' ? 'compact' : 'comfortable',
    pageSetup: { ...template.pageSetup, ...(candidate.pageSetup ?? {}) },
    customMetrics: Array.isArray(candidate.customMetrics) ? candidate.customMetrics : [],
    benchmarks: Array.isArray(candidate.benchmarks) ? candidate.benchmarks : [],
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    pages: candidate.pages.map((page, pageIndex) => ({
      id: typeof page?.id === 'string' ? page.id : `p_restored_${pageIndex}`,
      title: typeof page?.title === 'string' ? page.title : `Page ${pageIndex + 1}`,
      sections: (Array.isArray(page?.sections) ? page.sections : []).map((section, sectionIndex) => ({
        id: typeof section?.id === 'string' ? section.id : `s_restored_${pageIndex}_${sectionIndex}`,
        title: typeof section?.title === 'string' ? section.title : 'Untitled Section',
        span: clamp(section?.span, 1, GRID_COLS, GRID_COLS),
        banner: section?.banner !== false,
        tone: section?.tone ?? 'ink',
        collapsed: section?.collapsed === true,
        widgets: (Array.isArray(section?.widgets) ? section.widgets : []).map((widget, widgetIndex) => ({
          ...widget,
          id: typeof widget?.id === 'string'
            ? widget.id
            : `w_restored_${pageIndex}_${sectionIndex}_${widgetIndex}`,
          kind: widget?.kind ?? 'stat',
          span: clamp(widget?.span, 1, GRID_COLS, 3),
          rows: clamp(widget?.rows, 1, 24, 3),
        })),
      })),
    })),
  };
}

export function loadDoc(): ReportDoc | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DOC_KEY);
    return raw ? sanitizeDoc(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveDoc(doc: ReportDoc) {
  try {
    window.localStorage.setItem(DOC_KEY, JSON.stringify(doc));
    return true;
  } catch {
    // Private mode or quota — the editor keeps working, autosave just reports it.
    return false;
  }
}

export function loadRevisions(): Revision[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(REVISIONS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Revision[]) : [];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && entry.doc) : [];
  } catch {
    return [];
  }
}

export function pushRevision(doc: ReportDoc, label?: string) {
  const revisions = loadRevisions();
  const next: Revision[] = [
    { at: new Date().toISOString(), name: label ?? doc.name, doc },
    ...revisions,
  ].slice(0, MAX_REVISIONS);
  try {
    window.localStorage.setItem(REVISIONS_KEY, JSON.stringify(next));
  } catch {
    /* history is best-effort */
  }
  return next;
}

/* ── Export / import ───────────────────────────────────────────────── */

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
}

export function downloadDoc(doc: ReportDoc) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${slug(doc.name)}.report.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readDocFile(file: File): Promise<ReportDoc | null> {
  try {
    return sanitizeDoc(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
