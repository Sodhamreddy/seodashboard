/**
 * Instant navigation feedback for every page inside the dashboard shell.
 *
 * Without a `loading.tsx`, Next holds the old page on screen while the new
 * route's server component awaits its providers — so switching to the Overview,
 * which fans out to Google Ads, GA4, Search Console and Crawly, looked frozen
 * for as long as the slowest of them took. The sidebar and top bar are part of
 * the layout, so they stay put; only this region swaps.
 *
 * The skeleton deliberately mirrors the common page shape (title block, then a
 * stat row, then panels) rather than being a spinner: matching the layout that
 * is about to appear stops the content from visibly jumping when it lands.
 */
function Bar({ className }: { className: string }) {
  return <span className={`skeleton block rounded-md ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Title block */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Bar className="h-3 w-24" />
          <Bar className="h-7 w-[19rem] max-w-full" />
          <Bar className="h-3.5 w-[26rem] max-w-full" />
        </div>
        <div className="flex shrink-0 gap-2">
          <Bar className="h-9 w-44 rounded-lg" />
          <Bar className="h-9 w-36 rounded-lg" />
        </div>
      </div>

      {/* Stat row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="rounded-card border border-hairline bg-surface p-4 shadow-card"
          >
            <Bar className="h-2.5 w-20" />
            <Bar className="mt-3 h-7 w-24" />
            <Bar className="mt-2.5 h-2.5 w-32" />
          </div>
        ))}
      </div>

      {/* Panels */}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card"
          >
            <div className="flex items-center gap-3 border-b border-hairline px-5 py-3.5">
              <Bar className="h-9 w-9 rounded-[10px]" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Bar className="h-3.5 w-40" />
                <Bar className="h-2.5 w-56 max-w-full" />
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Array.from({ length: 4 }, (_, cell) => (
                  <div key={cell} className="space-y-2">
                    <Bar className="h-2.5 w-16" />
                    <Bar className="h-5 w-14" />
                  </div>
                ))}
              </div>
              <Bar className="h-28 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
