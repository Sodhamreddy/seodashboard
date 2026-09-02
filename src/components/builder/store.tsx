'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import {
  resolveMetric,
  sampleMetric,
  type MetricLookup,
  type MetricValue,
} from '@/lib/builder/data';
import { loadDoc, pushRevision, saveDoc } from '@/lib/builder/persist';
import { PLACEHOLDER_CLIENT, starterDoc } from '@/lib/builder/templates';
import {
  clonePage,
  cloneSection,
  cloneWidget,
  GRID_COLS,
  type Benchmark,
  type CustomMetric,
  type RangeKey,
  type ReportDoc,
  type ReportPage,
  type Section,
  type Widget,
} from '@/lib/builder/types';

/**
 * Editor state.
 *
 * The document is immutable and every action returns a new one, which is what
 * makes undo/redo two arrays of references rather than a diff engine. Actions
 * that fire continuously during a pointer drag pass `history: false` and are
 * preceded by one `snapshot` — otherwise a single resize would fill the undo
 * stack with sixty intermediate widths.
 */

export type Selection = { sectionId: string; widgetId: string } | null;

export type RightTab = 'ai' | 'metrics' | 'views' | 'content' | 'media' | 'custom' | 'benchmarks';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type LiveCache = {
  range: RangeKey;
  /** Which client the cached metrics belong to; '' means the session default. */
  domain: string;
  metrics: Record<string, MetricValue>;
} | null;

export type EditorState = {
  doc: ReportDoc;
  past: ReportDoc[];
  future: ReportDoc[];
  activePageId: string;
  selection: Selection;
  zoom: number;
  viewport: 'desktop' | 'mobile';
  preview: boolean;
  rightTab: RightTab;
  saveState: SaveState;
  live: LiveCache;
  liveStatus: 'idle' | 'loading' | 'ready' | 'error';
  lastRevisionAt: number;
};

const HISTORY_LIMIT = 60;

export type Action =
  | { type: 'replaceDoc'; doc: ReportDoc; resetHistory?: boolean }
  | { type: 'patchDoc'; patch: Partial<ReportDoc>; history?: boolean }
  | { type: 'snapshot' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'addPage'; page: ReportPage }
  | { type: 'updatePage'; pageId: string; patch: Partial<ReportPage> }
  | { type: 'removePage'; pageId: string }
  | { type: 'duplicatePage'; pageId: string }
  | { type: 'setActivePage'; pageId: string }
  | { type: 'addSection'; section: Section; index?: number }
  | { type: 'updateSection'; sectionId: string; patch: Partial<Section>; history?: boolean }
  | { type: 'removeSection'; sectionId: string }
  | { type: 'duplicateSection'; sectionId: string }
  | { type: 'moveSection'; sectionId: string; toIndex: number }
  | {
      type: 'addWidget';
      sectionId: string;
      widget: Widget;
      index?: number;
      select?: boolean;
      /**
       * Treat `widget.span` as page columns and convert it to the target
       * section's inner columns. Library defaults are page-relative ("a stat is
       * a quarter of a page"); preset sections already state section-relative
       * spans and must not be rescaled.
       */
      scaleToSection?: boolean;
    }
  | {
      type: 'updateWidget';
      sectionId: string;
      widgetId: string;
      patch: Partial<Widget>;
      history?: boolean;
    }
  | { type: 'removeWidget'; sectionId: string; widgetId: string }
  | { type: 'duplicateWidget'; sectionId: string; widgetId: string }
  | {
      type: 'moveWidget';
      from: { sectionId: string; widgetId: string };
      to: { sectionId: string; index: number };
    }
  | { type: 'addCustomMetric'; metric: CustomMetric }
  | { type: 'removeCustomMetric'; metricId: string }
  | { type: 'setBenchmark'; benchmark: Benchmark }
  | { type: 'removeBenchmark'; metricId: string }
  | { type: 'select'; selection: Selection }
  | { type: 'setZoom'; zoom: number }
  | { type: 'setViewport'; viewport: 'desktop' | 'mobile' }
  | { type: 'setPreview'; preview: boolean }
  | { type: 'setRightTab'; tab: RightTab }
  | { type: 'setSaveState'; saveState: SaveState }
  | { type: 'setLive'; live: LiveCache }
  | { type: 'setLiveStatus'; status: EditorState['liveStatus'] }
  | { type: 'markRevision'; at: number };

