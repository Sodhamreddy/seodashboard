import type { AiEngine, AiJob, AiRunMode, AiVisibilityRun } from '../ai-visibility';
import type { ProgressFn } from './aiVisibility';

/**
 * In-process registry of running checks.
 *
 * Process-local on purpose, like the provider cache: this app runs as one Node
 * process, and a restart mid-check losing that check is an acceptable failure
 * — the stored runs are untouched and the button can be pressed again. Kept on
 * globalThis so a dev-server module reload does not orphan a running job.
 */

const registry: Map<string, AiJob> =
  ((globalThis as Record<string, unknown>).__sitepilotAiJobs as Map<string, AiJob>) ?? new Map();
(globalThis as Record<string, unknown>).__sitepilotAiJobs = registry;

const KEEP_FINISHED_MS = 60 * 60_000;

function prune() {
  const cutoff = Date.now() - KEEP_FINISHED_MS;
  for (const [id, job] of registry) {
    if (job.status !== 'running' && Date.parse(job.startedAt) < cutoff) registry.delete(id);
  }
}

export function getJob(id: string) {
  return registry.get(id) ?? null;
}

/**
 * Starts a check, or returns the one already running for this client and mode.
 *
 * Pressing the button twice must not spend the quota twice — the second press
 * joins the first rather than racing it for the same per-minute allowance.
 */
export function startJob(
  domain: string,
  engine: AiEngine,
  mode: AiRunMode,
  work: (progress: ProgressFn) => Promise<AiVisibilityRun | { error: string }>,
): AiJob {
  prune();
  for (const job of registry.values()) {
    if (job.status === 'running' && job.domain === domain && job.mode === mode && job.engine === engine) {
      return job;
    }
  }

  const job: AiJob = {
    id: `job_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    domain,
    engine,
    mode,
    status: 'running',
    done: 0,
    total: 0,
    startedAt: new Date().toISOString(),
  };
  registry.set(job.id, job);

  // Deliberately not awaited: the request returns and the work carries on.
  void work(({ done, total, note }) => {
    job.done = done;
    job.total = total;
    job.note = note;
  })
    .then((result) => {
      if ('error' in result) {
        job.status = 'error';
        job.error = result.error;
      } else {
        job.status = 'done';
        job.run = result;
      }
      job.note = undefined;
    })
    .catch((error: unknown) => {
      job.status = 'error';
      job.error = error instanceof Error ? error.message : 'The check failed.';
    });

  return job;
}
