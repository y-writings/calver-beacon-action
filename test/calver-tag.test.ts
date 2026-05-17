import { describe, expect, it } from 'vitest';

import {
  buildCalverTag,
  formatUtcDate,
  isCanonicalCalverTag,
  resolveCalverDate,
  validateCalverDate,
} from '../src/domain/calver';

describe('CalVer tag helpers', () => {
  it('formats UTC dates as YYYY.MM.DD', () => {
    const date = new Date('2026-04-19T23:59:59.000Z');

    expect(formatUtcDate(date)).toBe('2026.04.19');
  });

  it('uses the provided CalVer date as-is', () => {
    expect(resolveCalverDate('2026.04.19', new Date('2020-01-01T00:00:00.000Z'))).toBe('2026.04.19');
  });

  it('falls back to the current UTC date when no date is provided', () => {
    expect(resolveCalverDate(undefined, new Date('2026-04-19T00:00:00.000Z'))).toBe('2026.04.19');
  });

  it('builds the canonical CalVer tag', () => {
    expect(buildCalverTag('2026.04.19')).toBe('v2026.04.19');
  });

  it('identifies canonical CalVer tags', () => {
    expect(isCanonicalCalverTag('v2026.04.19')).toBe(true);
    expect(isCanonicalCalverTag('v2026.04.19-handmade-01')).toBe(false);
    expect(isCanonicalCalverTag('2026.04.19')).toBe(false);
    expect(isCanonicalCalverTag('v2026.4.19')).toBe(false);
    expect(isCanonicalCalverTag('v1')).toBe(false);
  });

  it('rejects non-canonical CalVer dates', () => {
    expect(() => validateCalverDate('2026-04-19')).toThrow('calver_date must use YYYY.MM.DD format');
    expect(() => validateCalverDate('2026.4.19')).toThrow('calver_date must use YYYY.MM.DD format');
  });

  it('rejects impossible calendar dates', () => {
    expect(() => validateCalverDate('2026.13.01')).toThrow(
      'calver_date must be a real calendar date in YYYY.MM.DD format',
    );
    expect(() => validateCalverDate('2026.02.30')).toThrow(
      'calver_date must be a real calendar date in YYYY.MM.DD format',
    );
  });

  it('accepts valid leap day dates', () => {
    expect(() => validateCalverDate('2028.02.29')).not.toThrow();
  });
});
