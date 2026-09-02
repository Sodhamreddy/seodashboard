import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

function cx(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export { cx };

/* ── Surfaces ──────────────────────────────────────────────────────── */

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cx(
        'surface-card rounded-card border border-hairline',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}) {
  // The header wraps rather than pinning the action to the same row: action
  // slots hold filter chips whose max-content width would otherwise push the
  // card wider than the viewport on small screens.
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <Icon name={icon} size={17} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[0.95rem] font-semibold leading-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="min-w-0 max-w-full">{action}</div>}
    </header>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-ink-secondary">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-xs text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ── Controls ──────────────────────────────────────────────────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: IconName;
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm' };
  const variants = {
    primary: 'btn-accent',
    secondary: 'border border-hairline bg-surface-raised text-ink hover:bg-surface-sunken',
    ghost: 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
    danger: 'border border-hairline bg-surface-raised text-status-critical hover:bg-surface-sunken',
  };

  return (
    <button
      className={cx(base, sizes[size], variants[variant], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size={size === 'sm' ? 13 : 15} /> : icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  error,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-secondary">
        {label}
      </label>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-2xs text-status-critical">
          <Icon name="alert" size={12} className="mt-px shrink-0" />
          {error}
        </p>
      ) : (
        hint && <p className="text-2xs leading-relaxed text-ink-muted">{hint}</p>
      )}
    </div>
  );
}

const controlClass =
  'w-full rounded-lg border border-hairline bg-surface-raised px-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-[color:var(--ring-accent)]';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(controlClass, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(controlClass, 'py-2.5 leading-relaxed', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(controlClass, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

/* ── Indicators ────────────────────────────────────────────────────── */

export function Spinner({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export type Tone = 'neutral' | 'good' | 'warning' | 'serious' | 'critical' | 'accent';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-hairline bg-surface-sunken text-ink-secondary',
  accent: 'border-transparent bg-accent-soft text-accent',
  good: 'border-transparent bg-tint-good text-status-good',
  warning: 'border-transparent bg-tint-warning text-ink',
  serious: 'border-transparent bg-tint-serious text-ink',
  critical: 'border-transparent bg-tint-critical text-status-critical',
};

const TONE_ICON: Record<Tone, IconName | null> = {
  neutral: null,
  accent: null,
  good: 'check',
  warning: 'alert',
  serious: 'alert',
  critical: 'close',
};

/**
 * Status is never carried by colour alone — every non-neutral tone ships an
 * icon plus its text label.
 */
export function Badge({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: IconName | null;
}) {
  const glyph = icon === undefined ? TONE_ICON[tone] : icon;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-2xs font-medium',
        TONE_CLASS[tone],
      )}
    >
      {glyph && <Icon name={glyph} size={11} />}
      {children}
    </span>
  );
}

export function EmptyState({
  icon = 'info',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-hairline px-6 py-12 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-sunken text-ink-muted">
        <Icon name={icon} size={20} />
      </span>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-secondary">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Note({
  tone = 'neutral',
  icon = 'info',
  children,
}: {
  tone?: Tone;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-relaxed',
        TONE_CLASS[tone],
      )}
    >
      <Icon name={icon} size={14} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
