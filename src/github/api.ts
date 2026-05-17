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
