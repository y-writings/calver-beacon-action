# CalVer Action Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the CalVer tag GitHub Action into focused layers without changing inputs, outputs, tag policy, or error behavior.

**Architecture:** Keep `src/index.ts` as the entrypoint and `src/main.ts` as the orchestration boundary. Move pure CalVer and tag policy logic into `src/domain`, Action I/O into `src/action`, and GitHub REST transport/ref operations into focused files under `src/github`.

**Tech Stack:** TypeScript, Node 24 GitHub Actions runtime, `@actions/core`, native `fetch`, Vitest, `@vercel/ncc`, pnpm.

---

## File Structure

- Create `src/action/inputs.ts`: read and normalize action inputs from `@actions/core`.
- Create `src/action/outputs.ts`: define output names and write common/created outputs through `@actions/core`.
- Create `src/domain/calver.ts`: own CalVer date formatting, validation, tag building, and canonical tag detection.
- Create `src/domain/tag-policy.ts`: own pure tag creation decision logic.
- Create `src/github/api.ts`: own API context type, API error type, URL building, error detail formatting, and authenticated JSON requests.
- Create `src/github/context.ts`: parse GitHub repository environment variables into an API context.
- Create `src/github/refs.ts`: own branch/tag REST operations and Git ref response types.
- Modify `src/main.ts`: orchestrate through the new layers.
- Modify `src/index.ts`: keep the entrypoint unchanged unless import paths require changes.
- Delete `src/calver-tag.ts`, `src/github.ts`, and `src/inputs.ts` after imports are migrated.
- Modify `test/calver-tag.test.ts`: point tests to `src/domain/calver.ts` and add canonical tag detection coverage.
- Create `test/tag-policy.test.ts`: test pure tag policy decisions.
- Create `test/inputs.test.ts`: test input normalization.
- Create `test/outputs.test.ts`: test output writing.
- Modify `test/github.test.ts`: split imports between `src/github/context.ts` and `src/github/refs.ts`.
- Modify `test/main.test.ts`: mock the new modules used by `src/main.ts`.

---

### Task 1: Move CalVer Domain Logic

**Files:**
- Create: `src/domain/calver.ts`
- Modify: `test/calver-tag.test.ts`
- Later delete: `src/calver-tag.ts`

- [ ] **Step 1: Write the failing import/update test**

Replace `test/calver-tag.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';

import { buildCalverTag, formatUtcDate, isCanonicalCalverTag, resolveCalverDate, validateCalverDate } from '../src/domain/calver';

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

  it('identifies only canonical CalVer tags', () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/calver-tag.test.ts`

Expected: FAIL because `../src/domain/calver` does not exist.

- [ ] **Step 3: Create the domain implementation**

Create `src/domain/calver.ts` with:

```ts
const CALVER_DATE_PATTERN = /^\d{4}\.\d{2}\.\d{2}$/;
const CANONICAL_CALVER_TAG_PATTERN = /^v\d{4}\.\d{2}\.\d{2}$/;

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
  return CANONICAL_CALVER_TAG_PATTERN.test(tag);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test test/calver-tag.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Do not commit unless the user explicitly asks for commits. If committing is requested, run:

```bash
git add src/domain/calver.ts test/calver-tag.test.ts
git commit -m "refactor: move calver logic to domain"
```

---

### Task 2: Add Action Input and Output Boundaries

**Files:**
- Create: `src/action/inputs.ts`
- Create: `src/action/outputs.ts`
- Create: `test/inputs.test.ts`
- Create: `test/outputs.test.ts`
- Later delete: `src/inputs.ts`

- [ ] **Step 1: Write input boundary tests**

Create `test/inputs.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  getInput: vi.fn<(name: string) => string>(),
}));

vi.mock('@actions/core', () => coreMocks);

import { getInputs } from '../src/action/inputs';

describe('getInputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trims and normalizes action inputs', () => {
    coreMocks.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'calver_date':
          return ' 2026.04.19 ';
        case 'github_token':
          return ' token-value ';
        case 'target_ref':
          return ' main ';
        default:
          return '';
      }
    });

    expect(getInputs()).toEqual({
      calverDate: '2026.04.19',
      githubToken: 'token-value',
      targetRef: 'main',
    });
  });

  it('normalizes empty optional values to undefined while preserving empty token', () => {
    coreMocks.getInput.mockReturnValue('   ');

    expect(getInputs()).toEqual({
      calverDate: undefined,
      githubToken: '',
      targetRef: undefined,
    });
  });
});
```

- [ ] **Step 2: Write output boundary tests**

Create `test/outputs.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  setOutput: vi.fn<(name: string, value: string) => void>(),
}));

