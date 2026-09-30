'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Note } from '@/components/ui/primitives';

type Result = { keyword: string; position: number | null; url?: string; features?: string[] };

export function SerpQuickCheck({ domain }: { domain: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [note, setNote] = useState('');

  async function run(event: React.FormEvent) {
    event.preventDefault();
    const keywords = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (keywords.length === 0) return setError('Enter a keyword first.');
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const response = await fetch('/api/serp/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain, keywords, location: location.trim() || undefined }),
      });
      const data = (await response.json()) as {
        error?: string;
        results?: Result[];
        note?: string;
      };
      if (!response.ok) throw new Error(data.error || 'Rank check failed.');
      setResults(data.results ?? []);
      setNote(data.note ?? '');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Rank check failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Instant Google rank check</h2>
          <p className="mt-1 text-xs text-ink-secondary">
            Live positions from real Google. Up to 10 keywords, one per line. Add a location for
            local ranks.
          </p>
        </div>
        <span className="rounded-md bg-tint-good px-2 py-1 text-2xs font-medium text-status-good">
          Live Google
        </span>
      </div>

      <form onSubmit={run} className="mt-4 space-y-2">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="e.g. senior in-home care"
          aria-label="Keyword to check"
          disabled={loading}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Location (optional) — e.g. Ann Arbor, Michigan, United States"
            aria-label="Search location"
            disabled={loading}
          />
          <Button type="submit" icon="search" loading={loading} className="shrink-0">
            {loading ? 'Checking…' : 'Check rank'}
          </Button>
        </div>
      </form>

      {error && (
        <div className="mt-3">
          <Note tone="critical" icon="alert">
            {error}
          </Note>
        </div>
      )}

      {results && (
        <ul className="mt-3 space-y-1.5">
          {results.map((result) => (
            <li
              key={result.keyword}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-hairline px-3 py-2 text-xs"
            >
              <span className="font-medium text-ink">{result.keyword}</span>
              <span className="text-ink-secondary">
                {result.position ? (
                  <span className="font-semibold text-status-good">Google #{result.position}</span>
                ) : (
                  <span className="text-ink-muted">not in the top 100</span>
                )}
              </span>
              {result.features?.includes('local-pack') && (
                <span className="rounded bg-tint-good px-1.5 py-0.5 text-2xs font-medium text-status-good">
                  in local pack
                </span>
              )}
              {result.url && (
                <span className="w-full truncate text-2xs text-ink-muted" title={result.url}>
                  {result.url.replace(/^https?:\/\//, '')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-2xs leading-relaxed text-ink-muted">
        {note ||
          'Positions are real Google organic results. A location returns the ranks a searcher there actually sees; without one the result is national.'}
      </p>
    </Card>
  );
}
