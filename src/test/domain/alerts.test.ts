/**
 * @file Tests for which alerts the current state calls for.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { alertsFor, monthKey } from '../../domain/alerts';
import { priceJobs, spendOf } from '../../domain/cost';
import type { Job, JobwatchConfig } from '../../domain/types';
import { HARDWARE, job } from '../fixtures';

const NOW = new Date('2026-10-09T11:03:00Z');
const CONFIG: JobwatchConfig = {
  monthlyBudgetUsd: 0, notifyOnComplete: true, timeoutWarningMinutes: 15, queueWarningMinutes: 20,
  pollSecondsActive: 60, pollSecondsIdle: 600, namespace: '',
};

const alerts = (jobs: Job[], config: Partial<JobwatchConfig> = {}) => {
  const priced = priceJobs(jobs, HARDWARE, NOW);
  return alertsFor(priced, spendOf(priced, NOW), NOW, { ...CONFIG, ...config });
};

describe('alertsFor', () => {
  it('names an out-of-memory failure as such, with its running time and cost', () => {
    const [a] = alerts([job({ stage: 'ERROR', runningSecs: 310, message: 'Job failed with exit code: 137. Reason: OOMKilled' })]);
    assert.equal(a?.kind, 'out-of-memory');
    assert.equal(a?.severity, 'error');
    assert.match(a?.message ?? '', /ran out of memory on a10g-small after 5m/);
    assert.equal(a?.key, '6abedec0aaaabbbbccccdddd:failed');
  });

  it('quotes the reason of any other failure', () => {
    const [a] = alerts([job({ stage: 'ERROR', runningSecs: 60, message: 'Job failed with exit code: 1.' })]);
    assert.equal(a?.kind, 'failed');
    assert.match(a?.message ?? '', /exit code: 1/);
  });

  it('announces a completion only when asked to', () => {
    const done = job({ stage: 'COMPLETED', runningSecs: 600 });
    assert.equal(alerts([done])[0]?.kind, 'completed');
    assert.equal(alerts([done], { notifyOnComplete: false }).length, 0);
  });

  it('says nothing about a cancelled job', () => {
    assert.equal(alerts([job({ stage: 'CANCELED' })]).length, 0);
  });

  it('warns before a job hits its own timeout, not long before', () => {
    const nearly = job({ startedAt: new Date(NOW.getTime() - (7200 - 600) * 1000) });
    assert.equal(alerts([nearly])[0]?.kind, 'timeout-near');
    assert.equal(alerts([job()]).length, 0, 'an hour left is not near');
    assert.equal(alerts([nearly], { timeoutWarningMinutes: 0 }).length, 0, '0 turns it off');
  });

  it('warns about a job stuck in the queue', () => {
    const stuck = job({ stage: 'SCHEDULING', startedAt: undefined, createdAt: new Date(NOW.getTime() - 25 * 60_000) });
    assert.equal(alerts([stuck])[0]?.kind, 'queued-long');
    assert.equal(alerts([stuck], { queueWarningMinutes: 30 }).length, 0);
  });

  it('warns once a month when spend passes the budget', () => {
    const [a] = alerts([job()], { monthlyBudgetUsd: 0.5 });
    assert.equal(a?.kind, 'budget');
    assert.equal(a?.key, `budget:${monthKey(NOW)}`);
    assert.equal(alerts([job()], { monthlyBudgetUsd: 5 }).length, 0);
  });
});
