# Release Changelog Automation Design

## Goal

After the weekly CalVer release tag is created, generate a `CHANGELOG.md` entry for changes merged into `target_ref` between the previous release tag and the new release tag. The generated changelog update should become a pull request and then be merged automatically into `main` after validation.

## Decisions

- Do not use `pull_request_target` for changelog generation or auto-merge.
- Generate the changelog from trusted `main` workflow code and the checked-in `cliff.toml`.
- Use a GitHub App token for creating the changelog pull request and for auto-merging it.
- Split responsibilities between release-time generation and a separate auto-merge workflow.
- Keep the generated pull request limited to `CHANGELOG.md`.

## Architecture

### Release Tag Workflow

The existing `.github/workflows/release-tag.yml` remains the entry point for scheduled or manually dispatched weekly releases.

The workflow will:

- Check out `main` with full history and tags.
- Generate a GitHub App token with the minimum permissions needed for tag and pull request automation.
- Run the local CalVer beacon action with `target_ref: main` and the GitHub App token.
- If the action creates a new tag, run `git-cliff` against the range from `previous_tag` to the new `tag`.
- Write the generated content to `CHANGELOG.md`.
- Create or update a dedicated changelog pull request with `peter-evans/create-pull-request`.

When `created` is false, the workflow should only report the tag result and skip changelog generation.

### Auto-Merge Workflow

A separate workflow will merge only the changelog automation pull request.

The workflow will:

- Trigger on normal `pull_request` events for the changelog automation branch.
- Avoid `pull_request_target`.
- Verify that the pull request changes only `CHANGELOG.md`.
- Request auto-merge with the GitHub App token after validation, so repository branch protection and required checks control when the merge completes.

The auto-merge job should not check out or execute pull request code. It can use GitHub API calls or `gh pr merge` against pull request metadata.

## Data Flow

`calver-beacon-action` provides these outputs:

- `tag`: the new CalVer tag, for example `v2026.05.18`.
- `created`: whether the tag was created during the run.
- `previous_tag`: the previous canonical CalVer tag.
- `previous_tag_sha`: commit SHA referenced by the previous tag.
- `target_sha`: commit SHA referenced by `target_ref` and the new tag.

For normal releases, `git-cliff` receives:

- `config`: `cliff.toml`.
- `args`: `--verbose --tag <tag> --output CHANGELOG.md <previous_tag>..<tag>`.
- `github_token`: the GitHub App token.

The checkout must include enough history and tags for the range to resolve:

```yaml
fetch-depth: 0
fetch-tags: true
```

## First Release Handling

If `previous_tag` is empty, the workflow cannot form a `<previous_tag>..<tag>` range. In that case, generate the changelog for the new tag without a lower-bound tag. This keeps the first automated changelog usable while preserving explicit tag-range generation for later releases.

## Security Model

The primary risk to avoid is running untrusted pull request code with a privileged token.

This design avoids that risk by:

- Not using `pull_request_target`.
- Checking out `main` during changelog generation.
- Using `main`'s `cliff.toml`, not a pull request's configuration.
- Creating a changelog-only automation branch.
- Validating the changed file set before auto-merge.
- Keeping the auto-merge workflow metadata-driven and checkout-free where practical.

The GitHub App token should have only the permissions required by the workflow, expected to include `contents: write` and `pull_requests: write`.

## Error Handling

- If tag creation fails, changelog generation does not run.
- If `created` is false, changelog generation is skipped.
- If `git-cliff` cannot resolve the tag range, the workflow fails rather than creating an ambiguous changelog.
- If the changelog pull request contains files other than `CHANGELOG.md`, auto-merge fails.
- If required checks fail, GitHub auto-merge does not complete.

## Testing And Verification

Static verification should cover:

- Workflow syntax validity.
- Release workflow uses the GitHub App token for tag and PR operations.
- Changelog generation is gated by `created == 'true'`.
- `git-cliff` receives the expected tag range.
- Auto-merge workflow does not use `pull_request_target`.
- Auto-merge workflow validates that only `CHANGELOG.md` changed.

Runtime verification should cover a manual `workflow_dispatch` run in a controlled branch or repository state after GitHub App secrets are available.

## Non-Goals

- Publishing GitHub Releases.
- Generating changelogs from pull request head code.
- Auto-merging arbitrary automation pull requests.
- Changing the CalVer beacon action's tag selection semantics.