export function initialState(doc: ReportDoc): EditorState {
  return {
    doc,
    past: [],
    future: [],
    activePageId: doc.pages[0]?.id ?? '',
    selection: null,
    zoom: 1,
    viewport: 'desktop',
    preview: false,
    rightTab: 'metrics',
    saveState: 'idle',
    live: null,
    liveStatus: 'idle',
    lastRevisionAt: 0,
  };
}

/** Wrap a document change so it lands on the undo stack. */
function commit(state: EditorState, doc: ReportDoc, history = true): EditorState {
  const stamped = { ...doc, updatedAt: new Date().toISOString() };
  if (!history) return { ...state, doc: stamped };
  return {
    ...state,
    doc: stamped,
    past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
  };
}

function mapPage(doc: ReportDoc, pageId: string, fn: (page: ReportPage) => ReportPage): ReportDoc {
  return { ...doc, pages: doc.pages.map((page) => (page.id === pageId ? fn(page) : page)) };
}

/** Section edits are page-agnostic: find whichever page owns the section. */
function mapSection(
  doc: ReportDoc,
  sectionId: string,
  fn: (section: Section) => Section,
): ReportDoc {
  return {
    ...doc,
    pages: doc.pages.map((page) =>
      page.sections.some((section) => section.id === sectionId)
        ? {
            ...page,
            sections: page.sections.map((section) =>
              section.id === sectionId ? fn(section) : section,
            ),
          }
        : page,
    ),
  };
}

function clampSpan(span: number) {
  return Math.min(GRID_COLS, Math.max(1, Math.round(span)));
}

