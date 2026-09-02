import { cookies } from 'next/headers';
import { defaultDomain, normalizeDomain } from './env';

export const DOMAIN_COOKIE = 'seodash_domain';

/** The domain every dashboard panel is scoped to. Set via the top-bar switcher. */
export function getActiveDomain() {
  const stored = cookies().get(DOMAIN_COOKIE)?.value;
  const normalized = stored ? normalizeDomain(stored) : '';
  return normalized && normalized.includes('.') ? normalized : defaultDomain();
}
