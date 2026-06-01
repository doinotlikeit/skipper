# 01 — Architecture

## Components
- **Core** — the heart. Holds the sprint runner (state machine), the file-state
  reader/writer, the event log, and an API (HTTP + WebSocket). Core is the only
  writer of project state. Both the CLI and the UI are clients of Core.
- **CLI** — a thin client over Core. Full parity with the UI minus visualization.
  Runs headless; composable from other toolsets. See `05-cli.md`.
- **UI** — React + Vite. Dashboard, kanban, inbox. A pure client of Core over the
  API/WebSocket; contains no business logic. See `06-ui.md`.
- **Embedded runtime** — the default lead agent (Hermes) and crew skills (gstack),
  provisioned by the install, hidden behind the conductor and persona adapters.
- **Adapters** — the six seams Core depends on: conductor, persona, check, deploy,
  roadmap, work-board. See `04-adapters.md`.
- **The git repo** — the persistence target. Skipper writes its state under
  `.skipper/` and the built artifact (code) into the repo itself.

## Data flow (one loop)
1. You define intent — via CLI (`skipper roadmap add`) or UI — which writes the
   roadmap (markdown, V1).
2. Core's runner dissects intent into a sprint of ordered stages and writes the
   sprint file; it appends a `sprint.created` event to the log.
3. The lead agent (via the conductor adapter) pulls the next stage and works it,
   but Core only advances when the stage's gate condition is met (a passing
   check, or a recorded human sign-off).
4. The lead agent delegates the stage to the right persona (via the persona
   adapter); the persona works in an isolated workspace.
5. Every handoff, artifact reference, sign-off, and transition is appended to the
   event log as it happens. Nothing bypasses Core.
6. Core pushes changes over the WebSocket; the UI re-renders live and the CLI
   `inbox --follow` tails the same stream.

## Key invariants
- **Single writer.** Only Core mutates project state; agents request changes
  through Core operations (advance, record-artifact, request-sign-off, post-
  message, run-check). This is what makes the audit trail complete by
  construction.
- **Sign-offs are not self-issuable.** A sign-off is a human action recorded by
  Core. No agent has an operation that mints one. The runner will not advance a
  gated stage without a recorded sign-off from a human principal.
- **Core ⇄ adapters only.** Core never imports a concrete tool. Swapping Hermes,
  Jira, or a coder is an adapter change, not a Core change.
