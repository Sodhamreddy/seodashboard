'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input, Note } from '@/components/ui/primitives';

export function LoginForm({ defaultUsername }: { defaultUsername: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState('');
  // `?error=1` comes back from the no-JS form POST path.
  const [error, setError] = useState(
    searchParams.get('error') ? 'Incorrect username or password.' : '',
  );
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? 'Sign in failed.');
        setPending(false);
        return;
      }

      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/') ? next : '/dashboard');
      router.refresh();
    } catch {
      setError('Network error — could not reach the server.');
      setPending(false);
    }
  }

  const next = searchParams.get('next') ?? '';

  /*
   * `method`/`action` are the fallback path, not decoration. Without them a
   * submit that lands before React hydrates does a native GET to the current
   * URL, which puts the username and password in the address bar, browser
   * history and server logs. With them, that same submit POSTs to the API
   * route, which answers a form POST with a 303 to the dashboard.
   */
  return (
    <form
      onSubmit={submit}
      action="/api/auth/login"
      method="post"
      className="space-y-4"
    >
      <input type="hidden" name="next" value={next} />

      <Field label="Username" htmlFor="username">
        <Input
          id="username"
          name="username"
          autoComplete="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      {error && (
        <Note tone="critical" icon="alert">
          {error}
        </Note>
      )}

      <Button type="submit" className="w-full" loading={pending} icon={pending ? undefined : 'shield'}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
