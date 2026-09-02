import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Minimal JSON file store under `.data/` — enough to give the sitemap tool a
 * previous state to diff against and to persist budget alert rules without
 * standing up a database. Swap for Postgres/Supabase by reimplementing
 * `readJson`/`writeJson`; nothing else in the app touches the filesystem.
 */

const ROOT = join(process.cwd(), '.data');

function safeName(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, '_').toLowerCase();
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(join(ROOT, path), 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(path: string, value: unknown) {
  const target = join(ROOT, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value, null, 2), 'utf8');
}

export function sitemapSnapshotPath(domain: string) {
  return join('sitemaps', `${safeName(domain)}.json`);
}

export const ALERT_RULES_PATH = join('alerts', 'rules.json');

export const CLIENTS_PATH = join('clients.json');

/** GMB reply templates, per domain — the review automation's rule set. */
export function gmbRulesPath(domain: string) {
  return join('gmb', `${safeName(domain)}.json`);
}
