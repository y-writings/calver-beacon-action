import * as core from '@actions/core';

import { createLightweightTag, getApiContext, lookupTag, resolveTargetSha } from './github';
import { getInputs } from './inputs';
import { buildCalverTag, resolveCalverDate, validateCalverDate } from './calver-tag';

function validateTargetInputs(targetRef: string | undefined, targetSha: string | undefined): void {
  if (targetRef !== undefined && targetSha !== undefined) {
    throw new Error('target_ref and target_sha are mutually exclusive');
  }
}

export async function run(): Promise<void> {
  const inputs = getInputs();
  const snapshotDate = resolveCalverDate(inputs.snapshotDate);

  if (inputs.githubToken === '') {
    throw new Error('github_token is required');
  }

  validateTargetInputs(inputs.targetRef, inputs.targetSha);

  validateCalverDate(snapshotDate);

  const tag = buildCalverTag(snapshotDate);
  const apiContext = getApiContext(inputs.githubToken);
  const existingTag = await lookupTag(apiContext, tag);

  core.setOutput('tag', tag);
  core.setOutput('tag_exists', existingTag.exists ? 'true' : 'false');

  if (existingTag.exists) {
    core.setOutput('created', 'false');
    core.setOutput('target_sha', existingTag.sha ?? '');
    return;
  }

  if (!inputs.createIfMissing) {
    core.setOutput('created', 'false');
    core.setOutput('target_sha', '');
    return;
  }

  const targetSha = inputs.targetSha ?? (inputs.targetRef === undefined ? undefined : await resolveTargetSha(apiContext, inputs.targetRef));
  if (targetSha === undefined) {
    throw new Error('target_ref or target_sha is required when create_if_missing is true');
  }

  const creationResult = await createLightweightTag(apiContext, tag, targetSha);

  core.setOutput('created', creationResult.created ? 'true' : 'false');
  core.setOutput('target_sha', creationResult.sha);
}
