# Release Changelog Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a tag-range `CHANGELOG.md` pull request after weekly CalVer tag creation and auto-merge only that changelog PR without using `pull_request_target`.

**Architecture:** Move changelog generation into `.github/workflows/release-tag.yml` so it can consume the CalVer beacon action's `tag`, `previous_tag`, and `created` outputs directly. Add a separate checkout-free `.github/workflows/auto-merge-changelog.yml` workflow that validates the PR file set and enables GitHub auto-merge with a GitHub App token. Remove the old standalone workflow-run changelog workflow to avoid duplicate PR creation.

**Tech Stack:** GitHub Actions YAML, `actions/create-github-app-token`, `orhun/git-cliff-action`, `peter-evans/create-pull-request`, GitHub CLI.

---

## File Structure

- Modify `.github/workflows/release-tag.yml`: issue a GitHub App token, create the CalVer tag, generate `CHANGELOG.md` for the previous-tag-to-current-tag range, and open the changelog PR.
- Create `.github/workflows/auto-merge-changelog.yml`: validate changelog automation PRs and enable auto-merge without checking out PR code.
- Delete `.github/workflows/changelog.yml`: remove the old workflow-run changelog generator so release-tag owns changelog PR creation.
- Modify `docs/superpowers/specs/2026-05-18-release-changelog-automation-design.md`: no implementation changes are needed; keep it as the approved design record.

The workflows will require this repository variable and secret:

- `RELEASE_PLEASE_APP_ID`: GitHub App ID repository variable.
- `RELEASE_PLEASE_APP_PRIVATE_KEY`: GitHub App private key repository secret.

The GitHub App installation must be granted `contents: write` and `pull_requests: write` for this repository.

### Task 1: Update Release Workflow To Generate Changelog PR

**Files:**
- Modify: `.github/workflows/release-tag.yml`
- Delete: `.github/workflows/changelog.yml`

- [ ] **Step 1: Replace `.github/workflows/release-tag.yml` with the release-and-changelog workflow**

```yaml
name: weekly-calver-tag

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
  contents: read

concurrency:
  group: weekly-calver-tag-main
  cancel-in-progress: false

jobs:
  create-calver-tag:
    name: Create weekly CalVer tag and changelog PR
    runs-on: ubuntu-latest
    steps:
      - name: Validate GitHub App configuration
        env:
          APP_ID: ${{ vars.RELEASE_PLEASE_APP_ID }}
          PRIVATE_KEY: ${{ secrets.RELEASE_PLEASE_APP_PRIVATE_KEY }}
        run: |
          if [ -z "${APP_ID}" ]; then
            echo "Missing repository variable RELEASE_PLEASE_APP_ID" >&2
            exit 1
          fi

          if [ -z "${PRIVATE_KEY}" ]; then
            echo "Missing repository secret RELEASE_PLEASE_APP_PRIVATE_KEY" >&2
            exit 1
          fi

      - name: Create GitHub App token
        id: app-token
        uses: actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349 # v2
        with:
          app-id: ${{ vars.RELEASE_PLEASE_APP_ID }}
          private-key: ${{ secrets.RELEASE_PLEASE_APP_PRIVATE_KEY }}

      - name: Check out repository for local action and changelog generation
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          ref: main
          fetch-depth: 0
          fetch-tags: true
          token: ${{ steps.app-token.outputs.token }}

      - name: Create weekly CalVer tag through GitHub API
        id: calver-tag
        uses: ./
        with:
          calver_date: ${{ inputs.calver_date }}
          target_ref: main
          github_token: ${{ steps.app-token.outputs.token }}

      - name: Report CalVer tag result
        env:
          TAG: ${{ steps.calver-tag.outputs.tag }}
          CREATED: ${{ steps.calver-tag.outputs.created }}
          TARGET_SHA: ${{ steps.calver-tag.outputs.target_sha }}
          PREVIOUS_TAG: ${{ steps.calver-tag.outputs.previous_tag }}
          PREVIOUS_TAG_SHA: ${{ steps.calver-tag.outputs.previous_tag_sha }}
        run: echo "CalVer tag ${TAG} created=${CREATED} target_sha=${TARGET_SHA} previous_tag=${PREVIOUS_TAG} previous_tag_sha=${PREVIOUS_TAG_SHA}"

      - name: Resolve git-cliff range
        id: cliff-range
        if: ${{ steps.calver-tag.outputs.created == 'true' }}
        env:
          TAG: ${{ steps.calver-tag.outputs.tag }}
          PREVIOUS_TAG: ${{ steps.calver-tag.outputs.previous_tag }}
        run: |
          if [ -n "${PREVIOUS_TAG}" ]; then
            echo "range=${PREVIOUS_TAG}..${TAG}" >> "${GITHUB_OUTPUT}"
          else
            echo "range=${TAG}" >> "${GITHUB_OUTPUT}"
          fi

      - name: Generate CHANGELOG.md from release tag range
        if: ${{ steps.calver-tag.outputs.created == 'true' }}
        uses: orhun/git-cliff-action@c93ef52f3d0ddcdcc9bd5447d98d458a11cd4f72 # v4.7.1
        with:
          config: cliff.toml
          args: --verbose --tag ${{ steps.calver-tag.outputs.tag }} --output CHANGELOG.md ${{ steps.cliff-range.outputs.range }}
          github_token: ${{ steps.app-token.outputs.token }}

      - name: Create or update changelog pull request
        if: ${{ steps.calver-tag.outputs.created == 'true' }}
        uses: peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1 # v8
        with:
          token: ${{ steps.app-token.outputs.token }}
          add-paths: |
            CHANGELOG.md
          author: github-actions[bot] <github-actions[bot]@users.noreply.github.com>
          committer: github-actions[bot] <github-actions[bot]@users.noreply.github.com>
          branch: automation/update-changelog
          base: main
          commit-message: "docs(changelog): update changelog"
          delete-branch: true
          title: "docs(changelog): update changelog"
          body: |
            ## Summary
            - regenerate `CHANGELOG.md` from `${{ steps.cliff-range.outputs.range }}`
            - generated after `${{ steps.calver-tag.outputs.tag }}` was created on `main`
            - auto-merge is handled by the changelog auto-merge workflow after validation
```

