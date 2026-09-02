'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import {
  DASH_RANGES,
  earliestSelectableDate,
  isoToday,
  normalizeWindow,
  type RangeKey,
} from '@/lib/range';

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/**
 * The reporting-window switcher.
 *
 * The selected window lives in the URL rather than a cookie so a report link
 * carries its own window — pasting "?range=90d" into Slack shows the reader the
 * same 90 days the sender was looking at. The Overview page is already
 * `force-dynamic`, so pushing a new search param re-runs the server render with
 * the wider provider call; there is no client-side refetch to keep in sync.
 */
export function RangeFilter({
  active,
  windowLabel,
  activeLabel,
  customWindow,
}: {
  active: RangeKey | 'custom';
  /** The real first–last date span of the data, shown under the label. */
  windowLabel: string;
  /** The resolved label, so a custom range can name its own dates. */
  activeLabel?: string;
  /** The dates currently in force, used to seed the custom inputs. */
  customWindow?: { from: string; to: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<RangeKey | 'custom' | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // The custom panel opens already showing whatever window is in force, so
  // editing one end of an existing range does not mean retyping both.
  const [showCustom, setShowCustom] = useState(active === 'custom');
  const [from, setFrom] = useState(customWindow?.from ?? '');
  const [to, setTo] = useState(customWindow?.to ?? '');
  const [customError, setCustomError] = useState('');

  // Close on outside click and on Escape, the same as the client switcher.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // The pending highlight is cleared by the server render arriving with the new
  // `active` value, not by a timer.
  useEffect(() => {
    setPending(null);
  }, [active]);

  function choose(key: RangeKey) {
    setOpen(false);
    if (key === active) return;
    setPending(key);

    const params = new URLSearchParams(searchParams.toString());
    params.set('range', key);
    // A preset supersedes any custom dates; leaving them in the URL would make
    // the link ambiguous about which one applies.
    params.delete('from');
    params.delete('to');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function applyCustom() {
    // Validated with the same function the server uses, so the picker cannot
    // accept a window the page will then silently reject.
    const normalized = normalizeWindow(from, to);
    if (!normalized) {
      setCustomError(
        'Enter a start and end date. The range must be in the past and under three years.',
      );
      return;
    }

    setCustomError('');
    setOpen(false);
    setPending('custom');

    const params = new URLSearchParams(searchParams.toString());
    params.set('range', 'custom');
    params.set('from', normalized.from);
    params.set('to', normalized.to);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const activeMeta = DASH_RANGES.find((range) => range.key === active) ?? DASH_RANGES[1];
  const triggerLabel = active === 'custom' ? (activeLabel ?? 'Custom range') : activeMeta.label;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Change reporting window"
        aria-expanded={open}
        title={`${triggerLabel} · ${windowLabel}`}
        className="flex h-9 items-center gap-2 rounded-lg border border-hairline bg-surface px-3 text-2xs text-ink-secondary transition-colors hover:bg-surface-sunken"
      >
        <Icon name="calendar" size={13} className="text-ink-muted" />
        <span className="font-medium text-ink">{triggerLabel}</span>
        <span className="tnum hidden text-ink-muted sm:inline">{windowLabel}</span>
        <Icon name="chevronDown" size={13} className="text-ink-muted" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-hairline bg-surface-raised p-2 shadow-lift"
        >
          <p className="mb-1.5 px-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Reporting window
          </p>
          <ul className="space-y-0.5">
            {DASH_RANGES.map((range) => {
              const isActive = range.key === active;
              return (
                <li key={range.key}>
                  <button
                    type="button"
                    onClick={() => choose(range.key)}
                    className={cx(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                      isActive
                        ? 'bg-accent-soft font-medium text-accent'
                        : 'text-ink hover:bg-surface-sunken',
                    )}
                  >
                    <span className="flex-1">{range.label}</span>
                    <span className="tnum text-2xs text-ink-muted">{range.days}d</span>
                    {isActive && <Icon name="check" size={13} className="shrink-0" />}
                    {pending === range.key && !isActive && (
                      <Icon name="refresh" size={13} className="shrink-0 animate-spin" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {/* ── Custom range ──────────────────────────────────────── */}
          <div className="mt-1.5 border-t border-hairline pt-1.5">
            <button
              type="button"
              onClick={() => setShowCustom((current) => !current)}
              className={cx(
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                active === 'custom'
                  ? 'bg-accent-soft font-medium text-accent'
                  : 'text-ink hover:bg-surface-sunken',
              )}
            >
              <Icon name="calendar" size={13} />
              <span className="flex-1">Custom range</span>
              {active === 'custom' && <Icon name="check" size={13} className="shrink-0" />}
              <Icon name={showCustom ? 'chevronDown' : 'chevronRight'} size={13} />
            </button>

            {showCustom && (
              <div className="mt-1.5 space-y-2 px-1.5 pb-1">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-2xs font-medium text-ink-secondary">From</span>
                    <input
                      type="date"
                      value={from}
                      min={earliestSelectableDate()}
                      max={isoToday()}
                      onChange={(event) => setFrom(event.target.value)}
                      className="h-8 w-full rounded-lg border border-hairline bg-surface px-2 text-2xs text-ink focus:border-accent focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-2xs font-medium text-ink-secondary">To</span>
                    <input
                      type="date"
                      value={to}
                      min={from || earliestSelectableDate()}
                      max={isoToday()}
                      onChange={(event) => setTo(event.target.value)}
                      className="h-8 w-full rounded-lg border border-hairline bg-surface px-2 text-2xs text-ink focus:border-accent focus:outline-none"
                    />
                  </label>
                </div>

                {customError && (
                  <p className="text-2xs leading-relaxed text-status-critical">{customError}</p>
                )}

                <button
                  type="button"
                  onClick={applyCustom}
                  className="btn-accent flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-2xs font-medium"
                >
                  <Icon name="check" size={12} />
                  Apply range
                </button>
              </div>
            )}
          </div>

          <p className="mt-1.5 border-t border-hairline px-1.5 pt-1.5 text-2xs leading-relaxed text-ink-muted">
            Applies to paid media, traffic and Search Console. Backlinks report
            current totals only, and rank tracking has its own fixed history — neither
            follows a historical window.
          </p>
        </div>
      )}
    </div>
  );
}
