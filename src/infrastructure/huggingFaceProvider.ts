/**
 * @file The Hugging Face Jobs provider: `whoami-v2` for the account, `jobs/{namespace}` for the
 * jobs, `jobs/hardware` for prices. Read-only: it never starts, stops or changes a job.
 */

import { ProviderError } from '../application/errors';
import type { JobProvider, Logger } from '../application/ports';
import { parseHardware, parseJobs, UnexpectedResponseError } from '../domain/huggingface';
import type { Hardware, Job } from '../domain/types';
import { getJson, getJsonPages, HUB_HTTP, type HttpOptions } from './httpClient';
import type { FoundToken } from './hfToken';

/** Collaborators of {@link HuggingFaceProvider}. */
export interface HuggingFaceProviderDeps {
  /** Finds the token afresh each call, so logging in with `hf auth login` takes effect at once. */
  readonly token: () => Promise<FoundToken | undefined>;
  /** The configured namespace, read afresh; empty means the token's own account. */
  readonly namespace: () => string;
  readonly log: Logger;
  readonly http?: HttpOptions;
}

/** Lists jobs and prices from the Hugging Face Hub. */
export class HuggingFaceProvider implements JobProvider {
  readonly id = 'huggingface' as const;
  private readonly http: HttpOptions;
  private account: { token: string; name: string } | undefined;
  private lastSource = '';

  constructor(private readonly deps: HuggingFaceProviderDeps) {
    this.http = deps.http ?? HUB_HTTP;
  }

  async listJobs(): Promise<Job[]> {
    const token = await this.requireToken();
    const namespace = this.deps.namespace().trim() || (await this.accountName(token));
    const body = await getJsonPages(this.http, `/api/jobs/${encodeURIComponent(namespace)}`, token);
    try {
      const { jobs, skipped } = parseJobs(body, `https://${this.http.hostname}`);
      if (skipped > 0) {
        this.deps.log.warn(`skipped ${skipped} job(s) missing an id, flavour, stage or creation time`);
      }
      return jobs;
    } catch (err) {
      throw asBadResponse(err);
    }
  }

  async listHardware(): Promise<Hardware[]> {
    const token = await this.requireToken();
    try {
      return parseHardware(await getJson(this.http, '/api/jobs/hardware', token));
    } catch (err) {
      throw asBadResponse(err);
    }
  }

  private async requireToken(): Promise<string> {
    const found = await this.deps.token();
    if (!found) {
      throw new ProviderError('no-token', 'No Hugging Face token found. Run `hf auth login`, or set HF_TOKEN.');
    }
    if (found.source !== this.lastSource) {
      this.lastSource = found.source;
      this.deps.log.info(`token: ${found.source}`);
    }
    return found.token;
  }

  /** The token's account name, asked once per token. */
  private async accountName(token: string): Promise<string> {
    if (this.account?.token === token) {
      return this.account.name;
    }
    const who = await getJson(this.http, '/api/whoami-v2', token);
    const name = typeof who === 'object' && who !== null ? (who as { name?: unknown }).name : undefined;
    if (typeof name !== 'string' || name === '') {
      throw new ProviderError('bad-response', 'Hugging Face did not say which account the token belongs to.');
    }
    this.account = { token, name };
    this.deps.log.info(`watching jobs of ${name}`);
    return name;
  }
}

function asBadResponse(err: unknown): unknown {
  return err instanceof UnexpectedResponseError ? new ProviderError('bad-response', err.message) : err;
}
