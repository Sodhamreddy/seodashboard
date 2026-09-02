import { NextResponse } from 'next/server';
import {
  addClient,
  loadClients,
  removeClient,
  renameClient,
  updateClientProviders,
} from '@/lib/clients';
import { getActiveDomain } from '@/lib/domain';

export const runtime = 'nodejs';

export async function GET() {
  const clients = await loadClients();
  // The active domain travels with the roster so a client-side consumer (the
  // report builder) does not have to parse the cookie itself.
  return NextResponse.json({ clients, activeDomain: getActiveDomain() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string; domain?: string };
  const result = await addClient(String(body.name ?? ''), String(body.domain ?? ''));

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, client: result });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    ga4PropertyId?: string;
    adsCustomerId?: string;
    gmbLocationId?: string;
  };
  if (!body.id) return NextResponse.json({ error: 'A client id is required.' }, { status: 400 });

  // A provider-id update and a rename are different edits; the presence of any
  // id field selects the former so an empty string can still clear a field.
  const idFields = ['ga4PropertyId', 'adsCustomerId', 'gmbLocationId'] as const;
  const touchesIds = idFields.some((field) => field in body);

  const result = touchesIds
    ? await updateClientProviders(
        body.id,
        Object.fromEntries(
          idFields.filter((field) => field in body).map((field) => [field, body[field]]),
        ),
      )
    : await renameClient(body.id, String(body.name ?? ''));

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, client: result });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: 'A client id is required.' }, { status: 400 });

  await removeClient(body.id);
  return NextResponse.json({ ok: true });
}
