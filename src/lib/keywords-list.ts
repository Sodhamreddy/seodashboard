/**
 * A client's tracked keywords, as text the operator edits and as the parsed
 * pairs the rank check consumes.
 *
 * The stored form is a flat array of {keyword, location} so nothing downstream
 * has to re-parse; the textarea in Settings is the same list rendered one per
 * line as `Location | Keyword`, because that is how an SEO thinks about a
 * local campaign — the place first, then the term. Location is optional: a
 * line with no `|` is a national keyword.
 */

export type TrackedKeyword = {
  keyword: string;
  /** Free-text place Serper geolocates from, e.g. "Ann Arbor, Michigan". */
  location?: string;
};

/** Keep a client's list bounded — a SERP run of this many is already a lot. */
export const MAX_TRACKED_KEYWORDS = 300;

/**
 * Parses the textarea. Each line is `Location | Keyword`; with no pipe the
 * whole line is the keyword and there is no location. Blank lines and exact
 * duplicates (same keyword + location) are dropped, and order is preserved.
 */
export function parseKeywordLines(text: string): TrackedKeyword[] {
  const seen = new Set<string>();
  const out: TrackedKeyword[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    let location: string | undefined;
    let keyword: string;
    const pipe = line.indexOf('|');
    if (pipe >= 0) {
      location = line.slice(0, pipe).trim() || undefined;
      keyword = line.slice(pipe + 1).trim();
    } else {
      keyword = line;
    }
    if (!keyword) continue;

    const key = `${(location ?? '').toLowerCase()}\u0000${keyword.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ keyword: keyword.slice(0, 200), location: location?.slice(0, 120) });
    if (out.length >= MAX_TRACKED_KEYWORDS) break;
  }

  return out;
}

/** The list back to editable text — the round-trip the textarea shows on load. */
export function keywordsToText(keywords: TrackedKeyword[]): string {
  return keywords
    .map((entry) => (entry.location ? `${entry.location} | ${entry.keyword}` : entry.keyword))
    .join('\n');
}

/**
 * Parses an uploaded CSV into the same pairs.
 *
 * Deliberately forgiving: two columns are read as (location, keyword) in that
 * order to match the on-screen `Location | Keyword`; a single column is the
 * keyword alone. A header row naming the columns is detected and skipped, so a
 * spreadsheet exported with headers just works. Quoted fields with commas are
 * handled; anything more exotic is beyond what this needs.
 */
export function parseKeywordCsv(text: string): TrackedKeyword[] {
  const rows = text.split(/\r?\n/).filter((line) => line.trim());
  if (rows.length === 0) return [];

  const cells = (line: string): string[] => {
    const out: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        out.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    out.push(field);
    return out.map((value) => value.trim());
  };

  const first = cells(rows[0]).map((value) => value.toLowerCase());
  const hasHeader = first.some((value) => value === 'keyword' || value === 'location' || value === 'city');
  const keywordCol = hasHeader ? Math.max(0, first.findIndex((value) => value === 'keyword')) : -1;
  const locationCol = hasHeader
    ? first.findIndex((value) => value === 'location' || value === 'city')
    : -1;

  const lines: string[] = [];
  for (let r = hasHeader ? 1 : 0; r < rows.length; r += 1) {
    const cols = cells(rows[r]);
    if (cols.length === 0) continue;

    let keyword: string;
    let location: string | undefined;
    if (hasHeader) {
      keyword = cols[keywordCol] ?? '';
      location = locationCol >= 0 ? cols[locationCol] : undefined;
    } else if (cols.length >= 2) {
      // Two columns, no header: location first, keyword second — the on-screen order.
      location = cols[0];
      keyword = cols[1];
    } else {
      keyword = cols[0];
    }
    if (!keyword?.trim()) continue;
    lines.push(location?.trim() ? `${location.trim()} | ${keyword.trim()}` : keyword.trim());
  }

  return parseKeywordLines(lines.join('\n'));
}