- [ ] **Step 2: Delete the old workflow-run changelog workflow**

Remove `.github/workflows/changelog.yml` entirely. The release workflow now creates the changelog PR, and keeping the old workflow would create duplicate or conflicting changelog PRs.

- [ ] **Step 3: Verify workflow YAML parses locally**

Run:

```bash
ruby -e 'require "yaml"; Dir[".github/workflows/*.{yml,yaml}"].each { |path| YAML.load_file(path); puts "ok #{path}" }'
```

Expected: every remaining workflow prints `ok <path>`, including `.github/workflows/release-tag.yml`, and the command exits with status 0.

- [ ] **Step 4: Verify the old changelog workflow is gone**

Run:

```bash
test ! -e .github/workflows/changelog.yml
```

Expected: command exits with status 0.

- [ ] **Step 5: Commit Task 1 changes**

```bash
git add .github/workflows/release-tag.yml .github/workflows/changelog.yml
git commit -m "ci: generate changelog after release tag"
```

### Task 2: Add Checkout-Free Changelog Auto-Merge Workflow

**Files:**
- Create: `.github/workflows/auto-merge-changelog.yml`

- [ ] **Step 1: Create `.github/workflows/auto-merge-changelog.yml`**

```yaml
name: auto-merge-changelog

on:
  pull_request:
    branches:
      - main
    types:
      - opened
      - synchronize
      - reopened
      - ready_for_review

permissions:
  contents: read
  pull-requests: read

concurrency:
  group: auto-merge-changelog-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  enable-auto-merge:
    name: Validate changelog PR and enable auto-merge
    if: >-
      ${{
        github.event.pull_request.head.repo.full_name == github.repository &&
        github.event.pull_request.head.ref == 'automation/update-changelog'
      }}
    runs-on: ubuntu-latest
    steps:
      - name: Validate GitHub App configuration
        env:
          APP_ID: ${{ vars.RELEASE_PLEASE_APP_ID }}
          PRIVATE_KEY: ${{ secrets.RELEASE_PLEASE_APP_PRIVATE_KEY }}
        run: |
          if [ -z "${APP_ID}" ]; then
            echo "Missing repository variable RELEASE_PLEASE_APP_ID" >&2
            exit 1
          fi

          if [ -z "${PRIVATE_KEY}" ]; then
            echo "Missing repository secret RELEASE_PLEASE_APP_PRIVATE_KEY" >&2
            exit 1
          fi

      - name: Create GitHub App token
        id: app-token
        uses: actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349 # v2
        with:
          app-id: ${{ vars.RELEASE_PLEASE_APP_ID }}
          private-key: ${{ secrets.RELEASE_PLEASE_APP_PRIVATE_KEY }}

      - name: Verify pull request changes only CHANGELOG.md
        env:
          GH_TOKEN: ${{ steps.app-token.outputs.token }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          REPOSITORY: ${{ github.repository }}
        run: |
          files="$(gh pr view "${PR_NUMBER}" --repo "${REPOSITORY}" --json files --jq '.files[].path')"
          printf '%s\n' "${files}"

          if [ "${files}" != "CHANGELOG.md" ]; then
            echo "Refusing to auto-merge because the PR changes files other than CHANGELOG.md" >&2
            exit 1
          fi

      - name: Enable auto-merge
        env:
          GH_TOKEN: ${{ steps.app-token.outputs.token }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          REPOSITORY: ${{ github.repository }}
        run: gh pr merge "${PR_NUMBER}" --repo "${REPOSITORY}" --squash --auto --delete-branch
```

