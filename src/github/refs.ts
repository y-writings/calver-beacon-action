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
