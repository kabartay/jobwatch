/**
 * @file The status bar item: running jobs and their cost so far, or this month's spend.
 */

import * as vscode from 'vscode';
import type { ProviderError } from '../application/errors';
import type { Snapshot } from '../application/jobService';
import { formatUsd, statusText, tooltipMarkdown } from '../domain/format';
import type { JobwatchConfig } from '../domain/types';

/** Owns the single status bar item. */
export class JobStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem('jobwatch.status', vscode.StatusBarAlignment.Right, 101);

  constructor() {
    this.item.name = 'Jobwatch';
    this.item.command = 'jobwatch.openJob';
    this.item.text = '$(sync~spin) Jobwatch';
    this.item.tooltip = 'Jobwatch: reading your Hugging Face Jobs…';
    this.item.show();
  }

  /** Draws a successful refresh. */
  render(snapshot: Snapshot, config: JobwatchConfig): void {
    const { spend } = snapshot;
    this.item.text = statusText(spend);
    const tooltip = new vscode.MarkdownString(tooltipMarkdown(snapshot.jobs, spend, config.monthlyBudgetUsd, snapshot.fetchedAt));
    tooltip.supportHtml = true;
    tooltip.isTrusted = false;
    this.item.tooltip = tooltip;
    const overBudget = config.monthlyBudgetUsd > 0 && spend.monthUsd >= config.monthlyBudgetUsd;
    this.item.backgroundColor = overBudget ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
  }

  /**
   * Draws a failed refresh. With an earlier result on screen, it stays and is marked stale, so
   * a passing network blip does not wipe the numbers.
   */
  renderError(error: ProviderError, previous: Snapshot | undefined): void {
    if (previous) {
      this.item.text = `$(warning) ${statusText(previous.spend).replace(/^\$\([a-z-~]+\) /, '')}`;
      this.item.tooltip = `Jobwatch: showing results from ${previous.fetchedAt.toLocaleTimeString()}. ${error.message}`;
      return;
    }
    this.item.text = error.failure === 'no-token' ? '$(key) Jobwatch: no token' : '$(warning) Jobwatch';
    this.item.tooltip = `Jobwatch: ${error.message}`;
    this.item.backgroundColor = undefined;
  }

  /** Spins only the icon while a manual refresh runs. */
  setRefreshing(refreshing: boolean): void {
    if (refreshing) {
      this.item.text = this.item.text.replace(/^\$\([a-z-]+(~spin)?\)/, '$(sync~spin)');
    }
  }

  /** The one-line summary the log records, e.g. `1 running · $0.84 · month $12.40`. */
  static summary(snapshot: Snapshot): string {
    const { spend } = snapshot;
    const active =
      spend.runningCount + spend.queuedCount > 0
        ? `${spend.runningCount} running, ${spend.queuedCount} queued · ${formatUsd(spend.runningUsd)} so far · `
        : '';
    return `${active}today ${formatUsd(spend.todayUsd)} · month ${formatUsd(spend.monthUsd)}`;
  }

  dispose(): void {
    this.item.dispose();
  }
}
