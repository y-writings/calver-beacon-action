# CalVer Tag Action Design

## Purpose

This action creates the Git tag that triggers a downstream release workflow. It is designed for scheduled GitHub Actions runs, typically once per week, and follows the release-flow idea where a tag is the immutable release starting point.

The action owns the decision from "should a release-trigger tag be created?" through the actual tag creation. It does not build artifacts, create GitHub Releases, publish packages, or handle same-day extra release tags.

## Tag Format

The action automatically creates only fixed-width CalVer tags:

```text
vYYYY.MM.DD
```

Example:

```text
v2026.05.17
```

The zero-padded format is the canonical format for this action because it sorts predictably, validates simply, and preserves a clear date shape.

Same-day extra releases are outside this action's scope. If a project needs an additional release on the same date, the maintainer should create a manual tag that still starts with the CalVer date, for example:

```text
v2026.05.10-handmade-01
```

The downstream release workflow may choose to match both `vYYYY.MM.DD` and `vYYYY.MM.DD-*`, but that matching policy is outside this action's responsibility.

## Inputs

The action is treated as a new action with no backward-compatibility requirement. Existing snapshot-oriented inputs are removed when they no longer match the new responsibility.

Inputs:

| Name | Required | Description |
| --- | --- | --- |
| `target_ref` | Yes | Branch ref to evaluate and tag, for example `main` or `refs/heads/main`. |
| `calver_date` | No | Date override in `YYYY.MM.DD` format. When omitted, the action uses the current UTC date. |
| `github_token` | No | GitHub token used for remote ref lookup and tag creation. Defaults to `${{ github.token }}`. |

Removed inputs:

| Name | Reason |
| --- | --- |
| `snapshot_date` | Replaced by `calver_date` to match the new CalVer responsibility. |
| `create_if_missing` | Removed because the action's responsibility is to create the tag when the condition is met. |
| `target_sha` | Removed because the action evaluates a branch, not an arbitrary commit. |

## Outputs

Outputs are intentionally small. A normal non-creation case is represented by `created=false`; no separate skipped reason is needed because the only successful skip condition is "no changes since the previous CalVer tag."

| Name | Description |
| --- | --- |
| `tag` | CalVer tag the action attempted to create, for example `v2026.05.17`. |
| `created` | `true` when the action created the tag during this run, otherwise `false`. |
| `target_sha` | Commit SHA resolved from `target_ref`. |
| `previous_tag` | Latest existing canonical CalVer tag used for comparison, or an empty string if none exists. |
| `previous_tag_sha` | Commit SHA referenced by `previous_tag`, or an empty string if no previous tag exists. |

Removed outputs:

| Name | Reason |
| --- | --- |
| `tag_exists` | No longer needed because same-day tag conflict is an error, not a normal state. |
| `skipped_reason` | No longer needed because `created=false` has only one successful meaning: no changes. |

## Tag Creation Flow

1. Read and validate inputs.
2. Resolve `target_ref` to a commit SHA.
3. Resolve `calver_date`, or use the current UTC date when omitted.
4. Build today's canonical tag as `vYYYY.MM.DD`.
5. Find the latest existing canonical CalVer tag matching `^v\d{4}\.\d{2}\.\d{2}$`.
6. Dereference that tag to its commit SHA when it exists.
7. If the latest canonical CalVer tag SHA equals the `target_ref` SHA, set outputs and exit with `created=false`.
8. If today's canonical tag already exists and points to a different SHA, fail. This indicates a same-day second release attempt, which must be handled manually.
9. Create today's canonical lightweight tag pointing at the resolved `target_ref` SHA.
10. Set outputs with `created=true`.

## Error Handling

The action fails when:

- `github_token` is empty.
- `target_ref` is missing or cannot be resolved to a commit.
- `calver_date` is provided but is not a real date in `YYYY.MM.DD` format.
- GitHub API permissions are insufficient for lookup or tag creation.
- Today's canonical tag already exists but does not point to `target_ref` HEAD.
- A concurrent tag creation conflict cannot be reread as the expected tag.

The action does not fail when the latest canonical CalVer tag already points to `target_ref` HEAD. That is the normal no-change case.

## Recommended Workflow

Use a scheduled workflow, usually weekly, to create release-trigger tags only when the target branch has changed since the previous canonical CalVer tag.

```yaml
name: create-release-tag

on:
  schedule:
    - cron: '0 0 * * 1'
  workflow_dispatch:
    inputs:
      calver_date:
        description: Optional override in YYYY.MM.DD format for manual recovery.
        required: false
        type: string

permissions:
  contents: write

jobs:
  create-release-tag:
    runs-on: ubuntu-latest
    steps:
      - id: calver-tag
        uses: y-writings/calver-beacon-action@v1
        with:
          target_ref: main
          calver_date: ${{ inputs.calver_date }}
          github_token: ${{ github.token }}
```

Downstream release workflows should be triggered by tag creation. If the project supports manual same-day release tags, that downstream workflow can match a broader prefix pattern such as `vYYYY.MM.DD-*` in addition to the canonical automated tag format.

## Testing

Unit tests should cover:

- UTC date formatting and `calver_date` validation.
- Input parsing for `target_ref`, `calver_date`, and `github_token`.
- Resolving a branch SHA.
- Listing and selecting the latest canonical CalVer tag.
- Dereferencing lightweight and annotated tags to commit SHAs.
- Skipping creation when the latest canonical CalVer tag SHA equals the target SHA.
- Creating today's canonical tag when the target SHA differs from the latest canonical CalVer tag SHA.
- Failing when today's canonical tag already exists at a different SHA.
- Handling concurrent creation conflicts idempotently when the reread tag points to the expected SHA.

## Non-Goals

- Creating GitHub Releases.
- Building or publishing artifacts.
- Automatically creating same-day suffix tags.
- Supporting arbitrary target SHAs.
- Keeping backward compatibility with snapshot-oriented inputs and outputs.
