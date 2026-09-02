'use client';

import { useState } from 'react';
import { Icon } from './Icon';
import { cx } from './primitives';

/**
 * A compact, copyable code suggestion shown inline next to a finding.
 *
 * Distinct from `CodeBlock`, which is a full-width output panel with a header
 * and download. This is the "here is the exact line to paste" affordance that
 * sits inside a list item, so it stays visually quiet until you look at it.
 */
export function InlineSnippet({
  code,
  label,
  className,
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cx('overflow-hidden rounded-lg border border-hairline bg-surface-sunken', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-2.5 py-1.5">
        <span className="truncate text-2xs font-medium uppercase tracking-[0.06em] text-accent">
          {label ?? 'Suggested change'}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label ?? 'suggested change'}`}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-2xs font-medium text-ink-secondary transition-colors hover:bg-surface-raised hover:text-ink"
        >
          <Icon name={copied ? 'check' : 'copy'} size={11} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-2.5 py-2 text-[0.7rem] leading-relaxed text-ink">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
