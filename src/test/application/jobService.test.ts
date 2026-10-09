/**
 * @file Tests for one refresh: ordering, pricing, price caching and alert filtering.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { AlertTracker } from '../../application/alertTracker';
import { ProviderError } from '../../application/errors';
import { HARDWARE_TTL_MS, JobService } from '../../application/jobService';
import { ObservedEnds } from '../../application/observedEnds';
import type { JobProvider, KeyValueStore, Logger } from '../../application/ports';
import type { Hardware, Job, JobwatchConfig } from '../../domain/types';
import { HARDWARE, job } from '../fixtures';

const silent: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined };
const CONFIG: JobwatchConfig = {
  monthlyBudgetUsd: 0, notifyOnComplete: true, timeoutWarningMinutes: 15, queueWarningMinutes: 20,
  pollSecondsActive: 60, pollSecondsIdle: 600, namespace: '',
};
const store = (): KeyValueStore => {
  const m = new Map<string, unknown>();
  return { get: <T>(k: string) => m.get(k) as T | undefined, update: async (k, v) => void m.set(k, v) };
};

class FakeProvider implements JobProvider {
  readonly id = 'huggingface' as const;
  hardwareCalls = 0;
  hardwareFails = false;
  constructor(public jobs: Job[]) {}
  async listJobs(): Promise<Job[]> {
    return this.jobs;
  }
  async listHardware(): Promise<Hardware[]> {
    this.hardwareCalls++;
    if (this.hardwareFails) {
      throw new ProviderError('unavailable', 'down');
    }
    return HARDWARE;
  }
}

const NOW = new Date('2026-10-09T11:03:00Z');

describe('JobService.refresh', () => {
  it('orders jobs newest first and prices them', async () => {
    const provider = new FakeProvider([job({ id: 'old', createdAt: new Date('2026-10-01T00:00:00Z') }), job({ id: 'new' })]);
    const snap = await new JobService(provider, new AlertTracker(store()), new ObservedEnds(store()), silent).refresh(CONFIG, NOW);
    assert.deepEqual(snap.jobs.map((j) => j.id), ['new', 'old']);
    assert.ok((snap.jobs[0]?.costUsd ?? 0) > 0);
    assert.equal(snap.spend.runningCount, 2);
  });

  it('fetches prices once per period, and keeps a cached list when a refetch fails', async () => {
    const provider = new FakeProvider([job()]);
    const service = new JobService(provider, new AlertTracker(store()), new ObservedEnds(store()), silent);
    await service.refresh(CONFIG, NOW);
    await service.refresh(CONFIG, new Date(NOW.getTime() + 60_000));
    assert.equal(provider.hardwareCalls, 1);
    provider.hardwareFails = true;
    const later = await service.refresh(CONFIG, new Date(NOW.getTime() + HARDWARE_TTL_MS + 1));
    assert.ok((later.jobs[0]?.costUsd ?? 0) > 0, 'prices still applied from the cache');
  });

  it('fails when prices have never been fetched', async () => {
    const provider = new FakeProvider([job()]);
    provider.hardwareFails = true;
    await assert.rejects(new JobService(provider, new AlertTracker(store()), new ObservedEnds(store()), silent).refresh(CONFIG, NOW), ProviderError);
  });

  it('reports a failure that happens after the first refresh, once', async () => {
    const provider = new FakeProvider([job()]);
    const service = new JobService(provider, new AlertTracker(store()), new ObservedEnds(store()), silent);
    assert.deepEqual((await service.refresh(CONFIG, NOW)).alerts, []);
    provider.jobs = [job({ stage: 'ERROR', runningSecs: 300, message: 'Job failed with exit code: 137. Reason: OOMKilled' })];
    assert.deepEqual((await service.refresh(CONFIG, NOW)).alerts.map((a) => a.kind), ['out-of-memory']);
    assert.deepEqual((await service.refresh(CONFIG, NOW)).alerts, []);
  });
});

describe('JobService with observed end times', () => {
  it('prices a cancelled job from the last time it was seen running', async () => {
    const provider = new FakeProvider([job({ id: 'c' })]);
    const service = new JobService(provider, new AlertTracker(store()), new ObservedEnds(store()), silent);
    await service.refresh(CONFIG, NOW);
    provider.jobs = [job({ id: 'c', stage: 'CANCELED' })];
    const later = await service.refresh(CONFIG, new Date(NOW.getTime() + 600_000));
    const cancelled = later.jobs[0];
    assert.equal(cancelled?.endObserved, true);
    assert.equal(cancelled?.elapsedRunningSecs, 3600, 'started 10:03, last seen running 11:03');
    assert.equal(later.spend.unpricedCount, 0);
  });
});
