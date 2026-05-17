import { beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  getInput: vi.fn<(name: string) => string>(),
  setOutput: vi.fn<(name: string, value: string) => void>(),
}));

const githubMocks = vi.hoisted(() => ({
  getApiContext: vi.fn(),
  lookupTag: vi.fn(),
  findLatestCalverTag: vi.fn(),
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
    githubMocks.resolveTargetSha.mockResolvedValue('target-sha');
    githubMocks.findLatestCalverTag.mockResolvedValue({
      exists: true,
      ref: 'refs/tags/v2026.04.12',
      tag: 'v2026.04.12',
      sha: 'previous-sha',
    });
    githubMocks.lookupTag.mockResolvedValue({
      exists: false,
      ref: 'refs/tags/v2026.04.19',
    });
    githubMocks.createLightweightTag.mockResolvedValue({
      created: true,
      ref: 'refs/tags/v2026.04.19',
      sha: 'target-sha',
    });
  });

  it('creates a CalVer tag when target_ref changed since the latest CalVer tag', async () => {
    await run();

    expect(githubMocks.resolveTargetSha).toHaveBeenCalledWith({ token: 'token-value' }, 'main');
    expect(githubMocks.findLatestCalverTag).toHaveBeenCalledWith({ token: 'token-value' });
    expect(githubMocks.lookupTag).toHaveBeenCalledWith({ token: 'token-value' }, 'v2026.04.19');
    expect(githubMocks.createLightweightTag).toHaveBeenCalledWith({ token: 'token-value' }, 'v2026.04.19', 'target-sha');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('tag', 'v2026.04.19');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('created', 'true');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('target_sha', 'target-sha');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('previous_tag', 'v2026.04.12');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('previous_tag_sha', 'previous-sha');
  });

  it('does not create a tag when target_ref has not changed since the latest CalVer tag', async () => {
    githubMocks.findLatestCalverTag.mockResolvedValue({
      exists: true,
      ref: 'refs/tags/v2026.04.12',
      tag: 'v2026.04.12',
      sha: 'target-sha',
    });

    await run();

    expect(githubMocks.lookupTag).not.toHaveBeenCalled();
    expect(githubMocks.createLightweightTag).not.toHaveBeenCalled();
    expect(coreMocks.setOutput).toHaveBeenCalledWith('tag', 'v2026.04.19');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('created', 'false');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('target_sha', 'target-sha');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('previous_tag', 'v2026.04.12');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('previous_tag_sha', 'target-sha');
  });

  it('creates a tag when no previous CalVer tag exists', async () => {
    githubMocks.findLatestCalverTag.mockResolvedValue({ exists: false });

    await run();

    expect(githubMocks.createLightweightTag).toHaveBeenCalledWith({ token: 'token-value' }, 'v2026.04.19', 'target-sha');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('previous_tag', '');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('previous_tag_sha', '');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('created', 'true');
  });

  it('fails when todays CalVer tag already exists at a different SHA', async () => {
    githubMocks.lookupTag.mockResolvedValue({
      exists: true,
      ref: 'refs/tags/v2026.04.19',
      sha: 'different-sha',
    });

    await expect(run()).rejects.toThrow(
      'tag v2026.04.19 already exists and points to different-sha, expected target-sha. Create a manual same-day CalVer tag if another release is required.',
    );
    expect(githubMocks.createLightweightTag).not.toHaveBeenCalled();
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
