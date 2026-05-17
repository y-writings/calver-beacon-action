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
  const previousTag = previous.exists ? previous.tag : '';
  const previousTagSha = previous.exists ? previous.sha : '';

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
