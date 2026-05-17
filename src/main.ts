import * as core from '@actions/core';

import { createLightweightTag, getApiContext, lookupTag, resolveTargetSha } from './github';
import { getInputs } from './inputs';
import { buildCalverTag, resolveCalverDate, validateCalverDate } from './calver-tag';

export async function run(): Promise<void> {
  const inputs = getInputs();
  const calverDate = resolveCalverDate(inputs.calverDate);

  if (inputs.githubToken === '') {
    throw new Error('github_token is required');
  }

  if (inputs.targetRef === undefined) {
    throw new Error('target_ref is required');
  }

  validateCalverDate(calverDate);

  const tag = buildCalverTag(calverDate);
  const apiContext = getApiContext(inputs.githubToken);
  const existingTag = await lookupTag(apiContext, tag);

  core.setOutput('tag', tag);
  core.setOutput('tag_exists', existingTag.exists ? 'true' : 'false');

  if (existingTag.exists) {
    core.setOutput('created', 'false');
    core.setOutput('target_sha', existingTag.sha ?? '');
    return;
  }

  const targetSha = await resolveTargetSha(apiContext, inputs.targetRef);

  const creationResult = await createLightweightTag(apiContext, tag, targetSha);

  core.setOutput('created', creationResult.created ? 'true' : 'false');
  core.setOutput('target_sha', creationResult.sha);
}
