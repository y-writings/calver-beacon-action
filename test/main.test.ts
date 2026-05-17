import { beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  getInput: vi.fn<(name: string) => string>(),
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

  it('returns existing tag lookup results without creating', async () => {
    githubMocks.lookupTag.mockResolvedValue({
      exists: true,
      ref: 'refs/tags/v2026.04.19',
      sha: 'def456',
    });

    await run();

    expect(coreMocks.setOutput).toHaveBeenCalledWith('tag', 'v2026.04.19');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('tag_exists', 'true');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('created', 'false');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('target_sha', 'def456');
    expect(githubMocks.resolveTargetSha).not.toHaveBeenCalled();
    expect(githubMocks.createLightweightTag).not.toHaveBeenCalled();
  });

  it('creates a remote tag when missing', async () => {
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
