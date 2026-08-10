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

- Do not create, modify, or run automated tests unless the user explicitly requests them.
- Run the repository's relevant type checks, lint checks, build, and diff validation.
- Report what changed, what was verified, and any remaining limitation.

## Performance constraints

- Never introduce artificial delays or timer-based loading strategies. This includes using `setTimeout`, sleeps, delayed dynamic imports, idle-callback timeouts, or deferred navigation/data loading to influence perceived performance or Lighthouse results.
- Improve startup performance only by reducing work, splitting code at real feature boundaries, loading independent work asynchronously, and fixing the underlying render, network, or data bottleneck.
- If a timer is genuinely required for explicitly requested product behavior, obtain the user's explicit approval before adding it.
