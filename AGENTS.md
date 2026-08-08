# Repository agent instructions

## Core workflow

- Read the relevant code, imports, tests, and repository state before making changes.
- Preserve user changes and keep work scoped to the current request.
- Reuse established patterns and shared primitives when their semantics match.
- Keep domain logic, persistence, external integrations, and presentation clearly separated.
- Maintain one source of truth and remove code that is demonstrably replaced and unused.

## Safety

- Never expose, print, commit, or overwrite secrets.
- Do not mutate remote data, schemas, deployments, or credentials without an explicit request.
- Confirm exact targets before destructive or difficult-to-recover operations.
- Treat external input and service responses as untrusted at their boundaries.

## Quality

- Add or update focused tests for changed behavior.
- Run the repository's relevant tests, type checks, lint checks, build, and diff validation.
- Report what changed, what was verified, and any remaining limitation.
