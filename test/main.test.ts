import { beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  getInput: vi.fn<(name: string) => string>(),
  getBooleanInput: vi.fn<(name: string) => boolean>(),
  setOutput: vi.fn<(name: string, value: string) => void>(),
}));

const githubMocks = vi.hoisted(() => ({
  getApiContext: vi.fn(),
  lookupTag: vi.fn(),
  resolveTargetSha: vi.fn(),
  createLightweightTag: vi.fn(),
}));

vi.mock('@actions/core', () => coreMocks);
vi.mock('../src/github', () => githubMocks);

import { run } from '../src/main';

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    coreMocks.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'calver_date':
          return '2026.04.19';
        case 'github_token':
          return 'token-value';
        case 'target_ref':
          return 'main';
        default:
          return '';
      }
    });

    coreMocks.getBooleanInput.mockReturnValue(false);
    githubMocks.getApiContext.mockReturnValue({ token: 'token-value' });
    githubMocks.lookupTag.mockResolvedValue({
      exists: false,
      ref: 'refs/tags/v2026.04.19',
    });
    githubMocks.resolveTargetSha.mockResolvedValue('abc123');
    githubMocks.createLightweightTag.mockResolvedValue({
      created: true,
      ref: 'refs/tags/v2026.04.19',
      sha: 'abc123',
    });
  });

  it('returns tag lookup results without creating when create_if_missing is false', async () => {
    await run();

    expect(coreMocks.setOutput).toHaveBeenCalledWith('tag', 'v2026.04.19');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('tag_exists', 'false');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('created', 'false');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('target_sha', '');
    expect(githubMocks.createLightweightTag).not.toHaveBeenCalled();
  });

  it('creates a remote tag when requested', async () => {
    coreMocks.getBooleanInput.mockReturnValue(true);
    coreMocks.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'calver_date':
          return '2026.04.19';
        case 'github_token':
          return 'token-value';
        case 'target_ref':
          return 'main';
        default:
          return '';
      }
    });

    await run();

    expect(githubMocks.resolveTargetSha).toHaveBeenCalledWith({ token: 'token-value' }, 'main');
    expect(githubMocks.createLightweightTag).toHaveBeenCalledWith({ token: 'token-value' }, 'v2026.04.19', 'abc123');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('created', 'true');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('target_sha', 'abc123');
  });

  it('requires a target when create_if_missing is true', async () => {
    coreMocks.getBooleanInput.mockReturnValue(true);

    await expect(run()).rejects.toThrow('target_ref or target_sha is required when create_if_missing is true');
  });

  it('requires target_ref', async () => {
    coreMocks.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'calver_date':
          return '2026.04.19';
        case 'github_token':
          return 'token-value';
        case 'target_ref':
          return '';
        default:
          return '';
      }
    });

    await expect(run()).rejects.toThrow('target_ref is required');
  });
});
