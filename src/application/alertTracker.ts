/**
 * @file Makes each alert fire once, across refreshes and window reloads.
 *
 * The first time Jobwatch sees an account it marks everything already true as seen without
 * notifying: otherwise installing it would raise a notification for every job ever run (121 on
 * the account this was built against). After that, only alerts that newly apply are returned.
 */

import type { Alert } from '../domain/types';
import type { KeyValueStore } from './ports';

/** Where the seen keys are stored. */
export const SEEN_KEY = 'jobwatch.seenAlerts';

/** Seen keys kept; older ones are dropped, oldest first. */
export const MAX_SEEN = 5000;

/** Remembers which alerts have fired. */
export class AlertTracker {
  /** @param store - Persists the seen keys. */
  constructor(private readonly store: KeyValueStore) {}

  /**
   * @param alerts - Every alert the current state calls for.
   * @returns The ones not seen before. On the very first call, none: all are recorded as seen.
   */
  async fresh(alerts: readonly Alert[]): Promise<Alert[]> {
    const stored = this.store.get<string[]>(SEEN_KEY);
    const seen = new Set(stored ?? []);
    const firstRun = stored === undefined;
    const out = firstRun ? [] : alerts.filter((a) => !seen.has(a.key));
    if (firstRun || out.length > 0) {
      const merged = [...seen, ...alerts.map((a) => a.key).filter((k) => !seen.has(k))];
      await this.store.update(SEEN_KEY, merged.slice(-MAX_SEEN));
    }
    return out;
  }
}
