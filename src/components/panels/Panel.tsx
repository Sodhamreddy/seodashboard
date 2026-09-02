import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import type { ToolTone } from '@/lib/nav';

/**
 * A titled band over a cluster of related metrics — the grouping the reference
 * design uses instead of many separate cards. The band carries the tool's own
 * tile colour so a panel is identifiable at a glance.
 */
export function Panel({
  title,
  subtitle,
  icon,
  tone,
  href,
  hrefLabel = 'View details',
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon: IconName;
  tone: ToolTone;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx('surface-card overflow-hidden rounded-card border border-hairline', className)}
    >
      <header className="panel-band flex flex-wrap items-center gap-3 border-b border-hairline px-5 py-3.5">
        <span aria-hidden="true" className={cx('tile h-9 w-9 shrink-0', `tile-${tone}`)}>
          <Icon name={icon} size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-2xs text-ink-secondary">{subtitle}</p>}
        </div>

        {href && (
          <Link
            href={href}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-hairline bg-surface-raised px-3 text-2xs font-medium text-ink-secondary transition-colors hover:text-ink"
          >
            {hrefLabel}
            <Icon name="chevronRight" size={12} />
          </Link>
        )}
      </header>

      <div className="p-5">{children}</div>
    </section>
  );
}
