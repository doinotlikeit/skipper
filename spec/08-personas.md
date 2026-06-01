# 08 — Personas (the crew)

Each persona is thin config, not a service: a prompt, a skill, a model choice,
and a workspace. The default skills come from the embedded gstack install; you do
not author the prompts.

| Role      | Default skill (gstack) | Stage(s)    | Notes                                   |
| --------- | ---------------------- | ----------- | --------------------------------------- |
| Architect | office-hours + eng review | intake, adr, plan, retro | frames intent, authors ADR, plans tasks |
| Coder     | base coding agent + spec  | build       | shells to Claude Code / OpenCode in an isolated worktree |
| Reviewer  | review                 | check       | finds production bugs                   |
| Verifier  | codex (independent)    | check       | cross-model review; **must differ from Coder** |
| QA        | qa                     | check       | runs tests, fixes, adds regressions     |
| Security  | cso                    | check       | OWASP + STRIDE                          |
| Release   | ship + land-and-deploy | ship        | prepares deploy, opens PR               |
| SRE       | canary                 | watch       | post-deploy health, rollback            |

## Rules
- **Agent backend.** Personas run on a resolved backend (see `04` — Agent
  backend resolution): the local Claude Code CLI by default, the embedded
  Anthropic SDK if only an API key is present, the stub otherwise. The backend
  is invisible above the persona contract — worktree isolation, budgets, and the
  typed input/output hold regardless of which backend runs.
- **Verification independence.** The Verifier persona uses a different model than
  the Coder. The `check` gate must not be satisfied by the same persona that
  produced the code. This is the guard that makes a green check meaningful.
- **Isolation.** Each persona runs in its own workspace (git worktree or
  container). The coder's internal token churn is invisible to the conductor;
  the conductor sees only the contract result (artifact ref, exit status, logs
  ref).
- **Budgets.** Each persona/stage carries a token and cost budget; exhaustion
  escalates to the human (see `02`).
- **Contract.** Every persona invocation has a narrow contract: typed input
  (task + context), a defined output artifact, and an exit status. Nesting is
  bounded; no open-ended self-direction.

## Scope
The default crew is SDLC-only. Design-exploration, browser-automation, mobile-
device, and personal-automation skills from gstack are out of scope for the
default install (can be added as extra personas later).
