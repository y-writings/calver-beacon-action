# CalVer Tag Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the snapshot lookup/create action with a scheduled CalVer tag creation action that creates `vYYYY.MM.DD` only when `target_ref` changed since the latest canonical CalVer tag.

**Architecture:** Keep the existing small TypeScript action structure, but rename snapshot-specific helpers and inputs to CalVer concepts. GitHub API helpers will own branch resolution, tag lookup, tag listing, tag dereferencing, and lightweight tag creation. `src/main.ts` will orchestrate input validation, latest-tag comparison, same-day conflict detection, tag creation, and outputs.

**Tech Stack:** TypeScript, `@actions/core`, GitHub REST API via `fetch`, Vitest, esbuild, pnpm through mise.

---

## File Structure

- Modify `src/calver-tag.ts`: replace `src/snapshot-tag.ts` with CalVer date/tag helpers. If keeping the old file temporarily is easier, rename it in the same task and update imports.
- Modify `src/inputs.ts`: expose `targetRef`, `calverDate`, and `githubToken`; remove `createIfMissing` and `targetSha`.
- Modify `src/github.ts`: add canonical CalVer tag listing/selection support while keeping existing API context, branch resolution, lookup, dereference, and create helpers.
- Modify `src/main.ts`: implement the new action orchestration and outputs.
- Modify `action.yml`: update description, inputs, and outputs.
- Modify `README.md`: document the new scheduled CalVer tag workflow and same-day manual tag guidance.
- Modify tests under `test/`: update existing tests and add coverage for latest CalVer tag selection and new main flow behavior.
- Modify `dist/index.js`: rebuild with `mise exec -- pnpm build` after source changes.

### Task 1: CalVer Helper Rename And Validation

**Files:**
- Rename: `src/snapshot-tag.ts` -> `src/calver-tag.ts`
- Modify: `test/snapshot-tag.test.ts` -> `test/calver-tag.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `test/calver-tag.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';

import { buildCalverTag, formatUtcDate, resolveCalverDate, validateCalverDate } from '../src/calver-tag';

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
```

Remove `test/snapshot-tag.test.ts` after creating the replacement.

- [ ] **Step 2: Run helper tests to verify they fail**

Run: `mise exec -- pnpm test -- test/calver-tag.test.ts`

Expected: FAIL because `src/calver-tag.ts` does not exist or exported helper names are missing.

- [ ] **Step 3: Implement the helper rename**

Create `src/calver-tag.ts` with:

```ts
const CALVER_DATE_PATTERN = /^\d{4}\.\d{2}\.\d{2}$/;

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
  if (!CALVER_DATE_PATTERN.test(calverDate)) {
    throw new Error('calver_date must use YYYY.MM.DD format');
  }

  const { year, month, day } = parseCalverDateParts(calverDate);

  if (!isValidCalendarDate(year, month, day)) {
    throw new Error('calver_date must be a real calendar date in YYYY.MM.DD format');
  }
}

export function buildCalverTag(calverDate: string): string {
  validateCalverDate(calverDate);
  return `v${calverDate}`;
}

export function isCanonicalCalverTag(tag: string): boolean {
  return /^v\d{4}\.\d{2}\.\d{2}$/.test(tag);
}
```

Delete `src/snapshot-tag.ts`.

- [ ] **Step 4: Run helper tests to verify they pass**

Run: `mise exec -- pnpm test -- test/calver-tag.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/calver-tag.ts src/snapshot-tag.ts test/calver-tag.test.ts test/snapshot-tag.test.ts
git commit -m "refactor: rename snapshot helpers to calver"
```

### Task 2: Input Contract Cleanup

**Files:**
- Modify: `src/inputs.ts`
- Test through: `test/main.test.ts`

- [ ] **Step 1: Write the failing main test for required target_ref input**

Update the default `coreMocks.getInput.mockImplementation` in `test/main.test.ts` to use `calver_date` and no longer return `target_sha`:

```ts
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
```

Add this test:

```ts
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
```

- [ ] **Step 2: Run main tests to verify they fail**

Run: `mise exec -- pnpm test -- test/main.test.ts`

Expected: FAIL because `src/inputs.ts` still reads `snapshot_date`, `create_if_missing`, and `target_sha`.

- [ ] **Step 3: Implement input cleanup**

Replace `src/inputs.ts` with:

```ts
import * as core from '@actions/core';

