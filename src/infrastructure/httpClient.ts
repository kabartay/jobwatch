/**
 * @file A small JSON-over-HTTPS GET, with status handling mapped onto {@link ProviderError}.
 *
 * Uses `https.request` rather than global `fetch` because VS Code patches the former to honour
 * the user's `http.proxy` setting. Tests substitute `http.request` and a local server.
 */

import type { ClientRequest, IncomingMessage, RequestOptions } from 'http';
import * as https from 'https';
import { ProviderError } from '../application/errors';

/** Signature shared by `https.request` and `http.request`. */
export type RequestFn = (options: RequestOptions, callback: (res: IncomingMessage) => void) => ClientRequest;

/** Where to send requests. */
export interface HttpOptions {
  readonly hostname: string;
  /** Omitted in production (443); set by tests that run a local server. */
  readonly port?: number;
  readonly timeoutMs: number;
  readonly request: RequestFn;
}

/** Responses larger than this are refused; the job list for a busy account is far smaller. */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Reads `Retry-After` as seconds, or `undefined`. */
export function parseRetryAfter(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) {
    return undefined;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, (date - Date.now()) / 1000);
}

/**
 * GETs a path and parses the JSON body.
 *
 * @param token - Sent as a bearer token to `options.hostname` only; never in an error message.
 * @throws {ProviderError} `unauthorized` on 401/403, `rate-limited` on 429, `unavailable` on a
 *   network error, timeout or other status, `bad-response` when the body is not JSON.
 */
export async function getJson(options: HttpOptions, path: string, token: string): Promise<unknown> {
  return (await getJsonWithLinks(options, path, token)).body;
}

/** The URL of the next page from a GitHub-style `Link` header, or `undefined`. */
export function nextPageUrl(link: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(link) ? link.join(', ') : link;
  if (!raw) {
    return undefined;
  }
  for (const part of raw.split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(part);
    if (m?.[1]) {
      return m[1];
    }
  }
  return undefined;
}

/** Pages followed at most; 100 jobs a page makes this 5,000 jobs. */
export const MAX_PAGES = 50;

/**
 * GETs a list endpoint and follows its `Link: <…>; rel="next"` pages, concatenating the arrays.
 * A next link is followed only on the same host, so the token never leaves it.
 *
 * @throws {ProviderError} As {@link getJson}, or `bad-response` when a page is not a list.
 */
export async function getJsonPages(options: HttpOptions, path: string, token: string): Promise<unknown[]> {
  const out: unknown[] = [];
  let next: string | undefined = path;
  for (let page = 0; next !== undefined && page < MAX_PAGES; page++) {
    const { body, link } = await getJsonWithLinks(options, next, token);
    if (!Array.isArray(body)) {
      throw new ProviderError('bad-response', `${path} page ${page + 1} is not a JSON array.`);
    }
    out.push(...(body as unknown[]));
    const url = nextPageUrl(link);
    next = url === undefined ? undefined : sameHostPath(url, options.hostname);
  }
  return out;
}

/** The path-and-query of `url` when it is on `hostname`, else `undefined`. */
function sameHostPath(url: string, hostname: string): string | undefined {
  if (url.startsWith('/')) {
    return url;
  }
  try {
    const u = new URL(url);
    return u.hostname === hostname ? u.pathname + u.search : undefined;
  } catch {
    return undefined;
  }
}

function getJsonWithLinks(options: HttpOptions, path: string, token: string): Promise<{ body: unknown; link: string | string[] | undefined }> {
  const { hostname, port, timeoutMs, request } = options;
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname,
        port,
        path,
        method: 'GET',
        timeout: timeoutMs,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'jobwatch' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            req.destroy(new ProviderError('bad-response', `${path} answered with more than ${MAX_BODY_BYTES} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status === 401 || status === 403) {
            reject(new ProviderError('unauthorized', `Hugging Face refused the token (HTTP ${status}).`));
            return;
          }
          if (status === 429) {
            reject(new ProviderError('rate-limited', 'Hugging Face asked to slow down (HTTP 429).', parseRetryAfter(res.headers['retry-after'])));
            return;
          }
          if (status < 200 || status >= 300) {
            reject(new ProviderError('unavailable', `${path} answered HTTP ${status}.`));
            return;
          }
          try {
            resolve({ body: JSON.parse(Buffer.concat(chunks).toString('utf8')), link: res.headers.link });
          } catch {
            reject(new ProviderError('bad-response', `${path} did not answer with JSON.`));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new ProviderError('unavailable', `${path} did not answer within ${timeoutMs / 1000} s.`)));
    req.on('error', (err) => reject(err instanceof ProviderError ? err : new ProviderError('unavailable', `Could not reach ${hostname}: ${err.message}`)));
    req.end();
  });
}

/** Production defaults: the Hub over HTTPS, 15 s per request. */
export const HUB_HTTP: HttpOptions = { hostname: 'huggingface.co', timeoutMs: 15_000, request: https.request };
