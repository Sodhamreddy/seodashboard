import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Badge, cx } from '@/components/ui/primitives';
import { MODE_LABEL, NAV_ITEMS } from '@/lib/nav';

/** The call-to-action wording each tool leads with. */
const CTA: Record<string, string> = {
  '/meta-tags': 'Generate now',
  '/schema': 'Generate schema',
  '/seo-score': 'Check now',
  '/sitemap': 'Update sitemap',
  '/robots': 'Check rules',
  '/llms': 'Build AI map',
  '/backlinks': 'View backlinks',
  '/keywords': 'View rankings',
  '/google-ads': 'View campaigns',
  '/budget-alerts': 'Manage alerts',
};

/**
 * Hero row of tool cards. `groups` picks which nav groups to render, so the
 * on-page tools can lead the overview and the data panels follow lower down.
 */
export function ToolLauncher({
  groups,
  variant = 'cards',
}: {
  groups: string[];
  /**
   * 'compact' is a dense action strip — icon, name, verb, arrow. Used on the
   * overview, where the full cards crowded out the metrics that page exists
   * for. 'cards' keeps the descriptive version for anywhere with room.
   */
  variant?: 'cards' | 'compact';
}) {
  const items = NAV_ITEMS.filter((item) => groups.includes(item.group));

  if (variant === 'compact') {
    return (
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="surface-card surface-card-hover flex items-center gap-3 rounded-card border border-hairline px-3 py-2.5"
          >
            <span aria-hidden="true" className={cx('tile h-8 w-8 shrink-0', `tile-${item.tone}`)}>
              <Icon name={item.icon} size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-ink">{item.label}</span>
              <span className="block truncate text-2xs text-ink-muted">
                {CTA[item.href] ?? 'Open'}
              </span>
            </span>
            <Icon name="chevronRight" size={13} className="shrink-0 text-ink-muted" />
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <article
          key={item.href}
          className="surface-card surface-card-hover flex flex-col rounded-card border border-hairline p-4"
        >
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className={cx('tile h-11 w-11 shrink-0', `tile-${item.tone}`)}>
              <Icon name={item.icon} size={21} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-tight text-ink">{item.label}</h3>
              <p className="mt-1 text-2xs leading-relaxed text-ink-secondary">{item.blurb}</p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <Badge
              tone={item.mode === 'real' ? 'good' : item.mode === 'partial' ? 'accent' : 'warning'}
              icon={item.mode === 'seed' ? 'alert' : item.mode === 'real' ? 'check' : 'info'}
            >
              {MODE_LABEL[item.mode]}
            </Badge>
          </div>

          <Link href={item.href} className={cx('cta mt-3', `cta-${item.tone}`)}>
            {CTA[item.href] ?? 'Open'}
            <Icon name="chevronRight" size={13} />
          </Link>
        </article>
      ))}
    </div>
  );
}
