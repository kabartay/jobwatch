/**
 * @file Parses Hugging Face Jobs responses: `GET /api/jobs/{namespace}` and
 * `GET /api/jobs/hardware`.
 *
 * Field names are the raw JSON ones (`createdAt`, `unitCostUSD`), checked against the live API
 * on 2026-10-09. A response is untrusted: a job missing what the status bar needs is dropped
 * rather than shown with blanks, and never throws for one bad entry among many.
 */

import type { Hardware, Job } from './types';

/** Raised when a whole response is not the expected shape. */
export class UnexpectedResponseError extends Error {
  override readonly name = 'UnexpectedResponseError';
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function date(v: unknown): Date | undefined {
  const s = str(v);
  if (!s) {
    return undefined;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** The job page on the Hub. */
export function jobUrl(endpoint: string, owner: string, id: string): string {
  return `${endpoint.replace(/\/+$/, '')}/jobs/${encodeURIComponent(owner)}/${encodeURIComponent(id)}`;
}

/** Parses one job, or returns `undefined` when it lacks an id, flavour, stage or creation time. */
export function parseJob(raw: unknown, endpoint: string): Job | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const id = str(raw.id);
  const flavor = str(raw.flavor);
  const status = isRecord(raw.status) ? raw.status : undefined;
  const stage = str(status?.stage);
  const createdAt = date(raw.createdAt);
  if (!id || !flavor || !stage || !createdAt) {
    return undefined;
  }
  const owner = (isRecord(raw.owner) && str(raw.owner.name)) || '';
  const durations = isRecord(raw.durations) ? raw.durations : undefined;
  const labels = isRecord(raw.labels) ? raw.labels : undefined;
  return {
    provider: 'huggingface',
    id,
    name: str(labels?.name),
    owner,
    flavor,
    stage,
    message: str(status?.message),
    createdAt,
    startedAt: date(raw.startedAt),
    finishedAt: date(raw.finishedAt),
    runningSecs: num(durations?.runningSecs),
    timeoutSecs: num(raw.timeout),
    url: jobUrl(endpoint, owner, id),
  };
}

/**
 * Parses the job list.
 *
 * @throws {UnexpectedResponseError} When the body is not a list; individual malformed jobs are
 *   skipped instead, and their count is returned so the caller can log it.
 */
export function parseJobs(body: unknown, endpoint: string): { jobs: Job[]; skipped: number } {
  if (!Array.isArray(body)) {
    throw new UnexpectedResponseError('the job list is not a JSON array');
  }
  const jobs = body.map((j) => parseJob(j, endpoint)).filter((j): j is Job => j !== undefined);
  return { jobs, skipped: body.length - jobs.length };
}

/**
 * Parses the hardware price list.
 *
 * @throws {UnexpectedResponseError} When the body is not a list.
 */
export function parseHardware(body: unknown): Hardware[] {
  if (!Array.isArray(body)) {
    throw new UnexpectedResponseError('the hardware list is not a JSON array');
  }
  const out: Hardware[] = [];
  for (const raw of body) {
    if (!isRecord(raw)) {
      continue;
    }
    const name = str(raw.name);
    const unitCostUsd = num(raw.unitCostUSD);
    const unitLabel = str(raw.unitLabel);
    if (name && unitCostUsd !== undefined && unitLabel) {
      out.push({ name, prettyName: str(raw.prettyName) ?? name, unitCostUsd, unitLabel });
    }
  }
  return out;
}
