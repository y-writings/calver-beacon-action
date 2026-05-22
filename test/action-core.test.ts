import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getInput, setFailed, setOutput } from '../src/action/core';

const originalEnv = { ...process.env };

let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

describe('action core helpers', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.exitCode = undefined;
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    process.env = { ...originalEnv };
    process.exitCode = undefined;
  });

  it('reads trimmed action inputs from environment variables', () => {
    process.env.INPUT_TARGET_REF = '  refs/heads/main  ';

    expect(getInput('target_ref')).toBe('refs/heads/main');
  });

  it('appends outputs to GITHUB_OUTPUT with multiline-safe delimiters', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'calver-action-'));
    const outputFile = join(tempDir, 'github-output');
    writeFileSync(outputFile, '', 'utf8');
    process.env.GITHUB_OUTPUT = outputFile;

    try {
      setOutput('release_notes', 'line 1\nline 2');

      const output = readFileSync(outputFile, 'utf8');
      expect(output).toMatch(/^release_notes<<(ghadelimiter_[0-9a-f-]+)\nline 1\nline 2\n\1\n$/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails clearly when GITHUB_OUTPUT is unavailable', () => {
    delete process.env.GITHUB_OUTPUT;

    expect(() => setOutput('tag', 'v2026.05.23')).toThrow(
      'Unable to find environment variable for file command OUTPUT',
    );
  });

  it('marks the action failed and emits an escaped error command', () => {
    setFailed('first line\nsecond line');

    expect(process.exitCode).toBe(1);
    expect(stdoutWriteSpy).toHaveBeenCalledWith('::error::first line%0Asecond line\n');
  });
});
