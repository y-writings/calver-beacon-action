# CalVer Action Refactor Design

## Purpose

Refactor the GitHub Action implementation without changing its external behavior. The action must continue to create canonical CalVer tags in the form `vYYYY.MM.DD` when the target branch has changed since the latest canonical CalVer tag.

The refactor focuses on removing dead or duplicated code, improving responsibility boundaries, and making the code easier to read and test.

## Current Problems

- `src/github.ts` combines API transport, GitHub environment parsing, branch and tag operations, CalVer tag filtering, and conflict handling.
- Canonical CalVer tag matching exists in both `src/calver-tag.ts` and `src/github.ts`.
- `src/main.ts` contains small action-specific helpers mixed with orchestration logic.
- Tests verify behavior, but the current file boundaries make targeted testing harder as the action grows.

## Chosen Approach

Use a layered refactor. Keep the runtime flow and public action contract unchanged, but split code by responsibility:

- `src/action/inputs.ts`: read and normalize GitHub Action inputs.
- `src/action/outputs.ts`: centralize GitHub Action output names and output writing.
- `src/domain/calver.ts`: validate CalVer dates, format UTC dates, build tags, and identify canonical CalVer tags.
- `src/domain/tag-policy.ts`: pure decision logic for whether tag creation should be skipped because the target SHA already matches the latest canonical CalVer tag.
- `src/github/api.ts`: GitHub API URL construction, authenticated JSON requests, and API error formatting.
- `src/github/context.ts`: resolve `GITHUB_REPOSITORY` and `GITHUB_API_URL` into an API context.
- `src/github/refs.ts`: GitHub ref and tag operations, including target branch resolution, tag lookup, latest canonical tag lookup, and lightweight tag creation.
- `src/main.ts`: orchestrate the action flow using the layers above.
- `src/index.ts`: keep the top-level error-to-`core.setFailed` boundary.

## External Behavior To Preserve

- Inputs remain `target_ref`, `calver_date`, and `github_token`.
- Outputs remain `tag`, `created`, `target_sha`, `previous_tag`, and `previous_tag_sha`.
- `calver_date` defaults to the current UTC date when omitted.
- `target_ref` accepts branch names and `refs/heads/...` refs.
- The latest previous tag is the lexicographically latest canonical tag matching `^v\d{4}\.\d{2}\.\d{2}$`.
- Non-canonical same-day manual tags, such as `v2026.05.10-handmade-01`, are ignored by the automated latest-tag search.
- If the latest canonical tag already points to the target SHA, the action sets outputs and exits with `created=false`.
- If today's canonical tag already exists at a different SHA, the action fails with the existing same-day manual tag guidance.
- Create conflicts remain idempotent when the remote tag can be reread and points to the expected SHA.
- Existing permission and validation failures keep clear error messages.

## Testing Strategy

Keep the existing behavior tests and adjust imports to the new file layout. Add or retain focused tests for:

- CalVer formatting, validation, tag building, and canonical tag detection.
- Input normalization for empty optional values.
- Output writing through the action output boundary.
- Pure tag policy decisions.
- GitHub context parsing.
- API ref operations, including 404, 403, annotated tag dereference, latest canonical tag selection, and creation conflict handling.
- End-to-end orchestration with GitHub operations mocked at the ref boundary.

Verification commands:

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

## Non-Goals

- Changing the action's public inputs, outputs, or tag creation policy.
- Adding support for arbitrary target SHAs.
- Automatically creating suffixed same-day tags.
- Replacing the GitHub REST API implementation with another client library.
- Changing `action.yml`, README usage, or downstream workflow behavior except where documentation needs to reflect unchanged structure.
