/**
 * @file Tests for finding the Hugging Face token in the same order the CLI uses.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { findHfToken, tokenPaths, type TokenEnvironment } from '../../infrastructure/hfToken';

const env = (vars: Record<string, string>, files: Record<string, string> = {}): TokenEnvironment => ({
  env: vars,
  home: '/home/u',
  readFile: async (p) => {
    const v = files[p];
    if (v === undefined) {
      throw new Error('ENOENT');
    }
    return v;
  },
});

describe('tokenPaths', () => {
  it('follows HF_TOKEN_PATH, HF_HOME, XDG_CACHE_HOME and the default, without duplicates', () => {
    assert.deepEqual(tokenPaths({}, '/home/u'), ['/home/u/.cache/huggingface/token']);
    assert.deepEqual(tokenPaths({ HF_HOME: '/hf', HF_TOKEN_PATH: '/t' }, '/home/u'), ['/t', '/hf/token', '/home/u/.cache/huggingface/token']);
    assert.deepEqual(tokenPaths({ XDG_CACHE_HOME: '/xdg' }, '/home/u'), ['/xdg/huggingface/token', '/home/u/.cache/huggingface/token']);
  });
});

describe('findHfToken', () => {
  it('prefers the environment variable and says where it came from', async () => {
    const found = await findHfToken(env({ HF_TOKEN: ' hf_env ' }, { '/home/u/.cache/huggingface/token': 'hf_file' }));
    assert.deepEqual(found, { token: 'hf_env', source: '$HF_TOKEN' });
  });

  it('reads the CLI token file, reporting the path with ~', async () => {
    const found = await findHfToken(env({}, { '/home/u/.cache/huggingface/token': 'hf_file\n' }));
    assert.deepEqual(found, { token: 'hf_file', source: '~/.cache/huggingface/token' });
  });

  it('skips an empty file and returns undefined when nothing is configured', async () => {
    assert.equal(await findHfToken(env({}, { '/home/u/.cache/huggingface/token': '  ' })), undefined);
  });
});
