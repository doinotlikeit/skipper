# 10 — Acceptance and milestones

Build in this order. A milestone is done only when its acceptance criteria pass.

## Milestone A — Core + file-state
Build Core's file-state layer and the sprint runner.
- [ ] `.skipper/` layout created/read/written exactly as `03` specifies.
- [ ] Event log is append-only JSONL; every state change appends an event.
- [ ] Runner enforces the three transition checks (legal edge, gate condition,
      budget) and refuses + logs illegal transitions.
- [ ] Sign-off records carry a human principal and cannot be created by any
      non-human actor.
- [ ] Unit tests cover transition guards and file read/write round-trips.

## Milestone B — CLI (headless)
Build the CLI per `05`, as a thin client of Core.
- [ ] `skipper project init`, `project status`, `roadmap add/show`,
      `sprint plan/run/status`, `task *`, `signoff *`, `inbox`, `check run`,
      `deploy`, `agent`, `adapter *` all implemented.
- [ ] `--json` and exit codes on every command; nothing blocks in non-interactive
      use.
- [ ] A full sprint runs end to end from the CLI against **stub adapters** on a
      throwaway repo, with both sign-offs exercised.

## Milestone C — Embedded runtime + real personas
Wire the conductor (Hermes) and persona (gstack) adapters; provision via install.
- [ ] `skipper init` provisions the pinned embedded runtime with zero manual
      setup of the underlying tools.
- [ ] `skipper attach <existing-repo>` runs intake and writes
      `understanding.md` before any change.
- [ ] One real feature is built end to end on a sample repo: ADR signed off,
      code written by the coder in isolation, independent verifier + tests +
      security pass, deploy signed off, canary watched.

## Milestone D — UI
Build the React + Vite UI per `06` as a pure Core client.
- [ ] Dashboard (project→sprints), kanban (per sprint, who/what), inbox
      (live messages + audit) all render from Core over the WebSocket.
- [ ] Sign-offs can be approved/rejected from the UI; recorded as human actions.
- [ ] CLI/UI parity holds: nothing the UI can do is missing from the CLI.

## Milestone E — Packaging + self-hosting
- [ ] `skipper up` container starts Core + UI + embedded runtime in one command.
- [ ] Adapters are config-selectable (`adapter use workboard jira`, etc.).
- [ ] Skipper builds the next roadmap item on **its own repo** through Skipper
      (the self-hosting loop in `09`).

## Out of scope for V1
Multi-user/hosted operation, a real database (files only), non-SDLC personas,
Aha/Jira live integrations beyond a single reference adapter each, and any
control-plane/platform features beyond what `01`–`08` specify.