vi.mock('@actions/core', () => coreMocks);

import { setCommonOutputs, setCreatedOutput } from '../src/action/outputs';

describe('action outputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes common action outputs', () => {
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

  it('writes created as a string output', () => {
    setCreatedOutput(true);
    setCreatedOutput(false);

    expect(coreMocks.setOutput).toHaveBeenCalledWith('created', 'true');
    expect(coreMocks.setOutput).toHaveBeenCalledWith('created', 'false');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test test/inputs.test.ts test/outputs.test.ts`

Expected: FAIL because `src/action/inputs.ts` and `src/action/outputs.ts` do not exist.

- [ ] **Step 4: Create input boundary implementation**

Create `src/action/inputs.ts` with:

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

- [ ] **Step 5: Create output boundary implementation**

Create `src/action/outputs.ts` with:

```ts
import * as core from '@actions/core';

export interface CommonOutputs {
  tag: string;
  targetSha: string;
  previousTag: string;
  previousTagSha: string;
}

export function setCommonOutputs(outputs: CommonOutputs): void {
  core.setOutput('tag', outputs.tag);
  core.setOutput('target_sha', outputs.targetSha);
  core.setOutput('previous_tag', outputs.previousTag);
  core.setOutput('previous_tag_sha', outputs.previousTagSha);
}

export function setCreatedOutput(created: boolean): void {
  core.setOutput('created', created ? 'true' : 'false');
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test test/inputs.test.ts test/outputs.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

Do not commit unless the user explicitly asks for commits. If committing is requested, run:

```bash
git add src/action/inputs.ts src/action/outputs.ts test/inputs.test.ts test/outputs.test.ts
git commit -m "refactor: add action io boundaries"
```

---

### Task 3: Add Pure Tag Policy

**Files:**
- Create: `src/domain/tag-policy.ts`
- Create: `test/tag-policy.test.ts`

- [ ] **Step 1: Write tag policy tests**

Create `test/tag-policy.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';

import { shouldSkipTagCreation, type LatestCalverTag } from '../src/domain/tag-policy';

describe('tag policy', () => {
  it('skips tag creation when the latest canonical tag points to the target SHA', () => {
    const latest: LatestCalverTag = {
      exists: true,
      ref: 'refs/tags/v2026.04.12',
      tag: 'v2026.04.12',
      sha: 'target-sha',
    };

    expect(shouldSkipTagCreation(latest, 'target-sha')).toBe(true);
  });

  it('does not skip when the latest canonical tag points to a different SHA', () => {
    const latest: LatestCalverTag = {
      exists: true,
      ref: 'refs/tags/v2026.04.12',
      tag: 'v2026.04.12',
      sha: 'previous-sha',
    };

    expect(shouldSkipTagCreation(latest, 'target-sha')).toBe(false);
  });

  it('does not skip when no latest canonical tag exists', () => {
    expect(shouldSkipTagCreation({ exists: false }, 'target-sha')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/tag-policy.test.ts`

Expected: FAIL because `src/domain/tag-policy.ts` does not exist.

- [ ] **Step 3: Create tag policy implementation**

Create `src/domain/tag-policy.ts` with:

```ts
export type LatestCalverTag =
  | { exists: false }
  | { exists: true; ref: string; tag: string; sha: string };

export function shouldSkipTagCreation(latest: LatestCalverTag, targetSha: string): boolean {
  return latest.exists && latest.sha === targetSha;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test test/tag-policy.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Do not commit unless the user explicitly asks for commits. If committing is requested, run:

```bash
git add src/domain/tag-policy.ts test/tag-policy.test.ts
git commit -m "refactor: isolate tag policy"
```

---

### Task 4: Split GitHub API Transport and Context

**Files:**
- Create: `src/github/api.ts`
- Create: `src/github/context.ts`
- Modify: `test/github.test.ts`

- [ ] **Step 1: Update GitHub tests to import context separately**

In `test/github.test.ts`, change the import from:

```ts
import { createLightweightTag, findLatestCalverTag, getApiContext, lookupTag, type TagLookupResult } from '../src/github';
```

to:

```ts
import { getApiContext } from '../src/github/context';
import { createLightweightTag, findLatestCalverTag, lookupTag, type TagLookupResult } from '../src/github/refs';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/github.test.ts`

Expected: FAIL because `src/github/context.ts` and `src/github/refs.ts` do not exist.

- [ ] **Step 3: Create API transport implementation**

Create `src/github/api.ts` with:

```ts
export interface ApiContext {
  token: string;
  owner: string;
  repo: string;
  apiBaseUrl: string;
}

export class GitHubApiError extends Error {
  public readonly status: number;
  public readonly details: string;

  public constructor(message: string, status: number, details: string) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.details = details;
  }
}

function buildApiUrl(apiBaseUrl: string, path: string): string {
  const normalizedBase = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  return `${normalizedBase}${path}`;
}

function formatErrorDetails(bodyText: string): string {
  if (bodyText.trim() === '') {
    return 'No response body returned.';
  }

  try {
    const parsed = JSON.parse(bodyText) as { message?: string; errors?: unknown };
    if (parsed.message !== undefined) {
      const suffix = parsed.errors === undefined ? '' : ` errors=${JSON.stringify(parsed.errors)}`;
      return `${parsed.message}${suffix}`;
    }
  } catch {
    // Fall back to the raw body text.
  }

  return bodyText;
}

export async function requestJson<T>(context: ApiContext, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(context.apiBaseUrl, path), {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${context.token}`,
      'User-Agent': 'calver-beacon-action',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new GitHubApiError(
      `GitHub API request failed: ${response.status} ${response.statusText}`,
      response.status,
      formatErrorDetails(bodyText),
    );
  }

  return await response.json() as T;
}
```

- [ ] **Step 4: Create context implementation**

Create `src/github/context.ts` with:

```ts
import type { ApiContext } from './api';

export function getApiContext(token: string): ApiContext {
  const repository = process.env.GITHUB_REPOSITORY;

  if (repository === undefined || repository.trim() === '') {
    throw new Error('GITHUB_REPOSITORY is not set');
  }

  const [owner, repo] = repository.split('/');
  if (owner === undefined || owner === '' || repo === undefined || repo === '') {
    throw new Error(`GITHUB_REPOSITORY must use owner/repo format, received: ${repository}`);
  }

  return {
    token,
    owner,
    repo,
    apiBaseUrl: process.env.GITHUB_API_URL?.trim() || 'https://api.github.com',
  };
}
```

- [ ] **Step 5: Run test to confirm only refs module is missing**

Run: `pnpm test test/github.test.ts`

Expected: FAIL because `src/github/refs.ts` does not exist.

- [ ] **Step 6: Commit**

Do not commit unless the user explicitly asks for commits. If committing is requested, run:

```bash
git add src/github/api.ts src/github/context.ts test/github.test.ts
git commit -m "refactor: split github api context"
```

---

### Task 5: Move GitHub Ref Operations

**Files:**
- Create: `src/github/refs.ts`
- Modify: `test/github.test.ts`
- Later delete: `src/github.ts`

- [ ] **Step 1: Create ref operation implementation**

Create `src/github/refs.ts` with:

```ts
import { isCanonicalCalverTag } from '../domain/calver';
import type { LatestCalverTag } from '../domain/tag-policy';
import { GitHubApiError, requestJson, type ApiContext } from './api';

interface GitRefResponse {
  ref: string;
  object: {
    type: 'commit' | 'tag';
    sha: string;
  };
}

interface GitRefListResponseItem extends GitRefResponse {}

interface GitTagResponse {
  sha: string;
  object: {
    type: 'commit' | 'tag' | 'tree' | 'blob';
    sha: string;
  };
}

export interface TagLookupResult {
  exists: boolean;
  ref: string;
  sha?: string;
}

export interface CreateTagResult {
  created: boolean;
  ref: string;
  sha: string;
}

function encodeRefName(refName: string): string {
  return refName
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function tagNameFromRef(ref: string): string {
  return ref.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : ref;
}

async function dereferenceRefTarget(context: ApiContext, response: GitRefResponse): Promise<string> {
  if (response.object.type === 'commit') {
    return response.object.sha;
  }

  const tag = await requestJson<GitTagResponse>(
    context,
    `/repos/${context.owner}/${context.repo}/git/tags/${response.object.sha}`,
  );

  if (tag.object.type !== 'commit') {
    throw new Error(`tag ${response.ref} does not point to a commit`);
  }

  return tag.object.sha;
}

export async function lookupTag(context: ApiContext, tag: string): Promise<TagLookupResult> {
  try {
    const response = await requestJson<GitRefResponse>(
      context,
      `/repos/${context.owner}/${context.repo}/git/ref/tags/${encodeRefName(tag)}`,
    );

    const sha = await dereferenceRefTarget(context, response);

    return {
      exists: true,
      ref: response.ref,
      sha,
    };
  } catch (error: unknown) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return {
        exists: false,
        ref: `refs/tags/${tag}`,
      };
    }

    if (error instanceof GitHubApiError && error.status === 403) {
      throw new Error(
        `GitHub API rejected tag lookup with 403 Forbidden. Ensure the workflow token can read repository contents. Details: ${error.details}`,
      );
    }

    throw error;
  }
}

export async function findLatestCalverTag(context: ApiContext): Promise<LatestCalverTag> {
  try {
    const response = await requestJson<GitRefListResponseItem[]>(
      context,
      `/repos/${context.owner}/${context.repo}/git/matching-refs/tags/v`,
    );

    const latest = response
      .map(item => ({ item, tag: tagNameFromRef(item.ref) }))
      .filter(({ tag }) => isCanonicalCalverTag(tag))
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
  } catch (error: unknown) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return { exists: false };
    }

    if (error instanceof GitHubApiError && error.status === 403) {
      throw new Error(
        `GitHub API rejected CalVer tag lookup with 403 Forbidden. Ensure the workflow token can read repository contents. Details: ${error.details}`,
      );
    }

    throw error;
  }
}

export async function resolveTargetSha(context: ApiContext, targetRef: string): Promise<string> {
  const normalizedRef = targetRef.startsWith('refs/heads/') ? targetRef.slice('refs/heads/'.length) : targetRef;

  const response = await requestJson<GitRefResponse>(
    context,
    `/repos/${context.owner}/${context.repo}/git/ref/heads/${encodeRefName(normalizedRef)}`,
  );

  if (response.object.type !== 'commit') {
    throw new Error(`branch ${targetRef} does not resolve to a commit`);
  }

  return response.object.sha;
}

export async function createLightweightTag(
  context: ApiContext,
  tag: string,
  targetSha: string,
): Promise<CreateTagResult> {
  try {
    const response = await requestJson<GitRefResponse>(
      context,
      `/repos/${context.owner}/${context.repo}/git/refs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: `refs/tags/${tag}`,
          sha: targetSha,
        }),
      },
    );

    return {
      created: true,
      ref: response.ref,
      sha: targetSha,
    };
  } catch (error: unknown) {
    if (error instanceof GitHubApiError && (error.status === 409 || error.status === 422)) {
      const existing = await lookupTag(context, tag);

      if (!existing.exists || existing.sha === undefined) {
        throw new Error(`tag ${tag} creation conflicted and could not be re-read`);
      }

      if (existing.sha !== targetSha) {
        throw new Error(
          `tag ${tag} already exists and points to ${existing.sha}, expected ${targetSha}`,
        );
      }

      return {
        created: false,
        ref: existing.ref,
        sha: existing.sha,
      };
    }

    if (error instanceof GitHubApiError && error.status === 403) {
      throw new Error(
        `GitHub API rejected tag creation with 403 Forbidden. Ensure the workflow token has contents: write. Details: ${error.details}`,
      );
    }

    throw error;
  }
}
```

- [ ] **Step 2: Run GitHub tests**

Run: `pnpm test test/github.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

