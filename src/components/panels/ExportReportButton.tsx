'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { RangeKey } from '@/lib/range';

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/**
 * Export menu for the Overview.
 *
 * Two formats, because they answer different questions. The PDF is the
 * client-facing document — it opens `/report`, which lays the same figures out
 * as a paginated A4 sheet and triggers the browser's own "Save as PDF", so the
 * output keeps vector text and selectable tables without a PDF library in the
 * bundle. The CSV is the analyst's copy, and is still read out of the rendered
 * DOM so the file can never disagree with what is on screen.
 */
export function ExportReportButton({
  domain,
  range,
  customWindow,
}: {
  domain: string;
  range: RangeKey | 'custom';
  /** Present for a custom range; forwarded so the PDF opens on the same dates. */
  customWindow?: { from: string; to: string };
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

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

  function openPdf() {
    setOpen(false);

    // The report must open on exactly the window on screen. Forwarding only the
    // `range` key would send `range=custom` with no dates, and `/report` would
    // fall back to 30 days — a PDF quietly covering a different period from the
    // page it was exported from.
    const params = new URLSearchParams({ range, print: '1' });
    if (range === 'custom' && customWindow) {
      params.set('from', customWindow.from);
      params.set('to', customWindow.to);
    }

    // A new tab rather than a navigation: the operator keeps the console open
    // behind the print dialog, which is how this gets used repeatedly.
    window.open(`/report?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  function exportCsv() {
    setOpen(false);
    const rows: string[][] = [['Section', 'Metric', 'Value', 'Detail']];

    // Stat tiles: label, headline value, and the footnote/delta beneath it.
    document.querySelectorAll('[data-stat-tile]').forEach((tile) => {
      const label = tile.querySelector('[data-stat-label]')?.textContent?.trim() ?? '';
      const value = tile.querySelector('[data-stat-value]')?.textContent?.trim() ?? '';
      const detail = tile.querySelector('[data-stat-detail]')?.textContent?.trim() ?? '';
      if (label) rows.push(['Headline metrics', label, value, detail]);
    });

    // Meters: budget pacing and the health pillars.
    document.querySelectorAll('[data-meter]').forEach((meter) => {
      const label = meter.querySelector('[data-meter-label]')?.textContent?.trim() ?? '';
      const value = meter.querySelector('[data-meter-value]')?.textContent?.trim() ?? '';
      if (label) rows.push(['Meters', label, value, '']);
    });

    const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
    const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n');

    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const windowTag =
      range === 'custom' && customWindow
        ? `${customWindow.from}_to_${customWindow.to}`
        : range;
    anchor.download = `${domain}-overview-${windowTag}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);

    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }

  const items = [
    {
      key: 'pdf',
      icon: 'printer' as const,
      label: 'PDF report',
      hint: 'Branded A4 document for the client',
      onClick: openPdf,
    },
    {
      key: 'csv',
      icon: 'download' as const,
      label: 'CSV data',
      hint: 'Headline metrics and meters as a spreadsheet',
      onClick: exportCsv,
    },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-lg border border-hairline bg-surface px-3 text-xs font-medium text-ink transition-colors hover:bg-surface-sunken"
      >
        <Icon name={done ? 'check' : 'download'} size={14} className="text-ink-muted" />
        {done ? 'Exported' : 'Export report'}
        <Icon name="chevronDown" size={13} className="text-ink-muted" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-hairline bg-surface-raised p-2 shadow-lift"
        >
          <p className="mb-1.5 px-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Export
          </p>
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={item.onClick}
                  className={cx(
                    'flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
                    'text-ink hover:bg-surface-sunken',
                  )}
                >
                  <Icon name={item.icon} size={14} className="mt-0.5 shrink-0 text-ink-muted" />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{item.label}</span>
                    <span className="block text-2xs leading-relaxed text-ink-muted">
                      {item.hint}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
