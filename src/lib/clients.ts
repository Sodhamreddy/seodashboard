import { normalizeDomain } from './env';
import { CLIENTS_PATH, readJson, writeJson } from './store';

/**
 * The client roster behind the top-bar switcher.
 *
 * There is no cap on how many clients this holds — it is a flat JSON array
 * under `.data/`, so a few hundred rows costs nothing. The switcher gets a
 * filter box once the list is long enough that scrolling stops being enough.
 *
 * A client is just a saved (name, domain) pair. Switching to one sets the
 * existing `seodash_domain` cookie, so every panel that already reads
 * `getActiveDomain()` keeps working unchanged — the roster is a convenience
 * layer on top of that, not a new scoping mechanism.
 */

export type Client = {
  id: string;
  name: string;
  domain: string;
  addedAt: string;
  /**
   * Per-client provider identifiers.
   *
   * These exist because the account ids they replace were global environment
   * variables, which is fine for one client and actively wrong for several: a
   * single `GA4_PROPERTY_ID` reported the first client's traffic under every
   * other client's name. Anything a provider cannot derive from the domain
   * alone belongs here.
   *
   * Search Console is deliberately absent — `resolvePropertyForDomain` already
   * finds the right property from the domain, so storing it would only let the
   * two disagree.
   */
  ga4PropertyId?: string;
  /** Google Ads customer id, digits only. */
  adsCustomerId?: string;
  /** Business Profile location id, for review automation. */
  gmbLocationId?: string;
};


function newId() {
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export async function loadClients(): Promise<Client[]> {
  return readJson<Client[]>(CLIENTS_PATH, []);
}

async function saveClients(clients: Client[]) {
  await writeJson(CLIENTS_PATH, clients);
}

export async function addClient(name: string, domainInput: string): Promise<Client | { error: string }> {
  const domain = normalizeDomain(domainInput);
  if (!domain || !domain.includes('.')) {
    return { error: 'Enter a valid domain, for example example.com.' };
  }

  const trimmedName = name.trim();
  const clients = await loadClients();

  const existing = clients.find((client) => client.domain === domain);
  if (existing) {
    // Re-adding an existing domain is treated as a rename, not a duplicate row.
    if (trimmedName && trimmedName !== existing.name) {
      existing.name = trimmedName;
      await saveClients(clients);
    }
    return existing;
  }

  const client: Client = {
    id: newId(),
    name: trimmedName || domain,
    domain,
    addedAt: new Date().toISOString(),
  };
  await saveClients([...clients, client]);
  return client;
}

export async function removeClient(id: string) {
  const clients = await loadClients();
  await saveClients(clients.filter((client) => client.id !== id));
}

/**
 * Updates the provider identifiers on one client.
 *
 * An empty string clears a field rather than storing '', so "not configured"
 * has exactly one representation and the fallback logic stays simple.
 */
export async function updateClientProviders(
  id: string,
  patch: { ga4PropertyId?: string; adsCustomerId?: string; gmbLocationId?: string },
): Promise<Client | { error: string }> {
  const clients = await loadClients();
  const client = clients.find((entry) => entry.id === id);
  if (!client) return { error: 'Client not found.' };

  const clean = (value: string | undefined) => {
    const trimmed = (value ?? '').trim();
    return trimmed === '' ? undefined : trimmed;
  };

  if ('ga4PropertyId' in patch) {
    // Accept "properties/123" as well as a bare id.
    const raw = clean(patch.ga4PropertyId);
    client.ga4PropertyId = raw ? raw.replace(/^properties\//, '') : undefined;
  }
  if ('adsCustomerId' in patch) {
    // The Ads API rejects dashes.
    const raw = clean(patch.adsCustomerId);
    client.adsCustomerId = raw ? raw.replace(/\D/g, '') : undefined;
  }
  if ('gmbLocationId' in patch) {
    const raw = clean(patch.gmbLocationId);
    client.gmbLocationId = raw ? raw.split('/').pop() : undefined;
  }

  await saveClients(clients);
  return client;
}

export async function renameClient(id: string, name: string): Promise<Client | { error: string }> {
  const trimmedName = name.trim();
  if (!trimmedName) return { error: 'Name cannot be empty.' };

  const clients = await loadClients();
  const client = clients.find((entry) => entry.id === id);
  if (!client) return { error: 'Client not found.' };

  client.name = trimmedName;
  await saveClients(clients);
  return client;
}
