# ncc Build Tool Design

## Goal

Replace the direct `esbuild` build dependency with `@vercel/ncc` for the GitHub Action bundle, and update existing project planning docs that still identify `esbuild` as the build tool.

## Scope

- Update `package.json` so `pnpm run build` invokes `ncc` and writes `dist/index.js`.
- Replace the direct development dependency on `esbuild` with `@vercel/ncc`.
- Refresh `pnpm-lock.yaml` through pnpm so the lockfile matches the new direct dependency set.
- Rebuild `dist/index.js`, which is the file referenced by `action.yml`.
- Update existing `docs/superpowers/plans/*.md` references from `esbuild` to `@vercel/ncc` where they describe the project build stack.

## Design

Use `ncc build src/index.ts -o dist --target es2024` in the build script after the existing clean step. The repository already exposes `dist/index.js` through `action.yml`, and ncc writes `index.js` into the specified output directory, so the action metadata does not need to change.

No runtime behavior changes are intended. Verification is the existing CI path: typecheck, tests, and build.

## Alternatives Considered

- Use `pnpm dlx @vercel/ncc` without adding a dependency. Rejected because the request asks to use ncc as a dependency.
- Leave historical docs unchanged. Rejected because the requested scope includes updating docs/plans references.
