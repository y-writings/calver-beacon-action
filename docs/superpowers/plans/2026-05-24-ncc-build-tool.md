# ncc Build Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the direct esbuild action bundle build with Vercel ncc and update stale build-tool documentation references.

**Architecture:** The GitHub Action continues to run `dist/index.js` from `action.yml`. `package.json` changes the build command to run ncc after cleaning `dist`, and pnpm updates the lockfile to reflect `@vercel/ncc` as the direct build dependency.

**Tech Stack:** TypeScript, Vitest, `@vercel/ncc`, pnpm, Node 24 GitHub Actions runtime.

---

### Task 1: Switch Build Dependency And Script

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `dist/index.js`

- [ ] **Step 1: Update package dependencies**

Run: `pnpm remove esbuild && pnpm add -D @vercel/ncc`

Expected: `package.json` no longer lists `esbuild`, `package.json` lists `@vercel/ncc`, and `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Update the build script**

Change `package.json` script `build` to:

```json
"build": "pnpm run clean && ncc build src/index.ts -o dist --target es2024"
```

- [ ] **Step 3: Rebuild the action bundle**

Run: `pnpm run build`

Expected: command succeeds and regenerates `dist/index.js`.

### Task 2: Update Build Tool Documentation References

**Files:**
- Modify: `docs/superpowers/plans/2026-05-17-calver-action-refactor.md`
- Modify: `docs/superpowers/plans/2026-05-17-calver-tag-action.md`
- Modify: `docs/superpowers/plans/2026-05-23-calver-suffix-input.md`

- [ ] **Step 1: Replace stale build tool names**

Replace `esbuild` with `@vercel/ncc` where the plan files list the project tech stack.

- [ ] **Step 2: Verify no stale direct esbuild references remain outside lockfile transitive dependencies**

Run: `rg "esbuild" package.json README.md action.yml src test docs/superpowers/plans/2026-05-17-calver-action-refactor.md docs/superpowers/plans/2026-05-17-calver-tag-action.md docs/superpowers/plans/2026-05-23-calver-suffix-input.md`

Expected: no matches. The migration plan and design files may still mention `esbuild` when describing the replacement itself.

### Task 3: Verify Full Project Health

**Files:**
- No additional file edits expected.

- [ ] **Step 1: Run CI checks**

Run: `pnpm run ci`

Expected: typecheck, tests, and ncc build all pass.

- [ ] **Step 2: Inspect changed files**

Run: `git status --short && git diff -- package.json pnpm-lock.yaml dist/index.js docs/superpowers/plans/2026-05-17-calver-action-refactor.md docs/superpowers/plans/2026-05-17-calver-tag-action.md docs/superpowers/plans/2026-05-23-calver-suffix-input.md`

Expected: only intended dependency, build output, and docs changes are present for this task.
