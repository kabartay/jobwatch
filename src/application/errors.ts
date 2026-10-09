/**
 * @file The error a provider raises, carrying a `kind` the UI turns into an action.
 */

/** Why a provider could not be read, as the user needs to act on it. */
export type ProviderFailure =
  /** No token found in the environment or the CLI's token file. */
  | 'no-token'
  /** The token was refused (401/403). */
  | 'unauthorized'
  /** The service asked us to slow down (429). */
  | 'rate-limited'
  /** Network failure, timeout or a server error. */
  | 'unavailable'
  /** The service answered with something this version does not understand. */
  | 'bad-response';

/** Raised by a {@link JobProvider} with a message written for the user. */
export class ProviderError extends Error {
  override readonly name = 'ProviderError';

  /**
   * @param failure - The category the UI reacts to.
   * @param message - One sentence the user can act on; never contains the token.
   * @param retryAfterSeconds - From a 429's `Retry-After`, when given.
   */
  constructor(
    readonly failure: ProviderFailure,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
