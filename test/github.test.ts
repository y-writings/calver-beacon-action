import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getApiContext } from '../src/github/context';
import { createLightweightTag, findLatestCalverTag, lookupTag, type TagLookupResult } from '../src/github/refs';

function jsonResponse(body: unknown, init: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  });
}

describe('GitHub API helpers', () => {
  const originalFetch = global.fetch;
  const originalRepository = process.env.GITHUB_REPOSITORY;

  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'y-writings/calver-beacon-action';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GITHUB_REPOSITORY = originalRepository;
    vi.restoreAllMocks();
  });

  it('returns a parsed API context from environment variables', () => {
    const context = getApiContext('token-value');

    expect(context).toEqual({
      token: 'token-value',
      owner: 'y-writings',
      repo: 'calver-beacon-action',
      apiBaseUrl: 'https://api.github.com',
    });
  });

  it('reports a missing tag when the API returns 404', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404, statusText: 'Not Found' }));

    const context = getApiContext('token-value');

    await expect(lookupTag(context, 'v2026.04.19')).resolves.toEqual({
      exists: false,
      ref: 'refs/tags/v2026.04.19',
    } satisfies TagLookupResult);
  });

  it('returns a clear error when lookup is forbidden', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Resource not accessible by integration' }), {
        status: 403,
        statusText: 'Forbidden',
      }),
    );

    const context = getApiContext('token-value');

    await expect(lookupTag(context, 'v2026.04.19')).rejects.toThrow(
      'GitHub API rejected tag lookup with 403 Forbidden. Ensure the workflow token can read repository contents.',
    );
  });

  it('dereferences an existing lightweight tag to its commit SHA', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          ref: 'refs/tags/v2026.04.19',
          object: {
            type: 'commit',
            sha: 'abc123',
          },
        },
        { status: 200 },
      ),
    );

    const context = getApiContext('token-value');

    await expect(lookupTag(context, 'v2026.04.19')).resolves.toEqual({
      exists: true,
      ref: 'refs/tags/v2026.04.19',
      sha: 'abc123',
    });
  });

  it('dereferences an existing annotated tag to its commit SHA', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ref: 'refs/tags/v2026.04.19',
            object: {
              type: 'tag',
              sha: 'tag-object-sha',
            },
          },
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            sha: 'tag-object-sha',
            object: {
              type: 'commit',
              sha: 'commit-sha',
            },
          },
          { status: 200 },
        ),
      );

    const context = getApiContext('token-value');

    await expect(lookupTag(context, 'v2026.04.19')).resolves.toEqual({
      exists: true,
      ref: 'refs/tags/v2026.04.19',
      sha: 'commit-sha',
    });
  });

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

  it('finds the latest canonical CalVer tag for a custom prefix', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          [
            { ref: 'refs/tags/app-2026.05.10-rc1', object: { type: 'commit', sha: 'ignored-manual' } },
            { ref: 'refs/tags/app-2026.05.03', object: { type: 'commit', sha: 'old-sha' } },
            { ref: 'refs/tags/app-2026.05.10', object: { type: 'commit', sha: 'latest-sha' } },
            { ref: 'refs/tags/v2026.05.10', object: { type: 'commit', sha: 'ignored-prefix' } },
          ],
          { status: 200 },
        ),
      );

    const context = getApiContext('token-value');

    await expect(findLatestCalverTag(context, 'app-')).resolves.toEqual({
      exists: true,
      ref: 'refs/tags/app-2026.05.10',
      tag: 'app-2026.05.10',
      sha: 'latest-sha',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/y-writings/calver-beacon-action/git/matching-refs/tags/app-',
      expect.any(Object),
    );
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

  it('returns a missing latest CalVer tag when no tag refs match the v prefix', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404, statusText: 'Not Found' }));

    const context = getApiContext('token-value');

    await expect(findLatestCalverTag(context)).resolves.toEqual({
      exists: false,
    });
  });

  it('returns a clear error when latest CalVer tag lookup is forbidden', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Resource not accessible by integration' }), {
        status: 403,
        statusText: 'Forbidden',
      }),
    );

    const context = getApiContext('token-value');

    await expect(findLatestCalverTag(context)).rejects.toThrow(
      'GitHub API rejected CalVer tag lookup with 403 Forbidden. Ensure the workflow token can read repository contents.',
    );
  });

  it('returns a clear error when latest CalVer tag dereference is forbidden', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          [
            { ref: 'refs/tags/v2026.05.10', object: { type: 'tag', sha: 'tag-object-sha' } },
          ],
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Resource not accessible by integration' }), {
          status: 403,
          statusText: 'Forbidden',
        }),
      );

    const context = getApiContext('token-value');

    await expect(findLatestCalverTag(context)).rejects.toThrow(
      'GitHub API rejected CalVer tag lookup with 403 Forbidden. Ensure the workflow token can read repository contents.',
    );
  });

  it('treats create conflicts as idempotent when the remote tag already points to the expected commit', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Reference already exists' }), { status: 422, statusText: 'Unprocessable Entity' }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ref: 'refs/tags/v2026.04.19',
            object: {
              type: 'commit',
              sha: 'abc123',
            },
          },
          { status: 200 },
        ),
      );

    const context = getApiContext('token-value');

    await expect(createLightweightTag(context, 'v2026.04.19', 'abc123')).resolves.toEqual({
      created: false,
      ref: 'refs/tags/v2026.04.19',
      sha: 'abc123',
    });
  });

  it('fails loudly when a conflicting remote tag points somewhere else', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Reference already exists' }), { status: 409, statusText: 'Conflict' }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ref: 'refs/tags/v2026.04.19',
            object: {
              type: 'commit',
              sha: 'def456',
            },
          },
          { status: 200 },
        ),
      );

    const context = getApiContext('token-value');

    await expect(createLightweightTag(context, 'v2026.04.19', 'abc123')).rejects.toThrow(
      'tag v2026.04.19 already exists and points to def456, expected abc123',
    );
  });
});
