import { getInput } from './core';

export interface ActionInputs {
  calverDate: string | undefined;
  githubToken: string;
  tagPrefix: string;
  targetRef: string | undefined;
}

export function getInputs(): ActionInputs {
  const calverDate = getInput('calver_date').trim();
  const githubToken = getInput('github_token').trim();
  const tagPrefix = getInput('tag_prefix').trim();
  const targetRef = getInput('target_ref').trim();

  return {
    calverDate: calverDate === '' ? undefined : calverDate,
    githubToken,
    tagPrefix: tagPrefix === '' ? 'v' : tagPrefix,
    targetRef: targetRef === '' ? undefined : targetRef,
  };
}
