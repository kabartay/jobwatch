/**
 * @file Tests for phases, running time, estimated cost and spend totals.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { phaseOf, priceJobs, runningSeconds, secondsPerUnit, spendOf } from '../../domain/cost';
import { HARDWARE, job } from '../fixtures';

const NOW = new Date('2026-10-09T11:03:00Z');

describe('phaseOf', () => {
  it('maps the known stages', () => {
    assert.equal(phaseOf(job({ stage: 'RUNNING' })), 'running');
    assert.equal(phaseOf(job({ stage: 'SCHEDULING', startedAt: undefined })), 'queued');
    for (const stage of ['COMPLETED', 'ERROR', 'CANCELED', 'DELETED']) {
      assert.equal(phaseOf(job({ stage })), 'finished');
    }
  });

  it('treats an unknown stage by whether the job has started', () => {
    assert.equal(phaseOf(job({ stage: 'PREPARING', startedAt: undefined })), 'queued');
    assert.equal(phaseOf(job({ stage: 'UPLOADING' })), 'running');
  });
});

describe('runningSeconds', () => {
  it('measures a running job from its start to now', () => {
    assert.equal(runningSeconds(job(), 'running', NOW), 3600);
  });

  it('prefers the reported time for a finished job, then start-to-finish, then gives up', () => {
    assert.equal(runningSeconds(job({ stage: 'COMPLETED', runningSecs: 310 }), 'finished', NOW), 310);
    const finishedAt = new Date('2026-10-09T10:13:00Z');
    assert.equal(runningSeconds(job({ stage: 'COMPLETED', finishedAt }), 'finished', NOW), 600);
    assert.equal(runningSeconds(job({ stage: 'CANCELED' }), 'finished', NOW), undefined, 'a cancelled job with no times has no cost');
  });

  it('charges nothing for a queued job', () => {
    assert.equal(runningSeconds(job({ startedAt: undefined }), 'queued', NOW), 0);
  });
});

describe('secondsPerUnit', () => {
  it('knows the units and refuses others', () => {
    assert.equal(secondsPerUnit('minute'), 60);
    assert.equal(secondsPerUnit('Hour'), 3600);
    assert.equal(secondsPerUnit('fortnight'), undefined);
  });
});

describe('priceJobs', () => {
  it('prices an hour on an A10G small at about a dollar', () => {
    const [priced] = priceJobs([job()], HARDWARE, NOW);
    assert.ok(priced?.costUsd !== undefined);
    assert.ok(Math.abs(priced.costUsd - 1.00002) < 1e-6);
  });

  it('leaves the cost unknown for a flavour with no price', () => {
    assert.equal(priceJobs([job({ flavor: 'h100x8' })], HARDWARE, NOW)[0]?.costUsd, undefined);
  });
});

describe('spendOf', () => {
  it('counts running and queued jobs and totals today and the month', () => {
    const priced = priceJobs(
      [
        job({ id: 'a' }),
        job({ id: 'b', stage: 'SCHEDULING', startedAt: undefined }),
        job({ id: 'c', stage: 'COMPLETED', runningSecs: 600, startedAt: new Date('2026-10-01T09:00:00Z') }),
        job({ id: 'd', stage: 'COMPLETED', runningSecs: 600, startedAt: new Date('2026-09-30T09:00:00Z') }),
        job({ id: 'e', stage: 'CANCELED', startedAt: new Date('2026-10-02T09:00:00Z') }),
      ],
      HARDWARE,
      NOW,
    );
    const spend = spendOf(priced, NOW);
    assert.equal(spend.runningCount, 1);
    assert.equal(spend.queuedCount, 1);
    assert.ok(Math.abs(spend.todayUsd - 1.00002) < 1e-6, 'only the running job started today');
    assert.ok(Math.abs(spend.monthUsd - (1.00002 + 0.16667)) < 1e-6, 'September is excluded');
    assert.equal(spend.unpricedCount, 1, 'the cancelled job without times is counted as unpriced');
  });
});

describe('maxCostUsd', () => {
  it('bounds a cancelled job with no times by its timeout, and only then', () => {
    const [cancelled] = priceJobs([job({ stage: 'CANCELED', timeoutSecs: 7200 })], HARDWARE, NOW);
    assert.equal(cancelled?.costUsd, undefined);
    assert.ok(Math.abs((cancelled?.maxCostUsd ?? 0) - 2.00004) < 1e-6, '2 h of A10G small');
    const [done] = priceJobs([job({ stage: 'COMPLETED', runningSecs: 60 })], HARDWARE, NOW);
    assert.equal(done?.maxCostUsd, undefined, 'a known cost needs no bound');
  });

  it('adds the bounds of this month\'s unpriced jobs into the spend', () => {
    const priced = priceJobs([job({ stage: 'CANCELED', timeoutSecs: 7200 })], HARDWARE, NOW);
    assert.ok(Math.abs(spendOf(priced, NOW).unpricedMaxUsd - 2.00004) < 1e-6);
  });
});
