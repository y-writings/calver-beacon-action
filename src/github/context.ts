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
