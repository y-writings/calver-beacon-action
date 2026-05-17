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
