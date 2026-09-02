'use client';

import { useEffect, useState } from 'react';

/**
 * Opens the browser print dialog once the report has painted.
 *
 * Waits two animation frames rather than firing on mount: Recharts sizes its
 * SVGs from a ResizeObserver, and printing before that settles yields a
 * document with collapsed charts. The manual button stays visible either way,
 * because a blocked or dismissed dialog must not leave the page with no way to
 * export.
 */
export function AutoPrint({ auto }: { auto: boolean }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    let timer = 0;

    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setReady(true);
        if (auto) {
          // A short settle window on top of the frames — charts finish their
          // enter animation in ~300ms and print sharper afterwards.
          timer = window.setTimeout(() => window.print(), 450);
        }
      });
    });

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
    };
  }, [auto]);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      disabled={!ready}
      className="no-print inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-xs font-medium text-white shadow-card transition-opacity disabled:opacity-50"
    >
      {ready ? 'Save as PDF' : 'Preparing…'}
    </button>
  );
}
