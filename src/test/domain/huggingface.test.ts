/**
 * @file Tests for parsing Hugging Face job and hardware responses.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { jobUrl, parseHardware, parseJob, parseJobs, UnexpectedResponseError } from '../../domain/huggingface';
import { ENDPOINT, rawJob } from '../fixtures';

describe('parseJob', () => {
  it('maps the raw fields a running job carries', () => {
    const job = parseJob(rawJob(), ENDPOINT);
    assert.ok(job);
    assert.equal(job.id, '6abedec0aaaabbbbccccdddd');
    assert.equal(job.name, 'fintfm-c5-sba-s0');
    assert.equal(job.flavor, 'a10g-small');
    assert.equal(job.stage, 'RUNNING');
    assert.equal(job.timeoutSecs, 7200);
    assert.equal(job.startedAt?.toISOString(), '2026-10-09T10:03:00.000Z');
    assert.equal(job.url, 'https://huggingface.co/jobs/kabartay/6abedec0aaaabbbbccccdddd');
  });

  it('reads the failure message and durations of a failed job', () => {
    const job = parseJob(
      rawJob({
        status: { stage: 'ERROR', message: 'Job failed with exit code: 137. Reason: OOMKilled' },
        durations: { schedulingSecs: 177, runningSecs: 310, totalSecs: 488 },
      }),
      ENDPOINT,
    );
    assert.equal(job?.message, 'Job failed with exit code: 137. Reason: OOMKilled');
    assert.equal(job?.runningSecs, 310);
  });

  it('never copies the environment or secrets', () => {
    assert.doesNotMatch(JSON.stringify(parseJob(rawJob(), ENDPOINT)), /SECRET_SHOULD_NEVER_BE_READ/);
  });

  for (const [what, over] of [
    ['no id', { id: undefined }],
    ['no flavour', { flavor: '' }],
    ['no stage', { status: {} }],
    ['an unparseable creation time', { createdAt: 'yesterday' }],
  ] as const) {
    it(`drops a job with ${what}`, () => {
      assert.equal(parseJob(rawJob(over), ENDPOINT), undefined);
    });
  }

  it('keeps a job without a start time, as a queued one has none', () => {
    assert.equal(parseJob(rawJob({ startedAt: undefined, status: { stage: 'SCHEDULING' } }), ENDPOINT)?.startedAt, undefined);
  });
});

describe('parseJobs', () => {
  it('skips malformed entries and counts them', () => {
    const { jobs, skipped } = parseJobs([rawJob(), { id: 'x' }, 'nonsense'], ENDPOINT);
    assert.equal(jobs.length, 1);
    assert.equal(skipped, 2);
  });

  it('refuses a body that is not a list', () => {
    assert.throws(() => parseJobs({ error: 'nope' }, ENDPOINT), UnexpectedResponseError);
  });
});

describe('parseHardware', () => {
  it('reads the price fields under their raw names', () => {
    const hw = parseHardware([
      { name: 'cpu-basic', prettyName: 'CPU Basic', unitCostMicroUSD: 167, unitCostUSD: 0.000167, unitLabel: 'minute' },
      { name: 'broken' },
    ]);
    assert.deepEqual(hw, [{ name: 'cpu-basic', prettyName: 'CPU Basic', unitCostUsd: 0.000167, unitLabel: 'minute' }]);
  });

  it('refuses a body that is not a list', () => {
    assert.throws(() => parseHardware(null), UnexpectedResponseError);
  });
});

describe('jobUrl', () => {
  it('encodes the owner and id and ignores a trailing slash', () => {
    assert.equal(jobUrl('https://huggingface.co/', 'my org', 'a/b'), 'https://huggingface.co/jobs/my%20org/a%2Fb');
  });
});
