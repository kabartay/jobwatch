/**
 * @file Reads the `jobwatch.*` settings into a typed, corrected object.
 */

import * as vscode from 'vscode';
import type { JobwatchConfig } from '../domain/types';

/** The settings section every key lives under. */
export const CONFIG_SECTION = 'jobwatch';

/** Defaults, matching `package.json`'s `contributes.configuration`. */
export const DEFAULT_CONFIG: JobwatchConfig = {
  monthlyBudgetUsd: 0,
  notifyOnComplete: true,
  timeoutWarningMinutes: 15,
  queueWarningMinutes: 20,
  pollSecondsActive: 60,
  pollSecondsIdle: 600,
  namespace: '',
};

/** Floors that keep a mistyped setting from polling the Hub every second. */
export const MIN_POLL_ACTIVE = 30;
export const MIN_POLL_IDLE = 120;

const nonNegative = (v: number | undefined, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;

/** @returns The current settings; read on every use, so changes apply without a reload. */
export function readConfig(): JobwatchConfig {
  const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    monthlyBudgetUsd: nonNegative(c.get<number>('monthlyBudgetUsd'), DEFAULT_CONFIG.monthlyBudgetUsd),
    notifyOnComplete: c.get<boolean>('notifyOnComplete') ?? DEFAULT_CONFIG.notifyOnComplete,
    timeoutWarningMinutes: nonNegative(c.get<number>('timeoutWarningMinutes'), DEFAULT_CONFIG.timeoutWarningMinutes),
    queueWarningMinutes: nonNegative(c.get<number>('queueWarningMinutes'), DEFAULT_CONFIG.queueWarningMinutes),
    pollSecondsActive: Math.max(MIN_POLL_ACTIVE, nonNegative(c.get<number>('pollSecondsActive'), DEFAULT_CONFIG.pollSecondsActive)),
    pollSecondsIdle: Math.max(MIN_POLL_IDLE, nonNegative(c.get<number>('pollSecondsIdle'), DEFAULT_CONFIG.pollSecondsIdle)),
    namespace: c.get<string>('namespace') ?? DEFAULT_CONFIG.namespace,
  };
}
