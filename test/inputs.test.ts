import { beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  getInput: vi.fn<(name: string) => string>(),
}));

vi.mock('../src/action/core', () => coreMocks);

import { getInputs } from '../src/action/inputs';

describe('getInputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trims calver_date, github_token, target_ref, and tag_prefix inputs', () => {
    coreMocks.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'calver_date':
          return '  2026.04.19  ';
        case 'github_token':
          return '  token-value  ';
        case 'target_ref':
          return '  refs/heads/main  ';
        case 'tag_prefix':
          return '  app-  ';
        default:
          return '';
      }
    });

    expect(getInputs()).toEqual({
      calverDate: '2026.04.19',
      githubToken: 'token-value',
      targetRef: 'refs/heads/main',
      tagPrefix: 'app-',
    });
  });

  it('normalizes empty calver_date and target_ref while defaulting empty tag_prefix to v', () => {
    coreMocks.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'calver_date':
          return '   ';
        case 'github_token':
          return '   ';
        case 'target_ref':
          return '   ';
        case 'tag_prefix':
          return '   ';
        default:
          return '';
      }
    });

    expect(getInputs()).toEqual({
      calverDate: undefined,
      githubToken: '',
      targetRef: undefined,
      tagPrefix: 'v',
    });
  });
});
