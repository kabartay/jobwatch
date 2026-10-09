/**
 * @file Tests for money, durations, the status line and the tooltip.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { priceJobs, spendOf } from '../../domain/cost';
import { formatDuration, formatUsd, isOutOfMemory, jobCostText, jobLabel, jobTimeText, statusText, tooltipMarkdown } from '../../domain/format';
import type { Spend } from '../../domain/types';
import { HARDWARE, job } from '../fixtures';

const NOW = new Date('2026-10-09T11:03:00Z');
const spend = (over: Partial<Spend> = {}): Spend => ({
  runningCount: 0, queuedCount: 0, runningUsd: 0, todayUsd: 0, monthUsd: 0, unpricedCount: 0, unpricedMaxUsd: 0, ...over,
});

describe('formatUsd', () => {
  it('rounds to cents and marks tiny amounts', () => {
    assert.equal(formatUsd(0), '$0.00');
    assert.equal(formatUsd(0.001), '<$0.01');
    assert.equal(formatUsd(12.4), '$12.40');
  });
});

describe('formatDuration', () => {
  it('scales from seconds to days', () => {
    assert.equal(formatDuration(45), '45s');
    assert.equal(formatDuration(12 * 60), '12m');
    assert.equal(formatDuration(2 * 3600 + 5 * 60), '2h 05m');
    assert.equal(formatDuration(3 * 86400 + 4 * 3600), '3d 4h');
  });
});

describe('isOutOfMemory', () => {
  it('recognises the Hub messages for an out-of-memory kill', () => {
    assert.equal(isOutOfMemory('Job failed with exit code: 137. Reason: OOMKilled'), true);
    assert.equal(isOutOfMemory('exit code 137'), true);
    assert.equal(isOutOfMemory('Job failed with exit code: 1.'), false);
    assert.equal(isOutOfMemory(undefined), false);
  });
});

describe('jobLabel', () => {
  it('uses the label, else the flavour and a short id', () => {
    assert.equal(jobLabel(job()), 'fintfm-c5-sba-s0');
    assert.equal(jobLabel(job({ name: undefined })), 'a10g-small 6abedec0');
  });
});

describe('statusText', () => {
  it('shows what is running and what it has cost', () => {
    assert.equal(statusText(spend({ runningCount: 2, queuedCount: 1, runningUsd: 1.84 })), '$(pulse) 2 running · 1 queued · $1.84');
  });

  it('shows the month when nothing is active', () => {
    assert.equal(statusText(spend({ monthUsd: 12.4 })), '$(server-process) $12.40 this month');
  });
});

describe('tooltipMarkdown', () => {
  it('lists active jobs first, names an out-of-memory failure, and says the cost is estimated', () => {
    const priced = priceJobs(
      [
        job({ id: 'f', name: 'old-run', stage: 'ERROR', runningSecs: 310, message: 'Job failed with exit code: 137. Reason: OOMKilled' }),
        job({ id: 'r', name: 'live-run' }),
      ],
      HARDWARE,
      NOW,
    );
    const text = tooltipMarkdown(priced, spendOf(priced, NOW), 50, NOW);
    assert.ok(text.indexOf('live-run') < text.indexOf('old-run'), 'active before finished');
    assert.match(text, /out of memory/);
    assert.match(text, /of \$50\.00 budget/);
    assert.match(text, /Estimated from running time/);
  });

  it('says so when there are no jobs', () => {
    assert.match(tooltipMarkdown([], spend(), 0, NOW), /No jobs yet/);
  });
});

describe('tooltipMarkdown, unpriced jobs', () => {
  it('bounds what jobs with no end time could have cost', () => {
    const text = tooltipMarkdown([], spend({ unpricedCount: 2, unpricedMaxUsd: 4 }), 0, NOW);
    assert.match(text, /2 job\(s\) this month have no end time and are not counted: at most \$4\.00 more, by their time limits/);
  });
});

describe('jobTimeText and jobCostText', () => {
  it('shows a known cost plainly', () => {
    const [done] = priceJobs([job({ stage: 'COMPLETED', runningSecs: 310 })], HARDWARE, NOW);
    assert.ok(done);
    assert.equal(jobTimeText(done, NOW), '5m');
    assert.equal(jobCostText(done), '$0.09');
  });

  it('bounds a cancelled job with no end time by its time limit', () => {
    const [cancelled] = priceJobs([job({ stage: 'CANCELED', timeoutSecs: 7200 })], HARDWARE, NOW);
    assert.ok(cancelled);
    assert.equal(jobTimeText(cancelled, NOW), 'no end time');
    assert.equal(jobCostText(cancelled), 'up to $2.00');
  });

  it('marks an observed end as a lower bound', () => {
    const [seen] = priceJobs([job({ stage: 'CANCELED', finishedAt: new Date('2026-10-09T10:13:00Z'), endObserved: true })], HARDWARE, NOW);
    assert.ok(seen);
    assert.equal(jobTimeText(seen, NOW), '≥ 10m');
    assert.equal(jobCostText(seen), '≥ $0.17');
  });

  it('shows how long a queued job has waited', () => {
    const [queued] = priceJobs([job({ stage: 'SCHEDULING', startedAt: undefined })], HARDWARE, NOW);
    assert.ok(queued);
    assert.equal(jobTimeText(queued, NOW), 'waiting 1h 03m');
  });
});
