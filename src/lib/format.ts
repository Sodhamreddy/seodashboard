export function compactNumber(value: number) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function number(value: number, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function currency(value: number, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function percent(value: number, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function signed(value: number, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  const formatted = number(Math.abs(value), digits);
  if (value === 0) return `±${formatted}`;
  return `${value > 0 ? '+' : '−'}${formatted}`;
}

export function shortDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function monthLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffDays = Math.round((then - Date.now()) / 86_400_000);
  const formatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  if (Math.abs(diffDays) < 31) return formatter.format(diffDays, 'day');
  return formatter.format(Math.round(diffDays / 30), 'month');
}

export function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Milliseconds → "1.24 s" / "820 ms". */
/**
 * Machine timings — page-speed metrics like TTFB, LCP and TBT, where
 * sub-second precision is the point. Reads as "144.00 s" past a minute, which
 * is correct for a slow request and wrong for a human duration.
 */
export function duration(ms: number) {
  if (!Number.isFinite(ms)) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

/**
 * Human durations — session length, time on page. "2m 24s", not "144.00 s".
 * Takes milliseconds so it drops in beside `duration`.
 */
export function clockDuration(ms: number) {
  if (!Number.isFinite(ms)) return '—';
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}

export function bytes(value: number) {
  if (!Number.isFinite(value)) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}
