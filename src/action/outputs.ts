import { setOutput } from './core';

export interface CommonOutputs {
  tag: string;
  targetSha: string;
  previousTag: string;
  previousTagSha: string;
}

export function setCommonOutputs(outputs: CommonOutputs): void {
  setOutput('tag', outputs.tag);
  setOutput('target_sha', outputs.targetSha);
  setOutput('previous_tag', outputs.previousTag);
  setOutput('previous_tag_sha', outputs.previousTagSha);
}

export function setCreatedOutput(created: boolean): void {
  setOutput('created', created ? 'true' : 'false');
}
