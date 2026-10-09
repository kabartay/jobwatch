/**
 * @file Ports: the interfaces the application layer needs from the outside world.
 *
 * `infrastructure/` implements them (HTTPS, token files) and `ui/` supplies VS Code's storage and
 * log, so the logic here depends on nothing concrete and the tests pass in-memory fakes.
 */

import type { Hardware, Job, ProviderId } from '../domain/types';

/** A service that runs jobs. Hugging Face today; another service would implement the same shape. */
export interface JobProvider {
  readonly id: ProviderId;
  /**
   * @returns Every job the provider lists for the watched account, newest first.
   * @throws {ProviderError} When the account cannot be read.
   */
  listJobs(): Promise<Job[]>;
  /**
   * @returns Hardware flavours and their prices.
   * @throws {ProviderError} When the price list cannot be read.
   */
  listHardware(): Promise<Hardware[]>;
}

/** Remembers small values across reloads. Implemented by VS Code's `globalState`. */
export interface KeyValueStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

/** Where messages go. Implemented by VS Code's `LogOutputChannel`. */
export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
}
