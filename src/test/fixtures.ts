/**
 * @file Shared test data shaped like the live Hugging Face responses (checked 2026-10-09).
 * Kept out of `*.test.ts` files so importing it never re-runs a suite.
 */

import type { Hardware, Job } from '../domain/types';

export const ENDPOINT = 'https://huggingface.co';

/** A raw job as `GET /api/jobs/{namespace}` returns it, minus fields Jobwatch never reads. */
export function rawJob(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'job',
    id: '6abedec0aaaabbbbccccdddd',
    createdAt: '2026-10-09T10:00:00.000Z',
    flavor: 'a10g-small',
    timeout: 7200,
    status: { stage: 'RUNNING', message: null, failureCount: 0 },
    startedAt: '2026-10-09T10:03:00.000Z',
    owner: { id: 'x', name: 'kabartay', type: 'user' },
    labels: { name: 'fintfm-c5-sba-s0' },
    environment: { SECRET_SHOULD_NEVER_BE_READ: 'x' },
    ...over,
  };
}

export const HARDWARE: Hardware[] = [
  { name: 'cpu-basic', prettyName: 'CPU Basic', unitCostUsd: 0.000167, unitLabel: 'minute' },
  { name: 'a10g-small', prettyName: 'Nvidia A10G - small', unitCostUsd: 0.016667, unitLabel: 'minute' },
  { name: 't4-small', prettyName: 'Nvidia T4 - small', unitCostUsd: 0.006667, unitLabel: 'minute' },
];

/** A normalised job with sensible defaults. */
export function job(over: Partial<Job> = {}): Job {
  return {
    provider: 'huggingface',
    id: '6abedec0aaaabbbbccccdddd',
    name: 'fintfm-c5-sba-s0',
    owner: 'kabartay',
    flavor: 'a10g-small',
    stage: 'RUNNING',
    createdAt: new Date('2026-10-09T10:00:00Z'),
    startedAt: new Date('2026-10-09T10:03:00Z'),
    timeoutSecs: 7200,
    url: 'https://huggingface.co/jobs/kabartay/6abedec0aaaabbbbccccdddd',
    ...over,
  };
}
