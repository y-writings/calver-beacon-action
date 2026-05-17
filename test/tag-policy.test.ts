import { describe, expect, it } from 'vitest';

import { shouldSkipTagCreation, type LatestCalverTag } from '../src/domain/tag-policy';

describe('tag policy', () => {
  it('skips when latest exists and latest sha equals target sha', () => {
    const latest: LatestCalverTag = {
      exists: true,
      ref: 'refs/tags/v2026.04.19',
      tag: 'v2026.04.19',
      sha: 'abc123',
    };

    expect(shouldSkipTagCreation(latest, 'abc123')).toBe(true);
  });

  it('does not skip when latest exists but latest sha differs', () => {
    const latest: LatestCalverTag = {
      exists: true,
      ref: 'refs/tags/v2026.04.19',
      tag: 'v2026.04.19',
      sha: 'abc123',
    };

    expect(shouldSkipTagCreation(latest, 'def456')).toBe(false);
  });

  it('does not skip when latest does not exist', () => {
    const latest: LatestCalverTag = { exists: false };

    expect(shouldSkipTagCreation(latest, 'abc123')).toBe(false);
  });
});
