import { describe, it, expect } from 'vitest';
import { resolveBackend } from '../backend.js';

describe('resolveBackend', () => {
  const cli = (v: boolean) => ({ hasClaudeCli: () => v, hasApiKey: () => false });

  it('honors an explicit config pin over detection', () => {
    expect(resolveBackend({ backend: 'api' }, cli(true))).toBe('api');
    expect(resolveBackend({ backend: 'stub' }, { hasClaudeCli: () => true, hasApiKey: () => true })).toBe('stub');
    expect(resolveBackend({ backend: 'claude-code' }, cli(false))).toBe('claude-code');
  });

  it('prefers the Claude Code CLI when present', () => {
    expect(resolveBackend(undefined, { hasClaudeCli: () => true, hasApiKey: () => true })).toBe('claude-code');
  });

  it('falls back to the API key when the CLI is absent', () => {
    expect(resolveBackend(undefined, { hasClaudeCli: () => false, hasApiKey: () => true })).toBe('api');
  });

  it('falls back to the stub when nothing is available', () => {
    expect(resolveBackend(undefined, { hasClaudeCli: () => false, hasApiKey: () => false })).toBe('stub');
  });

  it('ignores an unknown pin and resolves by detection', () => {
    // @ts-expect-error — exercising a malformed config value
    expect(resolveBackend({ backend: 'bogus' }, { hasClaudeCli: () => false, hasApiKey: () => true })).toBe('api');
  });
});
