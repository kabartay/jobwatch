/**
 * @file Text the editor shows: money, durations, the status bar line and its tooltip.
 *
 * Pure string building, so every wording is unit-tested without VS Code.
 */

import type { PricedJob, Spend } from './types';

/** `$0.84`, `<$0.01` for a cost too small to show, `$12.40`. */
export function formatUsd(usd: number): string {
  if (usd > 0 && usd < 0.005) {
    return '<$0.01';
  }
  return `$${usd.toFixed(2)}`;
}

/** `45s`, `12m`, `2h 05m`, `3d 4h`. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) {
    return `${s}s`;
  }
  const m = Math.floor(s / 60);
  if (m < 60) {
    return `${m}m`;
  }
  const h = Math.floor(m / 60);
  if (h < 48) {
    return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  }
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** A job's display name: its label, else its flavour and a short id. */
export function jobLabel(job: Pick<PricedJob, 'name' | 'flavor' | 'id'>): string {
  return job.name ?? `${job.flavor} ${job.id.slice(0, 8)}`;
}

/** Whether a failure message names an out-of-memory kill (exit code 137 or `OOMKilled`). */
export function isOutOfMemory(message: string | undefined): boolean {
  return message !== undefined && /\bexit code:?\s*137\b|OOMKilled/i.test(message);
}

/**
 * The status bar text.
 *
 * Busy: `$(pulse) 2 running · 1 queued · $1.84`, the cost so far of what is running. Idle:
 * `$(server-process) $12.40 this month`.
 */
export function statusText(spend: Spend): string {
  if (spend.runningCount > 0 || spend.queuedCount > 0) {
    const parts = [];
    if (spend.runningCount > 0) {
      parts.push(`${spend.runningCount} running`);
    }
    if (spend.queuedCount > 0) {
      parts.push(`${spend.queuedCount} queued`);
    }
    parts.push(formatUsd(spend.runningUsd));
    return `$(pulse) ${parts.join(' · ')}`;
  }
  return `$(server-process) ${formatUsd(spend.monthUsd)} this month`;
}

const PHASE_MARK = { queued: '⏳', running: '▶', finished: '' } as const;

function stageMark(job: PricedJob): string {
  if (job.phase !== 'finished') {
    return PHASE_MARK[job.phase];
  }
  return job.stage === 'COMPLETED' ? '✓' : job.stage === 'ERROR' ? '✗' : '–';
}

function jobRow(job: PricedJob, now: Date): string {
  const time =
    job.phase === 'queued'
      ? `waiting ${formatDuration((now.getTime() - job.createdAt.getTime()) / 1000)}`
      : job.elapsedRunningSecs !== undefined
        ? formatDuration(job.elapsedRunningSecs)
        : '—';
  const cost = job.costUsd !== undefined ? formatUsd(job.costUsd) : '—';
  const detail = job.stage === 'ERROR' && isOutOfMemory(job.message) ? ' · out of memory' : '';
  return `| ${stageMark(job)} | [${jobLabel(job).replace(/\|/g, '/')}](${job.url}) | \`${job.flavor}\` | ${time}${detail} | ${cost} |`;
}

/**
 * Markdown tooltip: active jobs, the most recent finished ones, and the totals.
 *
 * @param jobs - Every job, newest first.
 * @param recent - How many finished jobs to list after the active ones.
 */
export function tooltipMarkdown(jobs: readonly PricedJob[], spend: Spend, budgetUsd: number, now: Date, recent = 5): string {
  const active = jobs.filter((j) => j.phase !== 'finished');
  const finished = jobs.filter((j) => j.phase === 'finished').slice(0, recent);
  const lines = ['**Hugging Face Jobs**', ''];
  if (active.length === 0 && finished.length === 0) {
    lines.push('No jobs yet.');
  } else {
    lines.push('| | Job | Hardware | Time | Est. cost |', '| --- | --- | --- | --- | --- |');
    lines.push(...active.map((j) => jobRow(j, now)), ...finished.map((j) => jobRow(j, now)));
  }
  const budget = budgetUsd > 0 ? ` of ${formatUsd(budgetUsd)} budget` : '';
  lines.push(
    '',
    `Today ${formatUsd(spend.todayUsd)} · this month ${formatUsd(spend.monthUsd)}${budget}`,
    '',
    '<sub>Estimated from running time × listed hardware price; your invoice is authoritative.</sub>',
  );
  if (spend.unpricedCount > 0) {
    const bound = spend.unpricedMaxUsd > 0 ? `: at most ${formatUsd(spend.unpricedMaxUsd)} more, by their time limits` : '';
    lines.push(
      `<sub>${spend.unpricedCount} job(s) this month have no end time and are not counted${bound}. ` +
        'Hugging Face records none for a job cancelled before Jobwatch saw it stop.</sub>',
    );
  }
  return lines.join('\n');
}