export function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'replaceDoc': {
      const next = {
        ...state,
        doc: action.doc,
        activePageId: action.doc.pages.some((page) => page.id === state.activePageId)
          ? state.activePageId
          : action.doc.pages[0]?.id ?? '',
        selection: null,
      };
      if (action.resetHistory) return { ...next, past: [], future: [] };
      return { ...next, past: [...state.past, state.doc].slice(-HISTORY_LIMIT), future: [] };
    }

    case 'patchDoc':
      return commit(state, { ...state.doc, ...action.patch }, action.history ?? true);

    case 'snapshot':
      return { ...state, past: [...state.past, state.doc].slice(-HISTORY_LIMIT), future: [] };

    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
        activePageId: previous.pages.some((page) => page.id === state.activePageId)
          ? state.activePageId
          : previous.pages[0]?.id ?? '',
      };
    }

    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        doc: next,
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        activePageId: next.pages.some((page) => page.id === state.activePageId)
          ? state.activePageId
          : next.pages[0]?.id ?? '',
      };
    }

    case 'addPage':
      return {
        ...commit(state, { ...state.doc, pages: [...state.doc.pages, action.page] }),
        activePageId: action.page.id,
      };

    case 'updatePage':
      return commit(
        state,
        mapPage(state.doc, action.pageId, (page) => ({ ...page, ...action.patch })),
      );

    case 'removePage': {
      if (state.doc.pages.length <= 1) return state;
      const pages = state.doc.pages.filter((page) => page.id !== action.pageId);
      return {
        ...commit(state, { ...state.doc, pages }),
        activePageId: state.activePageId === action.pageId ? pages[0].id : state.activePageId,
        selection: null,
      };
    }

    case 'duplicatePage': {
      const index = state.doc.pages.findIndex((page) => page.id === action.pageId);
      if (index < 0) return state;
      const copy = clonePage(state.doc.pages[index]);
      copy.title = `${copy.title} copy`;
      const pages = [...state.doc.pages];
      pages.splice(index + 1, 0, copy);
      return { ...commit(state, { ...state.doc, pages }), activePageId: copy.id };
    }

    case 'setActivePage':
      return { ...state, activePageId: action.pageId, selection: null };

    case 'addSection': {
      return commit(
        state,
        mapPage(state.doc, state.activePageId, (page) => {
          const sections = [...page.sections];
          sections.splice(action.index ?? sections.length, 0, action.section);
          return { ...page, sections };
        }),
      );
    }

    case 'updateSection':
      return commit(
        state,
        mapSection(state.doc, action.sectionId, (section) => ({
          ...section,
          ...action.patch,
          span: action.patch.span === undefined ? section.span : clampSpan(action.patch.span),
        })),
        action.history ?? true,
      );

    case 'removeSection':
      return {
        ...commit(state, {
          ...state.doc,
          pages: state.doc.pages.map((page) => ({
            ...page,
            sections: page.sections.filter((section) => section.id !== action.sectionId),
          })),
        }),
        selection: null,
      };

    case 'duplicateSection': {
      const page = state.doc.pages.find((candidate) =>
        candidate.sections.some((section) => section.id === action.sectionId),
      );
      if (!page) return state;
      const index = page.sections.findIndex((section) => section.id === action.sectionId);
      const copy = cloneSection(page.sections[index]);
      const sections = [...page.sections];
      sections.splice(index + 1, 0, copy);
      return commit(state, mapPage(state.doc, page.id, (target) => ({ ...target, sections })));
    }

    case 'moveSection': {
      const page = state.doc.pages.find((candidate) =>
        candidate.sections.some((section) => section.id === action.sectionId),
      );
      if (!page) return state;
      const from = page.sections.findIndex((section) => section.id === action.sectionId);
      const to = Math.min(page.sections.length - 1, Math.max(0, action.toIndex));
      if (from === to) return state;
      const sections = [...page.sections];
      const [moved] = sections.splice(from, 1);
      sections.splice(to, 0, moved);
      return commit(state, mapPage(state.doc, page.id, (target) => ({ ...target, sections })));
    }

    case 'addWidget': {
      const next = commit(
        state,
        mapSection(state.doc, action.sectionId, (section) => {
          const widgets = [...section.widgets];
          const span = action.scaleToSection
            ? clampSpan((action.widget.span * GRID_COLS) / section.span)
            : action.widget.span;
          widgets.splice(action.index ?? widgets.length, 0, { ...action.widget, span });
          return { ...section, widgets };
        }),
      );
      return action.select === false
        ? next
        : { ...next, selection: { sectionId: action.sectionId, widgetId: action.widget.id } };
    }

    case 'updateWidget':
      return commit(
        state,
        mapSection(state.doc, action.sectionId, (section) => ({
          ...section,
          widgets: section.widgets.map((widget) =>
            widget.id === action.widgetId
              ? {
                  ...widget,
                  ...action.patch,
                  span: action.patch.span === undefined ? widget.span : clampSpan(action.patch.span),
                  rows:
                    action.patch.rows === undefined
                      ? widget.rows
                      : Math.min(24, Math.max(1, Math.round(action.patch.rows))),
                }
              : widget,
          ),
        })),
        action.history ?? true,
      );

    case 'removeWidget':
      return {
        ...commit(
          state,
          mapSection(state.doc, action.sectionId, (section) => ({
            ...section,
            widgets: section.widgets.filter((widget) => widget.id !== action.widgetId),
          })),
        ),
        selection:
          state.selection?.widgetId === action.widgetId ? null : state.selection,
      };

    case 'duplicateWidget': {
      const section = state.doc.pages
        .flatMap((page) => page.sections)
        .find((candidate) => candidate.id === action.sectionId);
      if (!section) return state;
      const index = section.widgets.findIndex((widget) => widget.id === action.widgetId);
      if (index < 0) return state;
      const copy = cloneWidget(section.widgets[index]);
      return {
        ...commit(
          state,
          mapSection(state.doc, action.sectionId, (target) => {
            const widgets = [...target.widgets];
            widgets.splice(index + 1, 0, copy);
            return { ...target, widgets };
          }),
        ),
        selection: { sectionId: action.sectionId, widgetId: copy.id },
      };
    }

    case 'moveWidget': {
      const { from, to } = action;
      const source = state.doc.pages
        .flatMap((page) => page.sections)
        .find((section) => section.id === from.sectionId);
      const moved = source?.widgets.find((widget) => widget.id === from.widgetId);
      if (!moved) return state;

      // Removing first shifts later indices in the same section, so the target
      // index is corrected before the insert rather than after.
      const sameSection = from.sectionId === to.sectionId;
      const fromIndex = source!.widgets.findIndex((widget) => widget.id === from.widgetId);
      const targetIndex = sameSection && to.index > fromIndex ? to.index - 1 : to.index;

      let doc = mapSection(state.doc, from.sectionId, (section) => ({
        ...section,
        widgets: section.widgets.filter((widget) => widget.id !== from.widgetId),
      }));
      doc = mapSection(doc, to.sectionId, (section) => {
        const widgets = [...section.widgets];
        widgets.splice(Math.min(Math.max(0, targetIndex), widgets.length), 0, moved);
        return { ...section, widgets };
      });

      return {
        ...commit(state, doc),
        selection: { sectionId: to.sectionId, widgetId: moved.id },
      };
    }

    case 'addCustomMetric':
      return commit(state, {
        ...state.doc,
        customMetrics: [...state.doc.customMetrics, action.metric],
      });

    case 'removeCustomMetric':
      return commit(state, {
        ...state.doc,
        customMetrics: state.doc.customMetrics.filter((metric) => metric.id !== action.metricId),
      });

    case 'setBenchmark':
      return commit(state, {
        ...state.doc,
        benchmarks: [
          ...state.doc.benchmarks.filter((entry) => entry.metricId !== action.benchmark.metricId),
          action.benchmark,
        ],
      });

    case 'removeBenchmark':
      return commit(state, {
        ...state.doc,
        benchmarks: state.doc.benchmarks.filter((entry) => entry.metricId !== action.metricId),
      });

    case 'select':
      return { ...state, selection: action.selection };

    case 'setZoom':
      return { ...state, zoom: Math.min(1.5, Math.max(0.5, Number(action.zoom.toFixed(2)))) };

    case 'setViewport':
      return { ...state, viewport: action.viewport };

    case 'setPreview':
      return { ...state, preview: action.preview, selection: null };

    case 'setRightTab':
      return { ...state, rightTab: action.tab };

    case 'setSaveState':
      return { ...state, saveState: action.saveState };

    case 'setLive':
      return { ...state, live: action.live };

    case 'setLiveStatus':
      return { ...state, liveStatus: action.status };

    case 'markRevision':
      return { ...state, lastRevisionAt: action.at };

    default:
      return state;
  }
}

