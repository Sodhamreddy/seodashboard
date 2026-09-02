import type { ReactNode } from 'react';
import { cx } from '@/components/ui/primitives';

/**
 * The shared "enter a URL, press the button" form layout.
 *
 * Why this exists rather than the generic `Field` in a grid: `Field` renders
 * its hint *below* the control, so an `items-end` row aligned the action button
 * to the bottom of the hint text instead of the input, leaving the button
 * visibly low. Here the hint lives outside the row, so the input and the button
 * share one baseline by construction — and the URL input is width-capped so it
 * does not stretch across a 1600px screen.
 */

export function ToolForm({
  onSubmit,
  children,
  hint,
}: {
  onSubmit: (event: React.FormEvent) => void;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">{children}</div>
      {hint && <p className="text-2xs leading-relaxed text-ink-muted">{hint}</p>}
    </form>
  );
}

export function ToolField({
  label,
  htmlFor,
  children,
  width = 'grow',
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  /** 'grow' fills the row up to a readable cap; a number is a fixed px width. */
  width?: 'grow' | number;
}) {
  return (
    <div
      className={cx('space-y-1.5', width === 'grow' && 'min-w-[240px] max-w-2xl flex-1')}
      style={typeof width === 'number' ? { width, flex: '0 0 auto' } : undefined}
    >
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-secondary">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Wrapper so the submit button keeps the row's baseline and never shrinks. */
export function ToolAction({ children }: { children: ReactNode }) {
  return <div className="shrink-0">{children}</div>;
}
