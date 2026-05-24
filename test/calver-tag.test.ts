import { describe, expect, it } from 'vitest';

import {
  buildCalverTag,
  formatUtcDate,
  isCanonicalCalverTag,
  resolveCalverDate,
  validateCalverDate,
  validateTagPrefix,
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

  it('builds a CalVer tag with a custom prefix', () => {
    expect(buildCalverTag('2026.04.19', 'app-')).toBe('app-2026.04.19');
  });

  it('builds a CalVer tag with an alphanumeric suffix', () => {
    expect(buildCalverTag('2026.04.19-rc1')).toBe('v2026.04.19-rc1');
  });

  it('accepts alphanumeric suffixes up to 32 characters', () => {
    expect(() => validateCalverDate('2026.04.19-a')).not.toThrow();
    expect(() => validateCalverDate('2026.04.19-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456')).not.toThrow();
  });

  it('identifies canonical CalVer tags', () => {
    expect(isCanonicalCalverTag('v2026.04.19')).toBe(true);
    expect(isCanonicalCalverTag('v2026.04.19-handmade-01')).toBe(false);
    expect(isCanonicalCalverTag('2026.04.19')).toBe(false);
    expect(isCanonicalCalverTag('v2026.4.19')).toBe(false);
    expect(isCanonicalCalverTag('v1')).toBe(false);
  });

  it('identifies canonical CalVer tags for a custom prefix', () => {
    expect(isCanonicalCalverTag('app-2026.04.19', 'app-')).toBe(true);
    expect(isCanonicalCalverTag('app-2026.04.19-rc1', 'app-')).toBe(false);
    expect(isCanonicalCalverTag('v2026.04.19', 'app-')).toBe(false);
  });

  it('accepts safe tag prefixes', () => {
    expect(() => validateTagPrefix('v')).not.toThrow();
    expect(() => validateTagPrefix('app-')).not.toThrow();
    expect(() => validateTagPrefix('service_1')).not.toThrow();
    expect(() => validateTagPrefix('ABCDEFGHIJKLMNOPQRSTUVWXYZ123456')).not.toThrow();
  });

  it('rejects unsafe tag prefixes', () => {
    const formatError = 'tag_prefix must use 1 to 32 characters containing only ASCII letters, digits, hyphen, or underscore';

    expect(() => validateTagPrefix('')).toThrow(formatError);
    expect(() => validateTagPrefix('app.')).toThrow(formatError);
    expect(() => validateTagPrefix('app/')).toThrow(formatError);
    expect(() => validateTagPrefix('app name')).toThrow(formatError);
    expect(() => validateTagPrefix('ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567')).toThrow(formatError);
  });

  it('rejects non-canonical CalVer dates', () => {
    const formatError = 'calver_date must use YYYY.MM.DD or YYYY.MM.DD-[A-Za-z0-9]{1,32} format';

    expect(() => validateCalverDate('2026-04-19')).toThrow(formatError);
    expect(() => validateCalverDate('2026.4.19')).toThrow(formatError);
  });

  it('rejects malformed CalVer date suffixes', () => {
    const formatError = 'calver_date must use YYYY.MM.DD or YYYY.MM.DD-[A-Za-z0-9]{1,32} format';

    expect(() => validateCalverDate('2026.04.19-')).toThrow(formatError);
    expect(() => validateCalverDate('2026.04.19-rc.1')).toThrow(formatError);
    expect(() => validateCalverDate('2026.04.19-rc-1')).toThrow(formatError);
    expect(() => validateCalverDate('2026.04.19-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567')).toThrow(formatError);
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