Do not commit unless the user explicitly asks for commits. If committing is requested, run:

```bash
git add src/github/refs.ts test/github.test.ts
git commit -m "refactor: move github ref operations"
```

---

### Task 6: Rewire Main Orchestration

**Files:**
- Modify: `src/main.ts`
- Modify: `test/main.test.ts`
- Delete: `src/calver-tag.ts`
- Delete: `src/github.ts`
- Delete: `src/inputs.ts`

- [ ] **Step 1: Update main tests for new module boundaries**

Replace `test/main.test.ts` with:

```ts
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

  it('creates a CalVer tag when target_ref changed since the latest CalVer tag', async () => {
    await run();

    expect(refMocks.resolveTargetSha).toHaveBeenCalledWith({ token: 'token-value' }, 'main');
    expect(refMocks.findLatestCalverTag).toHaveBeenCalledWith({ token: 'token-value' });
    expect(refMocks.lookupTag).toHaveBeenCalledWith({ token: 'token-value' }, 'v2026.04.19');
    expect(refMocks.createLightweightTag).toHaveBeenCalledWith({ token: 'token-value' }, 'v2026.04.19', 'target-sha');
    expect(outputMocks.setCommonOutputs).toHaveBeenCalledWith({
      tag: 'v2026.04.19',
      targetSha: 'target-sha',
      previousTag: 'v2026.04.12',
      previousTagSha: 'previous-sha',
    });
    expect(outputMocks.setCreatedOutput).toHaveBeenCalledWith(true);
  });

  it('does not create a tag when target_ref has not changed since the latest CalVer tag', async () => {
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

  it('creates a tag when no previous CalVer tag exists', async () => {
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

  it('fails when todays CalVer tag already exists at a different SHA', async () => {
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
```

