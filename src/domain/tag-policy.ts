export type LatestCalverTag =
  | { exists: false }
  | { exists: true; ref: string; tag: string; sha: string };

export function shouldSkipTagCreation(latest: LatestCalverTag, targetSha: string): boolean {
  return latest.exists && latest.sha === targetSha;
}
