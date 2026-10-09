/**
 * @file Running time, estimated cost and spend totals.
 *
 * Every figure here is an estimate: running time multiplied by the flavour's listed price. It
 * matches how Hugging Face prices jobs (per minute of running time) but is not the invoice, and
 * the user-facing text says "estimated" wherever these numbers appear.
 */

import type { Hardware, Job, JobPhase, PricedJob, Spend } from './types';

const FINISHED: ReadonlySet<string> = new Set(['COMPLETED', 'ERROR', 'CANCELED', 'DELETED']);

/** Collapses a provider stage into queued, running or finished. */
export function phaseOf(job: Job): JobPhase {
  if (FINISHED.has(job.stage)) {
    return 'finished';
  }
  if (job.stage === 'RUNNING') {
    return 'running';
  }
  // An unknown stage: a job that has started and is not known to be finished is treated as
  // running, so its cost is shown rather than hidden.
  return job.startedAt ? 'running' : 'queued';
}

/** Seconds per pricing unit, or `undefined` for a unit this extension does not know. */
export function secondsPerUnit(unitLabel: string): number | undefined {
  switch (unitLabel.toLowerCase()) {
    case 'second':
      return 1;
    case 'minute':
      return 60;
    case 'hour':
      return 3600;
    default:
      return undefined;
  }
}

/**
 * Running time to charge for.
 *
 * A running job is measured from its start to `now`, because the reported duration lags. A
 * finished one uses the reported running time, then start-to-finish, and otherwise is unknown:
 * cancelled jobs often report neither, and guessing would invent a cost.
 */
export function runningSeconds(job: Job, phase: JobPhase, now: Date): number | undefined {
  if (phase === 'queued') {
    return 0;
  }
  if (phase === 'running') {
    return job.startedAt ? Math.max(0, (now.getTime() - job.startedAt.getTime()) / 1000) : job.runningSecs;
  }
  if (job.runningSecs !== undefined) {
    return job.runningSecs;
  }
  if (job.startedAt && job.finishedAt) {
    return Math.max(0, (job.finishedAt.getTime() - job.startedAt.getTime()) / 1000);
  }
  return undefined;
}

/** Attaches phase, running time and estimated cost to each job. */
export function priceJobs(jobs: readonly Job[], hardware: readonly Hardware[], now: Date): PricedJob[] {
  const byName = new Map(hardware.map((h) => [h.name, h]));
  return jobs.map((job) => {
    const phase = phaseOf(job);
    const elapsedRunningSecs = runningSeconds(job, phase, now);
    const hw = byName.get(job.flavor);
    const unit = hw ? secondsPerUnit(hw.unitLabel) : undefined;
    const costUsd =
      hw && unit !== undefined && elapsedRunningSecs !== undefined
        ? (elapsedRunningSecs / unit) * hw.unitCostUsd
        : undefined;
    const maxCostUsd =
      costUsd === undefined && hw && unit !== undefined && job.timeoutSecs !== undefined && job.startedAt
        ? (job.timeoutSecs / unit) * hw.unitCostUsd
        : undefined;
    return { ...job, phase, elapsedRunningSecs, costUsd, maxCostUsd };
  });
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/**
 * Totals for the status bar. A job counts towards the day and month it started in (local time);
 * a job that never started cost nothing.
 */
export function spendOf(jobs: readonly PricedJob[], now: Date): Spend {
  let runningCount = 0;
  let queuedCount = 0;
  let runningUsd = 0;
  let todayUsd = 0;
  let monthUsd = 0;
  let unpricedCount = 0;
  let unpricedMaxUsd = 0;
  for (const job of jobs) {
    if (job.phase === 'running') {
      runningCount++;
      runningUsd += job.costUsd ?? 0;
    } else if (job.phase === 'queued') {
      queuedCount++;
    }
    if (!job.startedAt) {
      continue;
    }
    if (job.costUsd === undefined) {
      if (sameMonth(job.startedAt, now)) {
        unpricedCount++;
        unpricedMaxUsd += job.maxCostUsd ?? 0;
      }
      continue;
    }
    if (sameDay(job.startedAt, now)) {
      todayUsd += job.costUsd;
    }
    if (sameMonth(job.startedAt, now)) {
      monthUsd += job.costUsd;
    }
  }
  return { runningCount, queuedCount, runningUsd, todayUsd, monthUsd, unpricedCount, unpricedMaxUsd };
}
