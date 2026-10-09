/**
 * @file Finds the Hugging Face token the `hf` CLI already stored, so Jobwatch needs no setup.
 *
 * The same order `huggingface_hub` uses: the `HF_TOKEN` environment variable (and the older
 * `HUGGING_FACE_HUB_TOKEN`), then the file at `HF_TOKEN_PATH`, then `$HF_HOME/token`, then
 * `~/.cache/huggingface/token`. The token is read, never written, logged or sent anywhere but
 * huggingface.co.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The token and where it came from, for the log (never the value). */
export interface FoundToken {
  readonly token: string;
  readonly source: string;
}

/** Environment and file access, injectable for tests. */
export interface TokenEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly home: string;
  readFile(path: string): Promise<string>;
}

const realEnvironment: TokenEnvironment = {
  env: process.env,
  home: homedir(),
  readFile: (p) => readFile(p, 'utf8'),
};

/** The token files to try, in order, for an environment. */
export function tokenPaths(env: TokenEnvironment['env'], home: string): string[] {
  const cacheHome = env.XDG_CACHE_HOME || join(home, '.cache');
  const hfHome = env.HF_HOME || join(cacheHome, 'huggingface');
  const paths = [env.HF_TOKEN_PATH, join(hfHome, 'token'), join(home, '.cache', 'huggingface', 'token')];
  return [...new Set(paths.filter((p): p is string => typeof p === 'string' && p !== ''))];
}

/**
 * @returns The token, or `undefined` when none is configured anywhere.
 */
export async function findHfToken(environment: TokenEnvironment = realEnvironment): Promise<FoundToken | undefined> {
  for (const name of ['HF_TOKEN', 'HUGGING_FACE_HUB_TOKEN']) {
    const value = environment.env[name]?.trim();
    if (value) {
      return { token: value, source: `$${name}` };
    }
  }
  for (const path of tokenPaths(environment.env, environment.home)) {
    try {
      const value = (await environment.readFile(path)).trim();
      if (value) {
        return { token: value, source: path.replace(environment.home, '~') };
      }
    } catch {
      // Missing or unreadable: try the next location.
    }
  }
  return undefined;
}
