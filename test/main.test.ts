import { beforeEach, describe, expect, it, vi } from 'vitest';

const inputMocks = vi.hoisted(() => ({
  getInputs: vi.fn(),
}));

const outputMocks = vi.hoisted(() => ({
  setCommonOutputs: vi.fn(),
  setCreatedOutput: vi.fn(),
}));

const contextMocks = vi.hoisted(() => ({
  getApiContext: vi.fn(),
}));

const refMocks = vi.hoisted(() => ({
  lookupTag: vi.fn(),
  findLatestCalverTag: vi.fn(),
  resolveTargetSha: vi.fn(),
  createLightweightTag: vi.fn(),
}));

vi.mock('../src/action/inputs', () => inputMocks);
vi.mock('../src/action/outputs', () => outputMocks);
vi.mock('../src/github/context', () => contextMocks);
vi.mock('../src/github/refs', () => refMocks);

import { run } from '../src/main';

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    inputMocks.getInputs.mockReturnValue({
      calverDate: '2026.04.19',
      githubToken: 'token-value',
      targetRef: 'main',
    });

    contextMocks.getApiContext.mockReturnValue({ token: 'token-value' });
    refMocks.resolveTargetSha.mockResolvedValue('target-sha');
    refMocks.findLatestCalverTag.mockResolvedValue({
      exists: true,
      ref: 'refs/tags/v2026.04.12',
      tag: 'v2026.04.12',
      sha: 'previous-sha',
    });
    refMocks.lookupTag.mockResolvedValue({
      exists: false,
      ref: 'refs/tags/v2026.04.19',
    });
    refMocks.createLightweightTag.mockResolvedValue({
      created: true,
      ref: 'refs/tags/v2026.04.19',
      sha: 'target-sha',
    });
  });

  it('creates a tag when target changed', async () => {
    await run();

    expect(contextMocks.getApiContext).toHaveBeenCalledWith('token-value');
    expect(refMocks.resolveTargetSha).toHaveBeenCalledWith({ token: 'token-value' }, 'main');
    expect(refMocks.findLatestCalverTag).toHaveBeenCalledWith({ token: 'token-value' });
    expect(outputMocks.setCommonOutputs).toHaveBeenCalledWith({
      tag: 'v2026.04.19',
      targetSha: 'target-sha',
      previousTag: 'v2026.04.12',
      previousTagSha: 'previous-sha',
    });
    expect(refMocks.lookupTag).toHaveBeenCalledWith({ token: 'token-value' }, 'v2026.04.19');
    expect(refMocks.createLightweightTag).toHaveBeenCalledWith({ token: 'token-value' }, 'v2026.04.19', 'target-sha');
    expect(outputMocks.setCreatedOutput).toHaveBeenCalledWith(true);
  });

  it('does not create when latest tag SHA equals target SHA', async () => {
    refMocks.findLatestCalverTag.mockResolvedValue({
      exists: true,
      ref: 'refs/tags/v2026.04.12',
      tag: 'v2026.04.12',
      sha: 'target-sha',
    });

    await run();

    expect(refMocks.lookupTag).not.toHaveBeenCalled();
    expect(refMocks.createLightweightTag).not.toHaveBeenCalled();
    expect(outputMocks.setCommonOutputs).toHaveBeenCalledWith({
      tag: 'v2026.04.19',
      targetSha: 'target-sha',
      previousTag: 'v2026.04.12',
      previousTagSha: 'target-sha',
    });
    expect(outputMocks.setCreatedOutput).toHaveBeenCalledWith(false);
  });

  it('creates a suffixed tag even when the latest canonical tag SHA equals target SHA', async () => {
    inputMocks.getInputs.mockReturnValue({
      calverDate: '2026.04.19-rc1',
      githubToken: 'token-value',
      targetRef: 'main',
    });
    refMocks.findLatestCalverTag.mockResolvedValue({
      exists: true,
      ref: 'refs/tags/v2026.04.12',
      tag: 'v2026.04.12',
      sha: 'target-sha',
    });
    refMocks.lookupTag.mockResolvedValue({
      exists: false,
      ref: 'refs/tags/v2026.04.19-rc1',
    });
    refMocks.createLightweightTag.mockResolvedValue({
      created: true,
      ref: 'refs/tags/v2026.04.19-rc1',
      sha: 'target-sha',
    });

    await run();

    expect(outputMocks.setCommonOutputs).toHaveBeenCalledWith({
      tag: 'v2026.04.19-rc1',
      targetSha: 'target-sha',
      previousTag: 'v2026.04.12',
      previousTagSha: 'target-sha',
    });
    expect(refMocks.lookupTag).toHaveBeenCalledWith({ token: 'token-value' }, 'v2026.04.19-rc1');
    expect(refMocks.createLightweightTag).toHaveBeenCalledWith({ token: 'token-value' }, 'v2026.04.19-rc1', 'target-sha');
    expect(outputMocks.setCreatedOutput).toHaveBeenCalledWith(true);
  });

  it('creates when no previous CalVer tag exists', async () => {
    refMocks.findLatestCalverTag.mockResolvedValue({ exists: false });

    await run();

    expect(refMocks.createLightweightTag).toHaveBeenCalledWith({ token: 'token-value' }, 'v2026.04.19', 'target-sha');
    expect(outputMocks.setCommonOutputs).toHaveBeenCalledWith({
      tag: 'v2026.04.19',
      targetSha: 'target-sha',
      previousTag: '',
      previousTagSha: '',
    });
    expect(outputMocks.setCreatedOutput).toHaveBeenCalledWith(true);
  });

  it('fails when today\'s tag exists at a different SHA with same manual same-day guidance message', async () => {
    refMocks.lookupTag.mockResolvedValue({
      exists: true,
      ref: 'refs/tags/v2026.04.19',
      sha: 'different-sha',
    });

    await expect(run()).rejects.toThrow(
      'tag v2026.04.19 already exists and points to different-sha, expected target-sha. Create a manual same-day CalVer tag if another release is required.',
    );
    expect(refMocks.createLightweightTag).not.toHaveBeenCalled();
  });

  it('requires target_ref', async () => {
    inputMocks.getInputs.mockReturnValue({
      calverDate: '2026.04.19',
      githubToken: 'token-value',
      targetRef: undefined,
    });

    await expect(run()).rejects.toThrow('target_ref is required');
  });

  it('requires github_token', async () => {
    inputMocks.getInputs.mockReturnValue({
      calverDate: '2026.04.19',
      githubToken: '',
      targetRef: 'main',
    });

    await expect(run()).rejects.toThrow('github_token is required');
  });
});
