/**
 * @file The extension's vocabulary: jobs, hardware prices, spend and alerts.
 *
 * Plain data shared by every layer. Shapes are provider-neutral; each provider's parser maps
 * its own response onto them, so the status bar never knows which service a job came from.
 */

/** Where a job runs. Only Hugging Face in 0.1; Kaggle is planned. */
export type ProviderId = 'huggingface';

/**
 * A job's lifecycle stage as the provider reports it. The known ones are listed; anything else
 * is kept verbatim and treated as queued if the job has not started, finished if it has.
 */
export type JobStage = 'SCHEDULING' | 'RUNNING' | 'COMPLETED' | 'ERROR' | 'CANCELED' | 'DELETED' | (string & {});

/** One job, normalised from a provider's response. */
export interface Job {
  readonly provider: ProviderId;
  readonly id: string;
  /** A human label when the job has one (Hugging Face's `labels.name`), else undefined. */
  readonly name?: string;
  readonly owner: string;
  /** Hardware flavour, e.g. `a10g-large`. */
  readonly flavor: string;
  readonly stage: JobStage;
  /** The provider's status message, e.g. `Job failed with exit code: 137. Reason: OOMKilled`. */
  readonly message?: string;
  readonly createdAt: Date;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
  /** Billed running time as the provider reports it; absent for some cancelled jobs. */
  readonly runningSecs?: number;
  /** The job's own time limit, after which the provider kills it. */
  readonly timeoutSecs?: number;
  /** The job's page. */
  readonly url: string;
  /**
   * True when `finishedAt` is not from the provider but the last time Jobwatch saw the job
   * running: the provider records no end time for a cancelled job.
   */
  readonly endObserved?: boolean;
}

/** A hardware flavour and its price. */
export interface Hardware {
  readonly name: string;
  readonly prettyName: string;
  readonly unitCostUsd: number;
  /** The unit `unitCostUsd` is charged per: `minute` on Hugging Face today. */
  readonly unitLabel: string;
}

/** Where a job is in its life, collapsed to what the status bar needs. */
export type JobPhase = 'queued' | 'running' | 'finished';

/** A job with its estimated running time and cost. */
export interface PricedJob extends Job {
  readonly phase: JobPhase;
  /** Running time used for cost: reported, measured to now, or `undefined` when unknowable. */
  readonly elapsedRunningSecs?: number;
  /** Estimated cost; `undefined` when the flavour has no known price or the time is unknown. */
  readonly costUsd?: number;
  /**
   * When the cost is unknown but the job had a time limit: the most it could have cost, at the
   * listed price for its whole timeout. A bound, never an estimate.
   */
  readonly maxCostUsd?: number;
}

/** Totals across all jobs, for the status bar. */
export interface Spend {
  readonly runningCount: number;
  readonly queuedCount: number;
  /** Estimated cost so far of the jobs still running. */
  readonly runningUsd: number;
  /** Estimated cost of jobs started today, local time. */
  readonly todayUsd: number;
  /** Estimated cost of jobs started this calendar month, local time. */
  readonly monthUsd: number;
  /** Jobs started this month whose cost could not be estimated (no price or no end time). */
  readonly unpricedCount: number;
  /** The most those jobs could have cost, from their time limits; 0 when none had one. */
  readonly unpricedMaxUsd: number;
}

/** Why a notification is raised. */
export type AlertKind = 'failed' | 'out-of-memory' | 'completed' | 'timeout-near' | 'queued-long' | 'budget';

/** One notification, with a key that makes it fire at most once. */
export interface Alert {
  /** Stable identity, e.g. `<job id>:failed` or `budget:2026-10`. */
  readonly key: string;
  readonly kind: AlertKind;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  /** The job's page, when the alert is about one job. */
  readonly url?: string;
}

/** The settings, typed and corrected. */
export interface JobwatchConfig {
  /** `0` means no budget. */
  readonly monthlyBudgetUsd: number;
  readonly notifyOnComplete: boolean;
  /** `0` turns the warning off. */
  readonly timeoutWarningMinutes: number;
  /** `0` turns the warning off. */
  readonly queueWarningMinutes: number;
  readonly pollSecondsActive: number;
  readonly pollSecondsIdle: number;
  /** Empty means the token's own account. */
  readonly namespace: string;
}
