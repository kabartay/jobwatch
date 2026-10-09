/**
 * @file One refresh: fetch jobs and prices, price the jobs, total the spend, find new alerts.
 */

import { alertsFor } from '../domain/alerts';
import { priceJobs, spendOf } from '../domain/cost';
import type { Alert, Hardware, JobwatchConfig, PricedJob, Spend } from '../domain/types';
import type { AlertTracker } from './alertTracker';
import type { ObservedEnds } from './observedEnds';
import type { JobProvider, Logger } from './ports';

/** Prices change rarely; refetching them every poll would only add requests. */
export const HARDWARE_TTL_MS = 6 * 60 * 60 * 1000;

/** What one refresh produced. */
export interface Snapshot {
  /** Every job, newest first, with phase, running time and estimated cost. */
  readonly jobs: PricedJob[];
  readonly spend: Spend;
  /** Alerts that newly apply since the last refresh. */
  readonly alerts: Alert[];
  readonly fetchedAt: Date;
}

/** Runs refreshes against one provider. */
export class JobService {
  private hardware: Hardware[] = [];
  private hardwareAt = 0;

  /**
   * @param provider - Lists jobs and prices.
   * @param tracker - Filters alerts to the ones not yet shown.
   * @param observed - Supplies end times the provider does not record.
   * @param log - Told when prices are refetched.
   */
  constructor(
    private readonly provider: JobProvider,
    private readonly tracker: AlertTracker,
    private readonly observed: ObservedEnds,
    private readonly log: Logger,
  ) {}

  /**
   * @throws {ProviderError} When jobs cannot be listed. A failure to refresh prices is not
   *   fatal while an earlier price list is cached.
   */
  async refresh(config: JobwatchConfig, now: Date = new Date()): Promise<Snapshot> {
    const [listed, hardware] = await Promise.all([this.provider.listJobs(), this.prices(now)]);
    const jobs = await this.observed.apply(listed, now);
    const priced = priceJobs(jobs, hardware, now).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const spend = spendOf(priced, now);
    const alerts = await this.tracker.fresh(alertsFor(priced, spend, now, config));
    return { jobs: priced, spend, alerts, fetchedAt: now };
  }

  private async prices(now: Date): Promise<Hardware[]> {
    if (this.hardware.length > 0 && now.getTime() - this.hardwareAt < HARDWARE_TTL_MS) {
      return this.hardware;
    }
    try {
      this.hardware = await this.provider.listHardware();
      this.hardwareAt = now.getTime();
      this.log.debug(`prices: ${this.hardware.length} hardware flavours`);
    } catch (err) {
      if (this.hardware.length === 0) {
        throw err;
      }
      this.log.warn(`prices: keeping the cached list (${err instanceof Error ? err.message : String(err)})`);
    }
    return this.hardware;
  }
}
