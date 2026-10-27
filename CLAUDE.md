# CLAUDE.md

Twenty is an open-source CRM — an Nx / Yarn 4 monorepo. Main packages: `twenty-front` (React 18, Jotai, Linaria, Vite), `twenty-server` (NestJS, TypeORM, PostgreSQL, Redis, GraphQL), `twenty-shared` (isomorphic types/utils), `twenty-ui`, `twenty-sdk` (application SDK + CLI), `twenty-e2e-testing` (Playwright).

Match the surrounding code — the adjacent files in the directory you are editing beat any written rule, including for file naming, which varies by area.

## Otogrow OS delivery process

Before Otogrow OS work, read `OTOGROW-OS-ROADMAP.md` and the applicable phase plan. The user's latest instruction authorizes continuing the remaining phases without phase-by-phase approval; it supersedes the earlier sequential approval process. Record implementation status, validation, and remaining work in the tracker. For the approved 2026-10-25 critique follow-up, read and update `OTOGROW-OS-IMPROVEMENTS.md`; it tracks all 42 findings plus activity history, AI analysis and phone restrictions. Partial fixes do not count as completed items. Ask only for missing setup details or external-action authorization not already provided. The original `OTOGROW-PLAN.md` is historical CRM scope; the OS roadmap governs new OS work.

For every improvement, follow the tracker's **Mandatory business, workflow and design review** before implementation and completion. Assess the company outcome, complete workflow, affected people and adjacent systems; challenge whether the proposed change is right; compare alternatives; and choose the best practical, maintainable implementation for Otogrow. Treat UI, UX, design structure and design ideas as first-class requirements: evaluate navigation, information architecture, visual hierarchy, interactions, responsive/accessibility behavior and consistency across the OS. Inspect actual screens and complete user journeys for UI changes; passing code tests alone is insufficient. Record the decision, design rationale, tradeoffs and acceptance evidence under the item ID. Do not optimize for checking off items, cosmetic changes or needless complexity. This applies to delegated work too and does not introduce a new approval pause. Review earlier completed items against the rule before dependent work or rollout, and reopen any material gaps.

## House rules

Where this repo differs from your defaults:

- Short-form `//` comments, never JSDoc blocks; comment only WHY (a constraint the code cannot express, still true for a reader who never saw your change), never WHAT.
- Types over interfaces (except when extending third-party interfaces); string literals over enums (except GraphQL enums); no `any`; descriptive generics (`TData`, not `T`).
- Named exports only. Functional components only.
- Prefer event handlers over `useEffect` for state updates.
- No abbreviations in names (`fieldMetadata`, not `fm`); constants in SCREAMING_SNAKE_CASE; component props types suffixed `Props`.
- Use `twenty-shared/utils` guards (`isDefined`, `isNonEmptyString`, …) and other existing helpers before writing your own — reimplementing an existing util is the most common AI-authored defect here.
- Lingui for user-facing strings; Linaria (zero-runtime, styled-components pattern) for twenty-front styling.
- Test behavior, not implementation: query by user-visible text/roles, `@testing-library/user-event` for interactions.

Longer-form guides remain in `.cursor/rules/` (from the Cursor era).

## Commands

```bash
bash packages/twenty-utils/setup-dev-env.sh   # Postgres/Redis + DB init; only for tasks needing a running app
yarn start                                    # front + server + worker

npx jest path/to/file.spec.ts --config=packages/<pkg>/jest.config.mjs   # single test file (preferred)
npx nx test twenty-server                     # package unit tests (same for twenty-front, ...)
npx nx run twenty-server:test:integration:with-db-reset
npx nx storybook:build twenty-front && npx nx storybook:test twenty-front

npx nx lint:diff-with-main twenty-server      # diff-based lint (fast; add --configuration=fix); run with typecheck after changes
npx nx fmt <pkg>                              # format
npx nx build twenty-shared                    # required before building/testing packages that depend on it
npx nx database:reset twenty-server
npx nx run twenty-front:graphql:generate      # after GraphQL schema changes (--configuration=metadata for metadata schema)
```

## Gotchas

- **`twenty-shared/dist` is per-branch state nothing tracks.** After switching branches or editing `twenty-shared`, run `npx nx build twenty-shared --skip-nx-cache` before trusting any typecheck or test failure in a dependent package.
- **Nx caching can serve a stale pass.** To verify a fix, run `npx tsgo -p tsconfig.json --noEmit` in the package directly rather than `nx typecheck`.
- **Do not commit translation catalogs unless translations are the task.** `lingui extract`/`compile` regenerate `packages/twenty-server/src/engine/core-modules/i18n/locales/*.po` and `locales/generated/*` with thousands of lines of churn as a side effect of touching any `msg` string. The i18n pipeline maintains them; leave them out of your commit.
- **Commit messages must not carry AI attribution.** CI rejects commits containing `@anthropic.com` co-author trailers or "Generated with Claude Code" lines.
- **Upgrade commands** (`packages/twenty-server/src/database/commands/upgrade-version-command/`): add or edit files only under the current `TWENTY_CURRENT_VERSION` directory, with a real epoch-ms timestamp strictly greater than every existing one in that directory — CI enforces both, and the upgrade cursor silently skips a command that sorts before an already-applied one. Include `up` and `down`; never rewrite committed command logic. See `packages/twenty-server/docs/UPGRADE_COMMANDS.md`.
- **Entity file changes need a generated instance command**: `npx nx run twenty-server:database:migrate:generate --name <name> --type <fast|slow>` (slow = adds a data-backfill step).
- A read-only Postgres MCP server is configured in `.mcp.json` for inspecting workspace data, metadata, and migration results. Writes go through the CLI commands above.
- E2E login: click "Continue with Email" and use the prefilled credentials.
