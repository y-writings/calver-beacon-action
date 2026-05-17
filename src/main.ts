import { getInputs } from './action/inputs';
import { setCommonOutputs, setCreatedOutput } from './action/outputs';
import { buildCalverTag, resolveCalverDate, validateCalverDate } from './domain/calver';
import { shouldSkipTagCreation } from './domain/tag-policy';
import { getApiContext } from './github/context';
import { createLightweightTag, findLatestCalverTag, lookupTag, resolveTargetSha } from './github/refs';

function requireTargetRef(targetRef: string | undefined): string {
  if (targetRef === undefined) {
    throw new Error('target_ref is required');
  }

  return targetRef;
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

  setCommonOutputs({
    tag,
    targetSha,
    previousTag,
    previousTagSha,
  });

  if (shouldSkipTagCreation(previous, targetSha)) {
    setCreatedOutput(false);
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

  setCreatedOutput(creationResult.created);
}
