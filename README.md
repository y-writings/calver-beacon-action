# calver-beacon-action

Create scheduled CalVer release-trigger tags for repositories that publish only when a target branch changed since the previous CalVer tag.

The action creates canonical tags in the form `vYYYY.MM.DD` by default. It resolves `target_ref`, compares it with the latest existing canonical CalVer tag for the configured prefix, and creates the new tag only when the target branch has changed.

## Requirements

- Grant `contents: write` so the action can inspect refs and create tags.
- Published action usage does not require `actions/checkout`.
- Local repository usage with `uses: ./` requires `actions/checkout` so the runner can load the local action files.

## Inputs

| Name | Required | Description |
| --- | --- | --- |
| `target_ref` | Yes | Branch ref to evaluate and tag, for example `main` or `refs/heads/main`. |
| `calver_date` | No | Optional date override in `YYYY.MM.DD` or `YYYY.MM.DD-[A-Za-z0-9]{1,32}` format. Defaults to the current UTC date. |
| `tag_prefix` | No | Optional tag prefix using 1 to 32 ASCII letters, digits, hyphen, or underscore. Defaults to `v`. |
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
        description: Optional YYYY.MM.DD or YYYY.MM.DD-[A-Za-z0-9]{1,32} override for manual recovery.
        required: false
        type: string

permissions:
  contents: write

jobs:
  create-calver-tag:
    runs-on: ubuntu-latest
    steps:
      - id: calver-tag
        uses: y-writings/calver-beacon-action@v1
        with:
          target_ref: main
          calver_date: ${{ inputs.calver_date }}
          github_token: ${{ github.token }}
```

## Custom Tag Prefixes

Pass `tag_prefix` to create and compare tags in a separate CalVer tag series. For example, `tag_prefix: app-` creates canonical tags like `app-2026.05.10` and compares only previous canonical tags with the same `app-` prefix.

Prefix values must be 1 to 32 ASCII letters, digits, hyphen, or underscore. If `tag_prefix` is omitted or blank, the action uses `v`.

## Same-Day Manual Tags

This action creates canonical daily tags like `v2026.05.10` by default. For an extra release on the same day, pass `calver_date` with a short alphanumeric suffix, such as `2026.05.10-handmade01`; the action will create `v2026.05.10-handmade01`.

Suffixes also combine with custom prefixes. For example, `tag_prefix: app-` and `calver_date: 2026.05.10-handmade01` create `app-2026.05.10-handmade01`.

Suffixes must be 1 to 32 ASCII alphanumeric characters. Downstream release workflows may match tag prefixes such as `v2026.05.10` when they need to handle both the canonical tag and same-day manual tags.

## Local Development

```bash
mise exec -- pnpm install
mise exec -- pnpm test
mise exec -- pnpm typecheck
mise exec -- pnpm build
```