export interface ActionInputs {
  calverDate: string | undefined;
  githubToken: string;
  targetRef: string | undefined;
}

export function getInputs(): ActionInputs {
  const calverDate = core.getInput('calver_date').trim();
  const githubToken = core.getInput('github_token').trim();
  const targetRef = core.getInput('target_ref').trim();

  return {
    calverDate: calverDate === '' ? undefined : calverDate,
    githubToken,
    targetRef: targetRef === '' ? undefined : targetRef,
  };
}
```

- [ ] **Step 4: Run main tests to verify current failures move to orchestration**

Run: `mise exec -- pnpm test -- test/main.test.ts`

Expected: Still FAIL until `src/main.ts` is updated in Task 4, but failures should no longer mention missing `snapshot_date` input parsing.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/inputs.ts test/main.test.ts
git commit -m "refactor: simplify calver action inputs"
```

### Task 3: GitHub API Latest CalVer Tag Support

**Files:**
- Modify: `src/github.ts`
- Modify: `test/github.test.ts`

- [ ] **Step 1: Write failing tests for listing and selecting latest canonical CalVer tags**

Update the import in `test/github.test.ts`:

```ts
import { createLightweightTag, findLatestCalverTag, getApiContext, lookupTag, type TagLookupResult } from '../src/github';
```

Add tests:

```ts
it('finds the latest canonical CalVer tag and dereferences it', async () => {
  global.fetch = vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse(
        [
          { ref: 'refs/tags/v2026.05.10-handmade-01', object: { type: 'commit', sha: 'ignored-manual' } },
          { ref: 'refs/tags/v2026.05.03', object: { type: 'commit', sha: 'old-sha' } },
          { ref: 'refs/tags/v2026.05.10', object: { type: 'commit', sha: 'latest-sha' } },
          { ref: 'refs/tags/v1', object: { type: 'commit', sha: 'ignored-version' } },
        ],
        { status: 200 },
      ),
    );

  const context = getApiContext('token-value');

  await expect(findLatestCalverTag(context)).resolves.toEqual({
    exists: true,
    ref: 'refs/tags/v2026.05.10',
    tag: 'v2026.05.10',
    sha: 'latest-sha',
  });
});

it('returns a missing latest CalVer tag when no canonical tags exist', async () => {
  global.fetch = vi.fn().mockResolvedValue(
    jsonResponse(
      [
        { ref: 'refs/tags/v2026.05.10-handmade-01', object: { type: 'commit', sha: 'manual-sha' } },
        { ref: 'refs/tags/v1', object: { type: 'commit', sha: 'version-sha' } },
      ],
      { status: 200 },
    ),
  );

  const context = getApiContext('token-value');

  await expect(findLatestCalverTag(context)).resolves.toEqual({
    exists: false,
  });
});
```

- [ ] **Step 2: Run GitHub helper tests to verify they fail**

Run: `mise exec -- pnpm test -- test/github.test.ts`

Expected: FAIL because `findLatestCalverTag` is not implemented.

- [ ] **Step 3: Implement latest CalVer tag listing**

Add interfaces to `src/github.ts`:

```ts
interface GitRefListResponseItem extends GitRefResponse {}

export interface LatestCalverTagResult {
  exists: boolean;
  ref?: string;
  tag?: string;
  sha?: string;
}
```

Add helpers near `encodeRefName`:

```ts
function tagNameFromRef(ref: string): string {
  return ref.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : ref;
}

function isCanonicalCalverTagName(tag: string): boolean {
  return /^v\d{4}\.\d{2}\.\d{2}$/.test(tag);
}
```

