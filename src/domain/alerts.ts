/**
 * @file Which notifications the current state calls for.
 *
 * Pure: given the jobs, the time and the settings, it lists every alert that *applies*, each
 * with a stable key. Deciding which of them are new, so each fires once, is the application
 * layer's job ({@link AlertTracker}), which remembers keys across refreshes and reloads.
 */

import { formatDuration, formatUsd, isOutOfMemory, jobLabel } from './format';
import type { Alert, JobwatchConfig, PricedJob, Spend } from './types';

/** `2026-10` for a date, local time: one budget alert per calendar month. */
export function monthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function finishedAlert(job: PricedJob, config: JobwatchConfig): Alert | undefined {
  const name = jobLabel(job);
  const cost = job.costUsd !== undefined ? `, about ${formatUsd(job.costUsd)}` : '';
  const ran = job.elapsedRunningSecs !== undefined ? ` after ${formatDuration(job.elapsedRunningSecs)}` : '';
  if (job.stage === 'ERROR') {
    if (isOutOfMemory(job.message)) {
      return {
        key: `${job.id}:failed`,
        kind: 'out-of-memory',
        severity: 'error',
        message: `${name} ran out of memory on ${job.flavor}${ran}${cost}.`,
        url: job.url,
      };
    }
    const why = job.message ? `: ${job.message}` : '.';
    return { key: `${job.id}:failed`, kind: 'failed', severity: 'error', message: `${name} failed${ran}${why}`, url: job.url };
  }
  if (job.stage === 'COMPLETED' && config.notifyOnComplete) {
    return {
      key: `${job.id}:completed`,
      kind: 'completed',
      severity: 'info',
      message: `${name} completed${ran}${cost}.`,
      url: job.url,
    };
  }
  return undefined;
}

/**
 * Every alert the current state calls for.
 *
 * @param jobs - All jobs, priced.
 * @param spend - Their totals, for the budget.
 * @param now - The time the jobs were fetched.
 * @param config - Thresholds; a threshold of `0` disables its alert.
 */
export function alertsFor(jobs: readonly PricedJob[], spend: Spend, now: Date, config: JobwatchConfig): Alert[] {
  const out: Alert[] = [];
  for (const job of jobs) {
    if (job.phase === 'finished') {
      const alert = finishedAlert(job, config);
      if (alert) {
        out.push(alert);
      }
      continue;
    }
    if (job.phase === 'queued' && config.queueWarningMinutes > 0) {
      const waited = (now.getTime() - job.createdAt.getTime()) / 1000;
      if (waited >= config.queueWarningMinutes * 60) {
        out.push({
          key: `${job.id}:queued`,
          kind: 'queued-long',
          severity: 'warning',
          message: `${jobLabel(job)} has waited ${formatDuration(waited)} for ${job.flavor} hardware without starting.`,
          url: job.url,
        });
      }
    }
    if (job.phase === 'running' && config.timeoutWarningMinutes > 0 && job.timeoutSecs && job.elapsedRunningSecs !== undefined) {
      const left = job.timeoutSecs - job.elapsedRunningSecs;
      if (left > 0 && left <= config.timeoutWarningMinutes * 60) {
        out.push({
          key: `${job.id}:timeout`,
          kind: 'timeout-near',
          severity: 'warning',
          message: `${jobLabel(job)} will hit its ${formatDuration(job.timeoutSecs)} timeout in ${formatDuration(left)} and be stopped.`,
          url: job.url,
        });
      }
    }
  }
  if (config.monthlyBudgetUsd > 0 && spend.monthUsd >= config.monthlyBudgetUsd) {
    out.push({
      key: `budget:${monthKey(now)}`,
      kind: 'budget',
      severity: 'warning',
      message: `Estimated Hugging Face Jobs spend this month is ${formatUsd(spend.monthUsd)}, past your ${formatUsd(config.monthlyBudgetUsd)} budget.`,
    });
  }
  return out;
}
