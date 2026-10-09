/**
 * @file Tests that each alert fires once and that installing Jobwatch is quiet.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { AlertTracker, MAX_SEEN, SEEN_KEY } from '../../application/alertTracker';
import type { KeyValueStore } from '../../application/ports';
import type { Alert } from '../../domain/types';

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, unknown>();
  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }
  async update(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }
}

const alert = (key: string): Alert => ({ key, kind: 'completed', severity: 'info', message: key });

describe('AlertTracker', () => {
  it('stays quiet on the first run and remembers everything already true', async () => {
    const tracker = new AlertTracker(new MemoryStore());
    assert.deepEqual(await tracker.fresh([alert('a'), alert('b')]), []);
    assert.deepEqual(await tracker.fresh([alert('a'), alert('b')]), [], 'history does not fire later either');
  });

  it('returns only new alerts afterwards, once each', async () => {
    const tracker = new AlertTracker(new MemoryStore());
    await tracker.fresh([alert('a')]);
    assert.deepEqual((await tracker.fresh([alert('a'), alert('c')])).map((x) => x.key), ['c']);
    assert.deepEqual(await tracker.fresh([alert('a'), alert('c')]), []);
  });

  it('treats an empty first run as a first run, so later alerts still fire', async () => {
    const tracker = new AlertTracker(new MemoryStore());
    await tracker.fresh([]);
    assert.deepEqual((await tracker.fresh([alert('n')])).map((x) => x.key), ['n']);
  });

  it('keeps the stored list bounded', async () => {
    const store = new MemoryStore();
    store.data.set(SEEN_KEY, Array.from({ length: MAX_SEEN }, (_, i) => `old${i}`));
    await new AlertTracker(store).fresh([alert('new')]);
    const kept = store.data.get(SEEN_KEY) as string[];
    assert.equal(kept.length, MAX_SEEN);
    assert.equal(kept.at(-1), 'new');
  });
});
