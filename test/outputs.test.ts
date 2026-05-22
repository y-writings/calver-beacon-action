import { beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  setOutput: vi.fn<(name: string, value: string) => void>(),
}));

vi.mock('../src/action/core', () => coreMocks);

import { setCommonOutputs, setCreatedOutput } from '../src/action/outputs';

describe('action outputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets common output names and values', () => {
    setCommonOutputs({
      tag: 'v2026.04.19',
      targetSha: 'target-sha',
      previousTag: 'v2026.04.12',
      previousTagSha: 'previous-sha',
    });

    expect(coreMocks.setOutput).toHaveBeenCalledWith('tag', 'v2026.04.19');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('target_sha', 'target-sha');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('previous_tag', 'v2026.04.12');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('previous_tag_sha', 'previous-sha');
  });

  it('sets created output as true or false strings', () => {
    setCreatedOutput(true);
    setCreatedOutput(false);

    expect(coreMocks.setOutput).toHaveBeenCalledWith('created', 'true');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('created', 'false');
  });
});
