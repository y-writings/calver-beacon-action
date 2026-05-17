# snapshot-tag-action

Create scheduled CalVer release-trigger tags for repositories that publish only when a target branch changed since the previous CalVer tag.

The action creates canonical tags in the form `vYYYY.MM.DD`. It resolves `target_ref`, compares it with the latest existing canonical CalVer tag, and creates the new tag only when the target branch has changed.

## Requirements

- Grant `contents: write` so the action can inspect refs and create tags.
- Published action usage does not require `actions/checkout`.
- Local repository usage with `uses: ./` requires `actions/checkout` so the runner can load the local action files.

## Inputs

| Name | Required | Description |
| --- | --- | --- |
| `target_ref` | Yes | Branch ref to evaluate and tag, for example `main` or `refs/heads/main`. |
| `calver_date` | No | Optional date override in `YYYY.MM.DD` format. Defaults to the current UTC date. |
| `github_token` | No | GitHub token used for remote ref lookup and tag creation. Defaults to `${{ github.token }}`. |

## Outputs

| Name | Description |
| --- | --- |
| `tag` | CalVer tag the action attempted to create. |
| `created` | Whether this action created the tag during this run. |
| `target_sha` | Commit SHA resolved from `target_ref`. |
| `previous_tag` | Latest existing canonical CalVer tag used for comparison, if any. |
| `previous_tag_sha` | Commit SHA referenced by `previous_tag`, if any. |

## Weekly Schedule Example

```yaml
name: weekly-calver-tag

on:
  schedule:
    - cron: '0 0 * * 1'
  workflow_dispatch:
    inputs:
      calver_date:
        description: Optional YYYY.MM.DD override for manual recovery.
        required: false
        type: string

permissions:
  contents: write

jobs:
  create-calver-tag:
    runs-on: ubuntu-latest
    steps:
      - id: calver-tag
        uses: y-writings/snapshot-tag-action@v1
        with:
          target_ref: main
          calver_date: ${{ inputs.calver_date }}
          github_token: ${{ github.token }}
```

## Same-Day Manual Tags

This action only creates canonical daily tags like `v2026.05.10`. For an extra release on the same day, create a manual tag with a unique suffix, such as `v2026.05.10-handmade-01`.

Downstream release workflows may match tag prefixes such as `v2026.05.10` when they need to handle both the canonical tag and same-day manual tags.

## Local Development

```bash
mise exec -- pnpm install
mise exec -- pnpm test
mise exec -- pnpm typecheck
mise exec -- pnpm build
```