Export `findLatestCalverTag`:

```ts
export async function findLatestCalverTag(context: ApiContext): Promise<LatestCalverTagResult> {
  const response = await requestJson<GitRefListResponseItem[]>(
    context,
    `/repos/${context.owner}/${context.repo}/git/matching-refs/tags/v`,
  );

  const latest = response
    .map(item => ({ item, tag: tagNameFromRef(item.ref) }))
    .filter(({ tag }) => isCanonicalCalverTagName(tag))
    .sort((a, b) => b.tag.localeCompare(a.tag))[0];

  if (latest === undefined) {
    return { exists: false };
  }

  return {
    exists: true,
    ref: latest.item.ref,
    tag: latest.tag,
    sha: await dereferenceRefTarget(context, latest.item),
  };
}
```

- [ ] **Step 4: Run GitHub helper tests to verify they pass**

Run: `mise exec -- pnpm test -- test/github.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/github.ts test/github.test.ts
git commit -m "feat: find latest calver tag"
```

### Task 4: Main Action Orchestration

**Files:**
- Modify: `src/main.ts`
- Modify: `test/main.test.ts`

- [ ] **Step 1: Replace main tests with the new action behavior**

Update `test/main.test.ts` mocks:

```ts
const githubMocks = vi.hoisted(() => ({
  getApiContext: vi.fn(),
  lookupTag: vi.fn(),
  findLatestCalverTag: vi.fn(),
  resolveTargetSha: vi.fn(),
  createLightweightTag: vi.fn(),
}));
```

Use this `beforeEach` body:

```ts
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
```

Replace behavior tests with:

```ts
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
```

- [ ] **Step 2: Run main tests to verify they fail**

Run: `mise exec -- pnpm test -- test/main.test.ts`

Expected: FAIL because `src/main.ts` still uses snapshot orchestration.

- [ ] **Step 3: Implement main orchestration**

Replace `src/main.ts` with:

```ts
import * as core from '@actions/core';

import { buildCalverTag, resolveCalverDate, validateCalverDate } from './calver-tag';
import { createLightweightTag, findLatestCalverTag, getApiContext, lookupTag, resolveTargetSha } from './github';
import { getInputs } from './inputs';

function requireTargetRef(targetRef: string | undefined): string {
  if (targetRef === undefined) {
    throw new Error('target_ref is required');
  }

  return targetRef;
}

function setCommonOutputs(tag: string, targetSha: string, previousTag: string, previousTagSha: string): void {
  core.setOutput('tag', tag);
  core.setOutput('target_sha', targetSha);
  core.setOutput('previous_tag', previousTag);
  core.setOutput('previous_tag_sha', previousTagSha);
}

export async function run(): Promise<void> {
  const inputs = getInputs();
  const calverDate = resolveCalverDate(inputs.calverDate);

  if (inputs.githubToken === '') {
    throw new Error('github_token is required');
  }

  const targetRef = requireTargetRef(inputs.targetRef);

  validateCalverDate(calverDate);

  const tag = buildCalverTag(calverDate);
  const apiContext = getApiContext(inputs.githubToken);
  const targetSha = await resolveTargetSha(apiContext, targetRef);
  const previous = await findLatestCalverTag(apiContext);
  const previousTag = previous.tag ?? '';
  const previousTagSha = previous.sha ?? '';

  setCommonOutputs(tag, targetSha, previousTag, previousTagSha);

  if (previous.exists && previous.sha === targetSha) {
    core.setOutput('created', 'false');
    return;
  }

  const existingToday = await lookupTag(apiContext, tag);
  if (existingToday.exists && existingToday.sha !== targetSha) {
    throw new Error(
      `tag ${tag} already exists and points to ${existingToday.sha ?? 'unknown'}, expected ${targetSha}. Create a manual same-day CalVer tag if another release is required.`,
    );
  }

  const creationResult = existingToday.exists
    ? { created: false, sha: targetSha }
    : await createLightweightTag(apiContext, tag, targetSha);

  core.setOutput('created', creationResult.created ? 'true' : 'false');
}
```

