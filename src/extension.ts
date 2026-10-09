/**
 * @file Composition root: builds the object graph and hands its disposables to VS Code.
 *
 * Dependencies point inward (see `docs/ARCHITECTURE.md`): `ui/` and `infrastructure/` depend
 * on `application/` and `domain/`, and this file is the only place that knows every concrete
 * class.
 */

import * as vscode from 'vscode';
import { AlertTracker } from './application/alertTracker';
import { JobService } from './application/jobService';
import { ObservedEnds } from './application/observedEnds';
import { findHfToken } from './infrastructure/hfToken';
import { HuggingFaceProvider } from './infrastructure/huggingFaceProvider';
import { readConfig } from './ui/config';
import { JobController } from './ui/controller';
import { JobStatusBar } from './ui/statusBar';

/** Called by VS Code once start-up has finished. */
export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Jobwatch', { log: true });
  const version = (context.extension.packageJSON as { version?: string }).version ?? '?';
  log.info(`Jobwatch ${version} activated`);

  const provider = new HuggingFaceProvider({ token: () => findHfToken(), namespace: () => readConfig().namespace, log });
  const service = new JobService(provider, new AlertTracker(context.globalState), new ObservedEnds(context.globalState), log);
  const bar = new JobStatusBar();
  const controller = new JobController(service, bar, log);

  context.subscriptions.push(
    log,
    bar,
    controller,
    vscode.commands.registerCommand('jobwatch.refresh', () => controller.refresh(true)),
    vscode.commands.registerCommand('jobwatch.openJob', () => controller.pickJob()),
    vscode.commands.registerCommand('jobwatch.showLog', () => log.show(true)),
  );
  controller.start();
}

/** Nothing to do: every resource is in `context.subscriptions`. */
export function deactivate(): void {}
