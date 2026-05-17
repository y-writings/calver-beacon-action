export interface ApiContext {
  token: string;
  owner: string;
  repo: string;
  apiBaseUrl: string;
}

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

export type LatestCalverTagResult =
  | { exists: false }
  | { exists: true; ref: string; tag: string; sha: string };

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

async function requestJson<T>(context: ApiContext, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(context.apiBaseUrl, path), {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${context.token}`,
      'User-Agent': 'snapshot-tag-action',
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

function encodeRefName(refName: string): string {
  return refName
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function tagNameFromRef(ref: string): string {
  return ref.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : ref;
}

function isCanonicalCalverTagName(tag: string): boolean {
  return /^v\d{4}\.\d{2}\.\d{2}$/.test(tag);
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

export async function findLatestCalverTag(context: ApiContext): Promise<LatestCalverTagResult> {
  try {
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
