# CLAUDE.md — build instructions for Skipper

You are building **Skipper** from the specification in `spec/`. This file tells
you how. The spec is authoritative; this file is procedure.

## Read first, in order
1. `spec/00-overview.md` — vision, principles, non-goals
2. `spec/01-architecture.md` — components and data flow
3. `spec/02-sdlc-workflow.md` — the sprint, gates, checks
4. `spec/03-state-and-storage.md` — file-based state, no database
5. `spec/04-adapters.md` — the six adapter contracts
6. `spec/05-cli.md` — the CLI surface (parity with the UI)
7. `spec/06-ui.md` — the React + Vite UI
8. `spec/07-packaging.md` — self-contained install, embedded runtime
9. `spec/08-personas.md` — the crew
10. `spec/09-bootstrap.md` — self-hosting
11. `spec/10-acceptance.md` — milestones and definition of done

## Build order
Follow the milestones in `spec/10-acceptance.md`. Do not jump ahead. Each
milestone has acceptance criteria; a milestone is done only when its criteria
pass. Build the Core and file-state first, the CLI next, adapters as stubs, then
the UI, then wire the embedded runtime. Stub every adapter (a logging fake)
before wiring a real one, so the whole loop runs end to end early.

## Conventions
- Language: TypeScript for Core, CLI, and UI. The embedded agent runtime is
  Python (Hermes); you orchestrate it, you do not rewrite it.
- Monorepo: `core/`, `cli/`, `ui/`, `adapters/`, `runtime/`. Use a workspace
  (pnpm). The CLI and UI are both thin clients of Core — no business logic in
  either; all of it lives in Core.
- State is files (see `spec/03`). Do not add a database. If you believe one is
  unavoidable, stop and update the spec with the justification first.
- Core is the only writer of project state. Every state change appends an event
  to the log. Audit completeness is a property of the design, not a feature.
- Adapters: Core depends only on adapter interfaces, never on a concrete tool.

## How to run and verify
- `skipper up` starts Core, serves the UI, and provisions the embedded runtime.
- The CLI must reach full parity with the UI minus visualization (see `spec/05`).
- Tests: unit-test the runner's transition guards and the file-state read/write;
  integration-test one full sprint against stub adapters on a throwaway repo.

## Dogfooding rule
This repo's own `.skipper/` describes building Skipper. Once a runnable Skipper
exists, prefer driving further work *through Skipper* (spec a change, plan a
sprint, let the crew implement, sign off) over editing by hand. Keep `spec/` and
the implementation in lockstep: spec changes first, code follows.
