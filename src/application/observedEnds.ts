/**
 * @file Remembers when each job was last seen running, to stand in for an end time the provider
 * never records.
 *
 * Hugging Face keeps no end time and no duration for a cancelled job, so its cost would be
 * unknowable. While Jobwatch is open it sees a job running at each refresh; the last of those
 * sightings is a lower bound on when it stopped, accurate to one refresh interval. Jobs that
 * stopped while Jobwatch was not watching stay unknown and are bounded by their time limit
 * instead (see `maxCostUsd`).
 */

import { phaseOf } from '../domain/cost';
import type { Job } from '../domain/types';
import type { KeyValueStore } from './ports';

/** Where sightings are stored: job id → ISO time last seen running. */
export const OBSERVED_KEY = 'jobwatch.lastSeenRunning';

/** Sightings kept, newest first; a job finishes long before it falls off this list. */
export const MAX_OBSERVED = 2000;

/** Records sightings of running jobs and fills in end times for finished jobs that lack one. */
export class ObservedEnds {
  /** @param store - Persists sightings across reloads. */
  constructor(private readonly store: KeyValueStore) {}

  /**
   * @param jobs - The latest job list.
   * @param now - When it was fetched.
   * @returns The same jobs, where a finished one with no running time and no end time gets the
   *   last sighting as `finishedAt`, marked `endObserved`.
   */
  async apply(jobs: readonly Job[], now: Date): Promise<Job[]> {
    const seen = new Map(Object.entries(this.store.get<Record<string, string>>(OBSERVED_KEY) ?? {}));
    let changed = false;
    const out = jobs.map((job) => {
      const phase = phaseOf(job);
      if (phase === 'running') {
        seen.set(job.id, now.toISOString());
        changed = true;
        return job;
      }
      const last = seen.get(job.id);
      if (phase === 'finished' && last && job.runningSecs === undefined && !job.finishedAt) {
        return { ...job, finishedAt: new Date(last), endObserved: true };
      }
      return job;
    });
    if (changed) {
      const newestFirst = [...seen.entries()].sort((a, b) => b[1].localeCompare(a[1])).slice(0, MAX_OBSERVED);
      await this.store.update(OBSERVED_KEY, Object.fromEntries(newestFirst));
    }
    return out;
  }
}