- [ ] **Step 2: Run main test to verify it fails before rewiring**

Run: `pnpm test test/main.test.ts`

Expected: FAIL because `src/main.ts` still imports old modules.

- [ ] **Step 3: Replace main orchestration**

Replace `src/main.ts` with:

```ts
import { getInputs } from './action/inputs';
import { setCommonOutputs, setCreatedOutput } from './action/outputs';
import { buildCalverTag, resolveCalverDate, validateCalverDate } from './domain/calver';
import { shouldSkipTagCreation } from './domain/tag-policy';
import { getApiContext } from './github/context';
import { createLightweightTag, findLatestCalverTag, lookupTag, resolveTargetSha } from './github/refs';

function requireTargetRef(targetRef: string | undefined): string {
  if (targetRef === undefined) {
    throw new Error('target_ref is required');
  }

  return targetRef;
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
  const previousTag = previous.exists ? previous.tag : '';
  const previousTagSha = previous.exists ? previous.sha : '';

  setCommonOutputs({
    tag,
    targetSha,
    previousTag,
    previousTagSha,
  });

  if (shouldSkipTagCreation(previous, targetSha)) {
    setCreatedOutput(false);
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

  setCreatedOutput(creationResult.created);
}
```

- [ ] **Step 4: Delete old modules**

