import type { Metadata } from 'next';
import { AiOverviewPanel } from '@/components/panels/AiOverviewPanel';
import { Note } from '@/components/ui/primitives';
import { getActiveDomain } from '@/lib/domain';
import { engineConfigured, loadAiVisibility } from '@/lib/providers/aiVisibility';
import { getKeywordReport } from '@/lib/providers/keywords';
import { MAX_KEYWORDS } from '@/lib/ai-visibility';

export const metadata: Metadata = { title: 'AI Overview' };
export const dynamic = 'force-dynamic';

/**
 * Answer-engine visibility, on its own page.
 *
 * It rides along inside the traffic panels because that is where the question
 * arises, but it is not a footnote to Google Analytics: for a growing share of
 * queries the answer engine *is* the destination, and whether a site is cited
 * there is its own measurement with its own cadence.
 */
export default async function AiOverviewPage() {
  const domain = getActiveDomain();
  const [runs, keywords] = await Promise.all([
    loadAiVisibility(domain),
    getKeywordReport(domain),
  ]);

  const checking = keywords.keywords
    .filter((row) => row.position !== null)
    .slice(0, MAX_KEYWORDS)
    .map((row) => row.keyword);

  return (
    <div className="space-y-6">
      <header className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight text-ink">AI Overview</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-ink-secondary">
          Whether ChatGPT, Gemini and Claude cite{' '}
          <span className="font-medium text-ink">{domain}</span> when asked the questions it already
          ranks for on Google. There is no position ten in an answer — a site is cited as a source
          or it is not — so what is measured is citation, rank among the sources named, and who else
          the answer used.
        </p>
      </header>

      {checking.length > 0 ? (
        <Note tone="neutral" icon="search">
          <span className="font-semibold">Next check covers:</span>{' '}
          {checking.map((keyword) => `“${keyword}”`).join(', ')} — the top{' '}
          {checking.length} keyword{checking.length === 1 ? '' : 's'} this site ranks for in Search
          Console.
        </Note>
      ) : (
        <Note tone="warning" icon="alert">
          No ranking keywords found for this client, so there is nothing to ask the engines yet.
          Connect Search Console for this domain first.
        </Note>
      )}

      <AiOverviewPanel
        runs={runs}
        configured={{
          gemini: engineConfigured('gemini'),
          chatgpt: engineConfigured('chatgpt'),
          claude: engineConfigured('claude'),
        }}
      />
    </div>
  );
}