/* ── Context ───────────────────────────────────────────────────────── */

type BuilderContextValue = {
  state: EditorState;
  dispatch: Dispatch<Action>;
};

const BuilderContext = createContext<BuilderContextValue | null>(null);

const REVISION_INTERVAL_MS = 120_000;

export function BuilderProvider({ children }: { children: ReactNode }) {
  // Loading from localStorage happens in the initialiser, which only runs on the
  // client because the whole editor is mounted behind a client-only gate.
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialState(loadDoc() ?? starterDoc()),
  );

  // Autosave — debounced so typing a report title is one write, not thirty.
  useEffect(() => {
    dispatch({ type: 'setSaveState', saveState: 'saving' });
    const timer = window.setTimeout(() => {
      const ok = saveDoc(state.doc);
      dispatch({ type: 'setSaveState', saveState: ok ? 'saved' : 'error' });

      const now = Date.now();
      if (ok && now - state.lastRevisionAt > REVISION_INTERVAL_MS) {
        pushRevision(state.doc);
        dispatch({ type: 'markRevision', at: now });
      }
    }, 700);
    return () => window.clearTimeout(timer);
    // Revision bookkeeping intentionally does not retrigger the save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.doc]);

  /*
   * Live data — refetched whenever the range OR the client changes, and only
   * while the report is in Live mode. Keying the cache on the domain as well as
   * the range is what makes switching client actually reload the numbers;
   * without it, a range-only guard served the previous client's metrics.
   */
  const liveDomain = state.doc.clientDomain ?? '';
  useEffect(() => {
    if (state.doc.dataMode !== 'live') return;
    if (state.live?.range === state.doc.range && state.live?.domain === liveDomain) return;

    const controller = new AbortController();
    dispatch({ type: 'setLiveStatus', status: 'loading' });

    const query = new URLSearchParams({ range: state.doc.range });
    if (liveDomain) query.set('domain', liveDomain);

    fetch(`/api/builder/live?${query.toString()}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('failed'))))
      .then((payload: { metrics: Record<string, MetricValue> }) => {
        dispatch({
          type: 'setLive',
          live: { range: state.doc.range, domain: liveDomain, metrics: payload.metrics },
        });
        dispatch({ type: 'setLiveStatus', status: 'ready' });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        dispatch({ type: 'setLiveStatus', status: 'error' });
      });

    return () => controller.abort();
  }, [
    state.doc.dataMode,
    state.doc.range,
    liveDomain,
    state.live?.range,
    state.live?.domain,
  ]);

  /*
   * Adopt the real client on first load.
   *
   * A brand-new document is seeded with the placeholder name because the
   * template module is synchronous and cannot read the roster. Once the roster
   * arrives, an untouched placeholder is replaced with the active client so the
   * builder shows the client the operator actually added. A document whose name
   * has been edited is left alone — this must never overwrite a real title.
   */
  useEffect(() => {
    // Runs whenever the document is UNBOUND, not only when it still carries the
    // placeholder name. Docs saved while `sanitizeDoc` was dropping
    // `clientDomain` are named correctly but bound to nothing, and a
    // placeholder-only check would leave them broken forever.
    if (state.doc.clientDomain) return;

    const controller = new AbortController();
    fetch('/api/clients', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('failed'))))
      .then((payload: { clients?: { name: string; domain: string }[]; activeDomain?: string }) => {
        const roster = payload.clients ?? [];
        if (roster.length === 0) return;

        // Prefer the roster entry this report is already named after, so
        // re-binding an existing document does not silently move it to a
        // different client. Fall back to the session's active client.
        const byName = roster.find(
          (client) => client.name.toLowerCase() === state.doc.client.trim().toLowerCase(),
        );
        const target =
          byName ??
          roster.find((client) => client.domain === payload.activeDomain) ??
          roster[0];

        dispatch({
          type: 'patchDoc',
          // The name is only overwritten while it is still the placeholder; a
          // report the operator has titled keeps its title.
          patch:
            state.doc.client === PLACEHOLDER_CLIENT
              ? { client: target.name, clientDomain: target.domain }
              : { clientDomain: target.domain },
          history: false,
        });
      })
      .catch(() => {
        // No roster is a valid state — the placeholder simply stays.
      });

    return () => controller.abort();
    // Intentionally mount-only: re-running on every doc edit would fight the
    // operator if they deliberately renamed a report back to the placeholder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>;
}

export function useBuilder() {
  const context = useContext(BuilderContext);
  if (!context) throw new Error('useBuilder must be used inside <BuilderProvider>');
  return context;
}

export function useActivePage() {
  const { state } = useBuilder();
  return state.doc.pages.find((page) => page.id === state.activePageId) ?? state.doc.pages[0];
}

/**
 * The single place a widget gets its numbers from. In sample mode this is a pure
 * function of (metric, range); in live mode it reads the fetched cache and
 * reports loading / failure rather than falling back to sample values.
 */
export function useMetricLookup() {
  const { state } = useBuilder();
  const { dataMode, range } = state.doc;
  const live = state.live;
  const liveStatus = state.liveStatus;

  const lookup = useCallback<MetricLookup>(
    (metricId) => {
      if (dataMode === 'sample') return sampleMetric(metricId, range);
      if (!live || live.range !== range) {
        return {
          state: 'unavailable',
          reason: liveStatus === 'error' ? 'Live data request failed' : 'Loading live data…',
        };
      }
      return live.metrics[metricId] ?? { state: 'unavailable', reason: 'No live adapter' };
    },
    [dataMode, range, live, liveStatus],
  );

  const resolve = useCallback(
    (metricId: string | undefined) =>
      resolveMetric(metricId, { lookup, customMetrics: state.doc.customMetrics }),
    [lookup, state.doc.customMetrics],
  );

  return { lookup, resolve };
}
