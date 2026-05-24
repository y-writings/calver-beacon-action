# CalVer Suffix Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow `calver_date` to accept either `YYYY.MM.DD` or `YYYY.MM.DD-[A-Za-z0-9]{1,32}` while rejecting impossible dates.

**Architecture:** Keep the change inside the existing CalVer domain helper so `main.ts` and input trimming remain unchanged. Validation will capture the date portion, validate the optional suffix shape and length with one regex, then check the captured date as a real UTC calendar date.

**Tech Stack:** TypeScript, Vitest, `@vercel/ncc`, GitHub Action metadata in `action.yml`, generated bundled output in `dist/index.js`.

---

## File Structure

- Modify `src/domain/calver.ts`: update validation pattern and date parsing for optional suffix input.
- Modify `test/calver-tag.test.ts`: add failing tests first for accepted suffixes and rejected suffix/date cases.
- Modify `README.md`: document the new `calver_date` accepted formats and same-day manual tag flow.
- Modify `action.yml`: update the input description.
- Generate `dist/index.js`: run `pnpm run build` after source changes so the action entrypoint matches `src`.

### Task 1: CalVer Input Validation

**Files:**
- Modify: `test/calver-tag.test.ts`
- Modify: `src/domain/calver.ts`

- [ ] **Step 1: Write failing tests for suffix input validation**

Update `test/calver-tag.test.ts` to include these assertions in the existing `describe('CalVer tag helpers', () => { ... })` block:

```ts
  it('builds a CalVer tag with an alphanumeric suffix', () => {
    expect(buildCalverTag('2026.04.19-rc1')).toBe('v2026.04.19-rc1');
  });

  it('accepts alphanumeric suffixes up to 32 characters', () => {
    expect(() => validateCalverDate('2026.04.19-a')).not.toThrow();
    expect(() => validateCalverDate('2026.04.19-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456')).not.toThrow();
  });

  it('rejects malformed CalVer date suffixes', () => {
    const formatError = 'calver_date must use YYYY.MM.DD or YYYY.MM.DD-[A-Za-z0-9]{1,32} format';

    expect(() => validateCalverDate('2026.04.19-')).toThrow(formatError);
    expect(() => validateCalverDate('2026.04.19-rc.1')).toThrow(formatError);
    expect(() => validateCalverDate('2026.04.19-rc-1')).toThrow(formatError);
    expect(() => validateCalverDate('2026.04.19-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567')).toThrow(formatError);
  });
```

Update the existing `rejects non-canonical CalVer dates` expected error string from:

```ts
'calver_date must use YYYY.MM.DD format'
```

to:

```ts
'calver_date must use YYYY.MM.DD or YYYY.MM.DD-[A-Za-z0-9]{1,32} format'
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `pnpm vitest run test/calver-tag.test.ts`

Expected: FAIL because `2026.04.19-rc1` is rejected by the current `CALVER_DATE_PATTERN`.

- [ ] **Step 3: Implement minimal validation changes**

Update `src/domain/calver.ts` as follows:

```ts
const CANONICAL_CALVER_TAG_PATTERN = /^v\d{4}\.\d{2}\.\d{2}$/;
const CALVER_INPUT_PATTERN = /^(\d{4}\.\d{2}\.\d{2})(?:-[A-Za-z0-9]{1,32})?$/;

function parseCalverDateParts(calverDate: string): { year: number; month: number; day: number } {
  const [yearText, monthText, dayText] = calverDate.split('.');

  return {
    year: Number.parseInt(yearText, 10),
    month: Number.parseInt(monthText, 10),
    day: Number.parseInt(dayText, 10),
  };
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));

  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

export function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');

  return `${year}.${month}.${day}`;
}

export function resolveCalverDate(calverDate: string | undefined, now: Date = new Date()): string {
  if (calverDate !== undefined && calverDate !== '') {
    return calverDate;
  }

  return formatUtcDate(now);
}

export function validateCalverDate(calverDate: string): void {
  const match = CALVER_INPUT_PATTERN.exec(calverDate);

  if (match === null) {
    throw new Error('calver_date must use YYYY.MM.DD or YYYY.MM.DD-[A-Za-z0-9]{1,32} format');
  }

  const [, datePart] = match;
  const { year, month, day } = parseCalverDateParts(datePart);

  if (!isValidCalendarDate(year, month, day)) {
    throw new Error('calver_date must be a real calendar date in YYYY.MM.DD format');
  }
}

export function buildCalverTag(calverDate: string): string {
  validateCalverDate(calverDate);
  return `v${calverDate}`;
}

export function isCanonicalCalverTag(tag: string): boolean {
  return CANONICAL_CALVER_TAG_PATTERN.test(tag);
}
```

- [ ] **Step 4: Run the targeted test and verify it passes**

Run: `pnpm vitest run test/calver-tag.test.ts`

Expected: PASS for all tests in `test/calver-tag.test.ts`.

### Task 2: Documentation and Action Metadata

**Files:**
- Modify: `README.md`
- Modify: `action.yml`

- [ ] **Step 1: Update README input documentation**

Replace the `calver_date` input description in `README.md` with:

```md
| `calver_date` | No | Optional date override in `YYYY.MM.DD` or `YYYY.MM.DD-[A-Za-z0-9]{1,32}` format. Defaults to the current UTC date. |
```

Replace the workflow dispatch input description with:

```yaml
        description: Optional YYYY.MM.DD or YYYY.MM.DD-[A-Za-z0-9]{1,32} override for manual recovery.
```

Replace the Same-Day Manual Tags section with:

```md
## Same-Day Manual Tags

This action creates canonical daily tags like `v2026.05.10` by default. For an extra release on the same day, pass `calver_date` with a short alphanumeric suffix, such as `2026.05.10-handmade01`; the action will create `v2026.05.10-handmade01`.

Suffixes must be 1 to 32 ASCII alphanumeric characters. Downstream release workflows may match tag prefixes such as `v2026.05.10` when they need to handle both the canonical tag and same-day manual tags.
```

- [ ] **Step 2: Update action metadata**

Replace the `calver_date` description in `action.yml` with:

```yaml
    description: Optional date override in YYYY.MM.DD or YYYY.MM.DD-[A-Za-z0-9]{1,32} format. Defaults to the current UTC date.
```

- [ ] **Step 3: Run tests after documentation changes**

Run: `pnpm test`

Expected: PASS for the full Vitest suite.

### Task 3: Build and Final Verification

**Files:**
- Modify: `dist/index.js`

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Build bundled action output**

Run: `pnpm run build`

Expected: PASS and `dist/index.js` is regenerated from `src/index.ts`.

- [ ] **Step 3: Run full CI command**

Run: `pnpm run ci`

Expected: PASS for typecheck, tests, and build.

- [ ] **Step 4: Inspect changed files**

Run: `git diff -- src/domain/calver.ts test/calver-tag.test.ts README.md action.yml dist/index.js docs/superpowers/specs/2026-05-23-calver-suffix-input-design.md docs/superpowers/plans/2026-05-23-calver-suffix-input.md`

Expected: Diff contains only the validation, test, docs, bundled output, spec, and plan changes described above.
