/**
 * @file Wires refreshes to VS Code: the adaptive timer, window focus, notifications and commands.
 *
 * Polls every `pollSecondsActive` while a job is queued or running, every `pollSecondsIdle`
 * otherwise, and backs off when the Hub says to slow down.
 */

import * as vscode from 'vscode';
import { ProviderError } from '../application/errors';
import type { JobService, Snapshot } from '../application/jobService';
import type { Logger } from '../application/ports';
import { jobCostText, jobLabel, jobTimeText } from '../domain/format';
import type { Alert } from '../domain/types';
import { CONFIG_SECTION, readConfig } from './config';
import { JobStatusBar } from './statusBar';

/** At most this many separate notifications per refresh; the rest are summarised in one. */
export const MAX_NOTIFICATIONS = 3;

/** The shortest pause after a 429, whatever `Retry-After` says. */
export const MIN_BACKOFF_SECONDS = 300;

/** Connects the job service to the editor. */
export class JobController implements vscode.Disposable {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private snapshot: Snapshot | undefined;
  private inFlight: Promise<void> | undefined;
  private lastSummary = '';
  private notifiedSetup: string | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly service: JobService,
    private readonly bar: JobStatusBar,
    private readonly log: Logger,
  ) {}

  /** Starts polling and listens for focus and settings changes. */
  start(): void {
    this.subscriptions.push(
      vscode.window.onDidChangeWindowState((s) => {
        if (s.focused && this.isDue()) {
          void this.refresh();
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CONFIG_SECTION)) {
          void this.refresh();
        }
      }),
    );
    void this.refresh();
  }

  /** Refreshes now; concurrent calls share one request. */
  refresh(manual = false): Promise<void> {
    this.inFlight ??= this.run(manual).finally(() => (this.inFlight = undefined));
    return this.inFlight;
  }

  /** Lets the user pick a job and opens its page. */
  async pickJob(): Promise<void> {
    if (!this.snapshot || this.snapshot.jobs.length === 0) {
      void vscode.window.showInformationMessage('Jobwatch: no jobs to open yet.');
      return;
    }
    const now = new Date();
    const items = this.snapshot.jobs.slice(0, 30).map((j) => ({
      label: jobLabel(j),
      description: `${j.flavor} · ${j.phase === 'finished' ? j.stage.toLowerCase() : j.phase}`,
      detail: [jobTimeText(j, now), jobCostText(j), j.createdAt.toLocaleString()].filter((t) => t !== '—').join(' · '),
      url: j.url,
    }));
    const choice = await vscode.window.showQuickPick(items, { title: 'Jobwatch: open a job', matchOnDescription: true });
    if (choice) {
      await vscode.env.openExternal(vscode.Uri.parse(choice.url));
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.subscriptions.forEach((s) => void s.dispose());
  }

  private async run(manual: boolean): Promise<void> {
    clearTimeout(this.timer);
    const config = readConfig();
    if (manual) {
      this.bar.setRefreshing(true);
    }
    let nextSeconds = config.pollSecondsIdle;
    try {
      this.snapshot = await this.service.refresh(config);
      this.bar.render(this.snapshot, config);
      this.notifiedSetup = undefined;
      const summary = JobStatusBar.summary(this.snapshot);
      if (summary !== this.lastSummary) {
        this.lastSummary = summary;
        this.log.info(summary);
      }
      this.notify(this.snapshot.alerts);
      const active = this.snapshot.spend.runningCount + this.snapshot.spend.queuedCount > 0;
      nextSeconds = active ? config.pollSecondsActive : config.pollSecondsIdle;
    } catch (err) {
      const error = err instanceof ProviderError ? err : new ProviderError('unavailable', String(err));
      this.log.warn(error.message);
      this.bar.renderError(error, this.snapshot);
      if (error.failure === 'rate-limited') {
        nextSeconds = Math.max(error.retryAfterSeconds ?? 0, MIN_BACKOFF_SECONDS);
      }
      this.notifySetup(error, manual);
    }
    this.timer = setTimeout(() => void this.refresh(), nextSeconds * 1000);
  }

  private isDue(): boolean {
    if (!this.snapshot) {
      return true;
    }
    const config = readConfig();
    const active = this.snapshot.spend.runningCount + this.snapshot.spend.queuedCount > 0;
    const interval = (active ? config.pollSecondsActive : config.pollSecondsIdle) * 1000;
    return Date.now() - this.snapshot.fetchedAt.getTime() >= interval;
  }

  private notify(alerts: readonly Alert[]): void {
    for (const alert of alerts.slice(0, MAX_NOTIFICATIONS)) {
      this.log.info(`alert: ${alert.message}`);
      const show =
        alert.severity === 'error'
          ? vscode.window.showErrorMessage
          : alert.severity === 'warning'
            ? vscode.window.showWarningMessage
            : vscode.window.showInformationMessage;
      const actions = alert.url ? ['Open Job'] : [];
      void show(`Jobwatch: ${alert.message}`, ...actions).then((choice) => {
        if (choice === 'Open Job' && alert.url) {
          void vscode.env.openExternal(vscode.Uri.parse(alert.url));
        }
      });
    }
    const rest = alerts.length - MAX_NOTIFICATIONS;
    if (rest > 0) {
      void vscode.window.showInformationMessage(`Jobwatch: ${rest} more job update(s); see the status bar for the list.`);
    }
  }

  /** Tells the user once about a problem only they can fix (no token, refused token). */
  private notifySetup(error: ProviderError, manual: boolean): void {
    const actionable = error.failure === 'no-token' || error.failure === 'unauthorized';
    if (!manual && (!actionable || this.notifiedSetup === error.failure)) {
      return;
    }
    this.notifiedSetup = error.failure;
    void vscode.window.showWarningMessage(`Jobwatch: ${error.message}`, 'Show Log').then((choice) => {
      if (choice === 'Show Log') {
        void vscode.commands.executeCommand('jobwatch.showLog');
      }
    });
  }
}
