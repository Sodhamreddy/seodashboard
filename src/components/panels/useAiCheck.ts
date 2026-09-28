'use client';

import { useEffect, useRef, useState } from 'react';
import type { AiJob, AiRunMode, AiVisibilityRun } from '@/lib/ai-visibility';

const POLL_MS = 2500;

/**
 * Starts an AI visibility check and follows it to completion.
 *
 * The POST returns as soon as the job exists; the run itself can take minutes
 * on the free Gemini tier, so this polls and exposes a one-line status the
 * panels can show — "Checking 5 of 12" or "Rate limit — resuming in 54s" —
 * instead of a spinner that looks hung.
 */
export function useAiCheck(mode: AiRunMode, onDone: (run: AiVisibilityRun) => void) {
  const [job, setJob] = useState<AiJob | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function follow(id: string) {
    timer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/ai-visibility?job=${id}`);
        const data = (await response.json()) as { job?: AiJob; error?: string };
        if (!response.ok || !data.job) {
          setError(data.error ?? 'Lost track of the check.');
          setJob(null);
          return;
        }
        setJob(data.job);
        if (data.job.status === 'running') {
          follow(id);
        } else if (data.job.status === 'done' && data.job.run) {
          done.current(data.job.run);
          setJob(null);
        } else {
          setError(data.job.error ?? 'The check failed.');
          setJob(null);
        }
      } catch {
        // A dropped poll is not a failed check; try again.
        follow(id);
      }
    }, POLL_MS);
  }

  async function start() {
    setError('');
    try {
      const response = await fetch('/api/ai-visibility', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engine: 'gemini', mode }),
      });
      const data = (await response.json()) as { job?: AiJob; error?: string };
      if (!response.ok || !data.job) {
        setError(data.error ?? 'The check could not be started.');
        return;
      }
      setJob(data.job);
      follow(data.job.id);
    } catch {
      setError('Network error — the check did not start.');
    }
  }

  const status = job
    ? job.note ?? (job.total ? `Checking ${Math.min(job.done + 1, job.total)} of ${job.total}…` : 'Starting…')
    : '';

  return { start, running: job !== null, status, error, setError };
}
