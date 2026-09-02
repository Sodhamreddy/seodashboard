import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from './primitives';

/**
 * A highlighted "how to use this" panel.
 *
 * Deliberately louder than a `Note`: it uses the accent wash and a numbered
 * list, because the most common failure with these tools is not a wrong result
 * but a correct result the user does not know what to do with.
 */
export function Instructions({
  title = 'How to use this',
  steps,
  icon = 'info',
  children,
  className,
}: {
  title?: string;
  steps: ReactNode[];
  icon?: IconName;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        'rounded-card border p-4',
        'border-[color:var(--accent-soft)] bg-accent-soft',
        className,
      )}
    >
      <header className="mb-2.5 flex items-center gap-2.5">
        <span className="tile tile-violet h-8 w-8 shrink-0">
          <Icon name={icon} size={16} />
        </span>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </header>

      <ol className="space-y-1.5">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-2.5 text-xs leading-relaxed text-ink-secondary">
            <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[0.68rem] font-semibold leading-none text-white">
              {index + 1}
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>

      {children && <div className="mt-2.5">{children}</div>}
    </section>
  );
}

/**
 * The banner that sits directly above generated code, saying exactly where the
 * snippet goes. Separate from `Instructions` so it can be repeated next to each
 * output block without re-stating the whole workflow.
 */
export function PasteTarget({
  where,
  detail,
  tone = 'accent',
}: {
  where: ReactNode;
  detail?: ReactNode;
  tone?: 'accent' | 'warning';
}) {
  return (
    <div
      className={cx(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5',
        tone === 'warning'
          ? 'border-transparent bg-tint-warning'
          : 'border-[color:var(--accent-soft)] bg-accent-soft',
      )}
    >
      <Icon
        name="target"
        size={15}
        className={cx('mt-0.5 shrink-0', tone === 'warning' ? 'text-status-warning' : 'text-accent')}
      />
      <div className="min-w-0 text-xs leading-relaxed">
        <p className="font-semibold text-ink">{where}</p>
        {detail && <p className="mt-0.5 text-ink-secondary">{detail}</p>}
      </div>
    </div>
  );
}