Delete these files after imports are migrated:

```text
src/calver-tag.ts
src/github.ts
src/inputs.ts
```

- [ ] **Step 5: Run main test to verify it passes**

Run: `pnpm test test/main.test.ts`

Expected: PASS.

- [ ] **Step 6: Run all tests to catch import regressions**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 7: Commit**

Do not commit unless the user explicitly asks for commits. If committing is requested, run:

```bash
git add src/main.ts test/main.test.ts src/action/inputs.ts src/action/outputs.ts src/domain/calver.ts src/domain/tag-policy.ts src/github/api.ts src/github/context.ts src/github/refs.ts
git add -u src/calver-tag.ts src/github.ts src/inputs.ts
git commit -m "refactor: rewire calver action layers"
```

---

### Task 7: Final Verification and Build Artifact

**Files:**
- Modify: `dist/index.js`

- [ ] **Step 1: Run typecheck**

Run: `pnpm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`

Expected: PASS. The expected count will increase from the baseline because new focused tests were added.

- [ ] **Step 3: Rebuild distributable action bundle**

Run: `pnpm run build`

Expected: PASS and `dist/index.js` updated.

- [ ] **Step 4: Inspect git status**

Run: `git status --short`

Expected: only intentional source, test, docs, and `dist/index.js` changes are listed.

- [ ] **Step 5: Commit**

Do not commit unless the user explicitly asks for commits. If committing is requested, run:

```bash
git add dist/index.js docs/superpowers/specs/2026-05-17-calver-action-refactor-design.md docs/superpowers/plans/2026-05-17-calver-action-refactor.md
git commit -m "chore: update action bundle after refactor"
```

---

## Self-Review

- Spec coverage: The plan preserves public inputs/outputs, UTC date defaulting, branch ref handling, latest canonical tag filtering, same-day conflict failure, concurrent conflict idempotency, and GitHub API permission errors.
- Placeholder scan: No task contains unresolved placeholders. Each code step includes concrete code or an exact command.
- Type consistency: `LatestCalverTag`, `ApiContext`, `TagLookupResult`, and output object property names are consistent across tasks.