- [ ] **Step 2: Verify the auto-merge workflow does not use checkout or pull_request_target**

Run:

```bash
! grep -Eq 'pull_request_target|actions/checkout' .github/workflows/auto-merge-changelog.yml
```

Expected: command exits with status 0.

- [ ] **Step 3: Verify workflow YAML parses locally**

Run:

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/auto-merge-changelog.yml"); puts "ok .github/workflows/auto-merge-changelog.yml"'
```

Expected: command prints `ok .github/workflows/auto-merge-changelog.yml` and exits with status 0.

- [ ] **Step 4: Commit Task 2 changes**

```bash
git add .github/workflows/auto-merge-changelog.yml
git commit -m "ci: auto-merge changelog updates"
```

### Task 3: Final Verification

**Files:**
- Verify: `.github/workflows/release-tag.yml`
- Verify: `.github/workflows/auto-merge-changelog.yml`

- [ ] **Step 1: Verify changelog automation workflows do not use `pull_request_target`**

Run:

```bash
! grep -H "pull_request_target" .github/workflows/release-tag.yml .github/workflows/auto-merge-changelog.yml
```

Expected: command exits with status 0.

- [ ] **Step 2: Verify release workflow uses the GitHub App token for tag and PR operations**

Run:

```bash
grep -q 'github_token: ${{ steps.app-token.outputs.token }}' .github/workflows/release-tag.yml && grep -q 'token: ${{ steps.app-token.outputs.token }}' .github/workflows/release-tag.yml
```

Expected: command exits with status 0.

- [ ] **Step 3: Verify changelog generation is gated by tag creation**

Run:

```bash
grep -q "steps.calver-tag.outputs.created == 'true'" .github/workflows/release-tag.yml
```

Expected: command exits with status 0.

- [ ] **Step 4: Verify git-cliff receives the tag range output**

Run:

```bash
grep -q 'steps.cliff-range.outputs.range' .github/workflows/release-tag.yml
```

Expected: command exits with status 0.

- [ ] **Step 5: Verify the auto-merge workflow validates the changed file set**

Run:

```bash
grep -q 'files}" != "CHANGELOG.md"' .github/workflows/auto-merge-changelog.yml
```

Expected: command exits with status 0.

- [ ] **Step 6: Verify package tests still pass**

Run:

```bash
pnpm test
```

Expected: Vitest exits with status 0.

- [ ] **Step 7: Verify TypeScript still typechecks**

Run:

```bash
pnpm typecheck
```

Expected: TypeScript exits with status 0.

- [ ] **Step 8: Commit final verification fixes if any were required**

If the verification steps required edits, commit them:

```bash
git add .github/workflows/release-tag.yml .github/workflows/auto-merge-changelog.yml
git commit -m "ci: harden changelog automation"
```

If no files changed after verification, do not create an empty commit.

## Self-Review

- Spec coverage: Task 1 implements release-time changelog generation from the tag action outputs and removes the old workflow-run generator. Task 2 implements the separate normal `pull_request` auto-merge workflow. Task 3 verifies the changelog automation does not use `pull_request_target`, GitHub App token usage, tag creation gating, tag-range wiring, file-set validation, and baseline package health.
- Placeholder scan: The plan contains concrete file paths, complete workflow content, exact commands, and expected results. It contains no unresolved placeholders.
- Type and name consistency: Workflow IDs are `app-token`, `calver-tag`, and `cliff-range`; later expressions reference those exact IDs. The automation branch is consistently `automation/update-changelog`. The GitHub App config names are consistently `RELEASE_PLEASE_APP_ID` and `RELEASE_PLEASE_APP_PRIVATE_KEY`.
