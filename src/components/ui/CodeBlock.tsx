'use client';

import { useState } from 'react';
import { Icon } from './Icon';
import { Button, cx } from './primitives';

export function CodeBlock({
  code,
  label,
  downloadName,
  maxHeight = 320,
  className,
}: {
  code: string;
  label?: string;
  downloadName?: string;
  maxHeight?: number;
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

  function download() {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadName ?? 'snippet.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={cx('overflow-hidden rounded-xl border border-hairline bg-surface-sunken', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-2">
        <span className="truncate text-2xs font-medium uppercase tracking-[0.07em] text-ink-muted">
          {label ?? 'Snippet'}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {downloadName && (
            <Button variant="ghost" size="sm" icon="download" onClick={download}>
              Download
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={copy}>
            <Icon name={copied ? 'check' : 'copy'} size={13} />
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
      <pre
        className="overflow-auto px-3 py-3 text-[0.72rem] leading-relaxed text-ink"
        style={{ maxHeight }}
      >
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
