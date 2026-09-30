'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Note, cx } from '@/components/ui/primitives';
import type { TrackedKeyword } from '@/lib/keywords-list';

type Row = { keyword: string; location?: string; position: number | null; url?: string; inLocalPack?: boolean };

/**
 * Checks the client's saved keyword list against Google.
 *
 * The keywords come from Settings, each with its own location, so this is one
 * button that runs the whole campaign rather than the ad-hoc box below it.
 * Serper rate-limits, so the run goes in small batches and reports progress;
 * a failed keyword is shown as failed, not silently dropped.
 */
const BATCH = 5;

export function SerpSavedCheck({
  domain,
  keywords,
  configured,
}: {
  domain: string;
  keywords: TrackedKeyword[];
  configured: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');

  const grouped = useMemo(() => {
    const byLocation = new Map<string, TrackedKeyword[]>();
    for (const entry of keywords) {
      const key = entry.location ?? '';
      byLocation.set(key, [...(byLocation.get(key) ?? []), entry]);
    }
    return [...byLocation.entries()];
  }, [keywords]);

  async function run() {
    setRunning(true);
    setError('');
    setDone(0);
    const collected: Row[] = [];
    try {
      for (let i = 0; i < keywords.length; i += BATCH) {
        const batch = keywords.slice(i, i + BATCH);
        // One request per distinct location in the batch keeps the server
        // route simple — it already loops keywords for a single location.
        const byLocation = new Map<string, string[]>();
        for (const entry of batch) {
          const key = entry.location ?? '';
          byLocation.set(key, [...(byLocation.get(key) ?? []), entry.keyword]);
        }
        for (const [location, terms] of byLocation) {
          const response = await fetch('/api/serp/check', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ domain, keywords: terms, location: location || undefined }),
          });
          const data = (await response.json()) as {
            error?: string;
            results?: { keyword: string; position: number | null; url?: string; features?: string[] }[];
          };
          if (!response.ok) throw new Error(data.error || 'Rank check failed.');
          for (const result of data.results ?? []) {
            collected.push({
              keyword: result.keyword,
              location: location || undefined,
              position: result.position,
              url: result.url,
              inLocalPack: result.features?.includes('local-pack'),
            });
          }
        }
        setDone(Math.min(i + BATCH, keywords.length));
        setRows([...collected]);
      }
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Rank check failed.');
    } finally {
      setRunning(false);
    }
  }

  const ranked = rows?.filter((row) => row.position !== null).length ?? 0;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Saved keywords</h2>
          <p className="mt-1 text-xs text-ink-secondary">
            {keywords.length > 0
              ? `${keywords.length} keyword${keywords.length === 1 ? '' : 's'} across ${grouped.length} location${grouped.length === 1 ? '' : 's'}, from this client's list.`
              : 'No keywords saved for this client yet.'}
          </p>
        </div>
        {keywords.length > 0 && (
          <Button
            icon="search"
            loading={running}
            disabled={!configured || running}
            onClick={() => void run()}
            className="shrink-0"
          >
            {running ? `Checking ${done}/${keywords.length}…` : 'Check all on Google'}
          </Button>
        )}
      </div>

      {!configured && (
        <div className="mt-3">
          <Note tone="warning" icon="alert">
            Google rank checks need <code className="font-mono">SERPER_API_KEY</code> set. Add it and
            restart.
          </Note>
        </div>
      )}

      {keywords.length === 0 && configured && (
        <div className="mt-3">
          <Note tone="neutral" icon="info">
            Add keywords for this client in <span className="font-medium text-ink">Settings → Client
            integrations</span> — one per line as <code className="font-mono">Location | Keyword</code>,
            or upload a CSV. They will show here to check in one click.
          </Note>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <Note tone="critical" icon="alert">
            {error}
          </Note>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-2xs text-ink-muted">
            {ranked} of {rows.length} ranking in the top 100
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-xs">
              <thead className="bg-surface-sunken">
                <tr className="text-2xs uppercase tracking-[0.06em] text-ink-secondary">
                  <th scope="col" className="px-3 py-2 font-semibold">Keyword</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Location</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Google</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.location ?? ''}|${row.keyword}`} className="border-t border-hairline">
                    <td className="px-3 py-2 text-ink">
                      {row.keyword}
                      {row.inLocalPack && (
                        <span className="ml-2 rounded bg-tint-good px-1.5 py-0.5 text-2xs font-medium text-status-good">
                          local pack
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-2xs text-ink-secondary">{row.location ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {row.position ? (
                        <span
                          className={cx(
                            'tnum font-semibold',
                            row.position <= 3 ? 'text-status-good' : 'text-ink',
                          )}
                        >
                          #{row.position}
                        </span>
                      ) : (
                        <span className="text-2xs text-ink-muted">100+</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {keywords.length > 0 && !rows && configured && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {grouped.slice(0, 4).map(([location, list]) => (
            <Badge key={location || 'national'} tone="neutral" icon={null}>
              {location || 'National'}: {list.length}
            </Badge>
          ))}
          {grouped.length > 4 && (
            <Badge tone="neutral" icon={null}>+{grouped.length - 4} more</Badge>
          )}
        </div>
      )}
    </Card>
  );
}