- [ ] **Step 4: Run main tests to verify they pass**

Run: `mise exec -- pnpm test -- test/main.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/main.ts test/main.test.ts
git commit -m "feat: create calver tags when branch changed"
```

### Task 5: Action Metadata And Documentation

**Files:**
- Modify: `action.yml`
- Modify: `README.md`

- [ ] **Step 1: Update action metadata**

Replace `action.yml` inputs and outputs with:

```yaml
name: CalVer Beacon Action
description: Create scheduled CalVer release-trigger tags when a target branch changed since the previous CalVer tag.
author: y-writings

inputs:
  target_ref:
    description: Branch ref to evaluate and tag, for example main or refs/heads/main.
    required: true
  calver_date:
    description: Optional date override in YYYY.MM.DD format. Defaults to the current UTC date.
    required: false
  github_token:
    description: GitHub token used for remote ref lookup and tag creation.
    required: false
    default: ${{ github.token }}

outputs:
  tag:
    description: CalVer tag the action attempted to create.
  created:
    description: Whether this action created the tag during this run.
  target_sha:
    description: Commit SHA resolved from target_ref.
  previous_tag:
    description: Latest existing canonical CalVer tag used for comparison, if any.
  previous_tag_sha:
    description: Commit SHA referenced by previous_tag, if any.

runs:
  using: node24
  main: dist/index.js

branding:
  icon: tag
  color: blue
```

- [ ] **Step 2: Update README**

Replace the README body with concise docs covering: purpose, requirements, inputs, outputs, weekly schedule example, local development, and same-day manual tag guidance. Use `calver_date`, `target_ref`, `created`, `previous_tag`, and `previous_tag_sha`; do not mention `snapshot_date`, `create_if_missing`, `target_sha` input, `tag_exists`, or dry-run behavior.

- [ ] **Step 3: Run a grep check for removed public contract names**

Run: `rg "snapshot_date|create_if_missing|tag_exists|skipped_reason|target_sha.*input|target_sha.*Required" README.md action.yml src test`

Expected: no matches except legitimate `target_sha` output references and any historical wording in committed design docs.

- [ ] **Step 4: Commit**

Run:

```bash
git add action.yml README.md
git commit -m "docs: document calver tag action contract"
```

### Task 6: Build Artifact And Full Verification

**Files:**
- Modify: `dist/index.js`

- [ ] **Step 1: Run typecheck**

Run: `mise exec -- pnpm typecheck`

Expected: PASS.

- [ ] **Step 2: Run all tests**

Run: `mise exec -- pnpm test`

Expected: PASS with all test files passing.

- [ ] **Step 3: Rebuild dist**

Run: `mise exec -- pnpm build`

Expected: PASS and `dist/index.js` updated.

- [ ] **Step 4: Run full CI command**

Run: `mise exec -- pnpm ci`

Expected: PASS.

- [ ] **Step 5: Inspect final diff**

Run: `git diff --stat && git diff -- src action.yml README.md test docs/superpowers dist/index.js`

Expected: Changes match the design: no snapshot public contract remains, CalVer contract is documented, tests cover create/skip/error paths, and dist is rebuilt.

- [ ] **Step 6: Commit**

Run:

```bash
git add dist/index.js
git commit -m "build: update bundled action"
```

## Self-Review Notes

- Spec coverage: inputs, outputs, CalVer format, latest-tag comparison, same-day conflict error, weekly schedule docs, non-goals, and tests are covered by Tasks 1-6.
- Placeholder scan: no TBD/TODO placeholders are intentionally left for implementation.
- Type consistency: `calverDate`, `targetRef`, `findLatestCalverTag`, `previous_tag`, and `previous_tag_sha` are used consistently across tasks.
