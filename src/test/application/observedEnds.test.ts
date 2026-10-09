/**
 * @file Tests for standing in a last sighting for the end time a provider does not record.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { MAX_OBSERVED, OBSERVED_KEY, ObservedEnds } from '../../application/observedEnds';
import type { KeyValueStore } from '../../application/ports';
import { job } from '../fixtures';

const memory = () => {
  const m = new Map<string, unknown>();
  const store: KeyValueStore = { get: <T>(k: string) => m.get(k) as T | undefined, update: async (k, v) => void m.set(k, v) };
  return { m, store };
};
const T1 = new Date('2026-10-09T11:00:00Z');

describe('ObservedEnds', () => {
  it('uses the last sighting as the end of a job cancelled without one', async () => {
    const { store } = memory();
    const ends = new ObservedEnds(store);
    await ends.apply([job({ id: 'a' })], T1);
    const [a] = await ends.apply([job({ id: 'a', stage: 'CANCELED' })], new Date('2026-10-09T12:00:00Z'));
    assert.equal(a?.finishedAt?.toISOString(), T1.toISOString());
    assert.equal(a?.endObserved, true);
  });

  it('never overrides a time the provider reported', async () => {
    const { store } = memory();
    const ends = new ObservedEnds(store);
    await ends.apply([job({ id: 'a' })], T1);
    const [a] = await ends.apply([job({ id: 'a', stage: 'COMPLETED', runningSecs: 42 })], T1);
    assert.equal(a?.finishedAt, undefined);
    assert.equal(a?.endObserved, undefined);
  });

  it('leaves a job it never saw running unknown', async () => {
    const [a] = await new ObservedEnds(memory().store).apply([job({ id: 'z', stage: 'CANCELED' })], T1);
    assert.equal(a?.finishedAt, undefined);
  });

  it('keeps the newest sightings when the list is full', async () => {
    const { m, store } = memory();
    m.set(OBSERVED_KEY, Object.fromEntries(Array.from({ length: MAX_OBSERVED }, (_, i) => [`old${i}`, '2026-01-01T00:00:00.000Z'])));
    await new ObservedEnds(store).apply([job({ id: 'new' })], T1);
    const kept = m.get(OBSERVED_KEY) as Record<string, string>;
    assert.equal(Object.keys(kept).length, MAX_OBSERVED);
    assert.equal(kept.new, T1.toISOString());
  });
});
