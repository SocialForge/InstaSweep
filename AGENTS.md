# AGENTS

## Repo Rules

- Keep both delivery modes working: the hosted copy/paste script and the Chromium extension.
- Treat `src/` as the source of truth. `public/dist.js` and `public/background.js` are generated build outputs, should not be committed, and should be produced locally when needed or in CI for Pages/releases.
- Use Rspack for bundling. Do not reintroduce Webpack unless there is an explicit, justified need.
- Use Oxlint for linting and Oxfmt for formatting. Do not add ESLint or Prettier back without a clear migration decision.
- SCSS should use `@use`, not deprecated `@import`.
- Preserve the existing Preact setup unless the change is an intentional framework migration.
- Keep `package.json` and `public/manifest.json` versions aligned when preparing releases.
- Validate code changes with `npm run format:check`, `npm run lint`, `npm run typecheck`, and `npm run build`.
- Keep commits scoped to one responsibility. Prefer multiple standalone commits over a single mixed commit.
- Firefox extension support is still a planning item. Do not implement it implicitly while touching Chrome extension code.
