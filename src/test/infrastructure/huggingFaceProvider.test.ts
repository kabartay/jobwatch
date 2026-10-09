/**
 * @file Tests for the HTTP client and the Hugging Face provider against a real local server.
 */

import { strict as assert } from 'node:assert';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { ProviderError } from '../../application/errors';
import type { Logger } from '../../application/ports';
import { getJson, getJsonPages, nextPageUrl, parseRetryAfter, type HttpOptions } from '../../infrastructure/httpClient';
import { HuggingFaceProvider } from '../../infrastructure/huggingFaceProvider';
import { rawJob } from '../fixtures';

const silent: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined };
const TOKEN = 'hf_SECRETTOKEN';

describe('getJson and HuggingFaceProvider', () => {
  let server: http.Server;
  let options: HttpOptions;
  const seen: Array<{ path: string; auth?: string }> = [];
  let mode: 'ok' | '401' | '429' | 'html' = 'ok';

  before(async () => {
    server = http.createServer((req, res) => {
      seen.push({ path: req.url ?? '', auth: req.headers.authorization });
      if (mode === '401') {
        res.writeHead(401).end();
        return;
      }
      if (mode === '429') {
        res.writeHead(429, { 'Retry-After': '120' }).end();
        return;
      }
      if (mode === 'html') {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>');
        return;
      }
      if (req.url === '/paged') {
        res.writeHead(200, { 'Content-Type': 'application/json', Link: '</paged?cursor=2>; rel="next"' }).end('[1,2]');
        return;
      }
      if (req.url === '/paged?cursor=2') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('[3]');
        return;
      }
      if (req.url === '/leaky') {
        res.writeHead(200, { 'Content-Type': 'application/json', Link: '<https://evil.example/steal>; rel="next"' }).end('[1]');
        return;
      }
      const body =
        req.url === '/api/whoami-v2'
          ? { name: 'kabartay' }
          : req.url === '/api/jobs/hardware'
            ? [{ name: 'a10g-small', prettyName: 'A10G', unitCostUSD: 0.016667, unitLabel: 'minute' }]
            : req.url === '/api/jobs/kabartay' || req.url === '/api/jobs/my-org'
              ? [rawJob(), { broken: true }]
              : null;
      res.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    options = { hostname: '127.0.0.1', port: (server.address() as AddressInfo).port, timeoutMs: 2000, request: http.request };
  });
  after(() => new Promise<void>((r) => server.close(() => r())));

  const provider = (namespace = '') =>
    new HuggingFaceProvider({ token: async () => ({ token: TOKEN, source: '~/.cache/huggingface/token' }), namespace: () => namespace, log: silent, http: options });

  it('resolves the account once, then lists its jobs with the bearer token', async () => {
    mode = 'ok';
    seen.length = 0;
    const p = provider();
    assert.equal((await p.listJobs()).length, 1, 'the malformed job is skipped');
    await p.listJobs();
    assert.deepEqual(seen.map((s) => s.path), ['/api/whoami-v2', '/api/jobs/kabartay', '/api/jobs/kabartay']);
    assert.ok(seen.every((s) => s.auth === `Bearer ${TOKEN}`));
  });

  it('uses a configured namespace without asking whoami', async () => {
    mode = 'ok';
    seen.length = 0;
    await provider('my-org').listJobs();
    assert.deepEqual(seen.map((s) => s.path), ['/api/jobs/my-org']);
  });

  it('reads prices', async () => {
    mode = 'ok';
    assert.equal((await provider().listHardware())[0]?.unitCostUsd, 0.016667);
  });

  it('maps a refused token, a rate limit and a non-JSON answer, never leaking the token', async () => {
    for (const [m, failure] of [['401', 'unauthorized'], ['429', 'rate-limited'], ['html', 'bad-response']] as const) {
      mode = m;
      await assert.rejects(getJson(options, '/api/jobs/hardware', TOKEN), (err: unknown) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.failure, failure);
        assert.doesNotMatch(err.message, /SECRETTOKEN/);
        if (m === '429') {
          assert.equal(err.retryAfterSeconds, 120);
        }
        return true;
      });
    }
  });

  it('follows next-page links on the same host and concatenates the pages', async () => {
    mode = 'ok';
    assert.deepEqual(await getJsonPages(options, '/paged', TOKEN), [1, 2, 3]);
  });

  it('never follows a next-page link to another host, so the token stays put', async () => {
    mode = 'ok';
    seen.length = 0;
    assert.deepEqual(await getJsonPages(options, '/leaky', TOKEN), [1]);
    assert.deepEqual(seen.map((s) => s.path), ['/leaky']);
  });

  it('reports a missing token as no-token, without a request', async () => {
    seen.length = 0;
    const p = new HuggingFaceProvider({ token: async () => undefined, namespace: () => '', log: silent, http: options });
    await assert.rejects(p.listJobs(), (err: unknown) => err instanceof ProviderError && err.failure === 'no-token');
    assert.equal(seen.length, 0);
  });

  it('reports an unreachable host as unavailable', async () => {
    const closed = { ...options, port: 1 };
    await assert.rejects(getJson(closed, '/x', TOKEN), (err: unknown) => err instanceof ProviderError && err.failure === 'unavailable');
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and refuses junk', () => {
    assert.equal(parseRetryAfter('30'), 30);
    assert.equal(parseRetryAfter(undefined), undefined);
    assert.equal(parseRetryAfter('soon'), undefined);
  });
});

describe('nextPageUrl', () => {
  it('finds rel="next" among several links', () => {
    assert.equal(nextPageUrl('<https://h/a?p=1>; rel="prev", <https://h/a?p=3>; rel="next"'), 'https://h/a?p=3');
    assert.equal(nextPageUrl(undefined), undefined);
    assert.equal(nextPageUrl('<https://h/a>; rel="last"'), undefined);
  });
});
