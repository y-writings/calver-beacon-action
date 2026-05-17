import * as core from '@actions/core';

export interface CommonOutputs {
  tag: string;
  targetSha: string;
  previousTag: string;
  previousTagSha: string;
}

export function setCommonOutputs(outputs: CommonOutputs): void {
  core.setOutput('tag', outputs.tag);
  core.setOutput('target_sha', outputs.targetSha);
  core.setOutput('previous_tag', outputs.previousTag);
  core.setOutput('previous_tag_sha', outputs.previousTagSha);
}

export function setCreatedOutput(created: boolean): void {
  core.setOutput('created', created ? 'true' : 'false');
}
