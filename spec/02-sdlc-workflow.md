# 02 — SDLC workflow

## The sprint
A sprint is an ordered sequence of stages. The default definition:

| Stage  | Owner persona      | Produces                          | Gate to leave              |
| ------ | ------------------ | --------------------------------- | -------------------------- |
| intake | Architect/Analyst  | understanding + framed goal       | auto (artifact recorded)   |
| adr    | Architect          | ADR with acceptance criteria      | **human sign-off**         |
| plan   | Architect          | task graph (each task ↔ criterion)| auto (valid graph)         |
| build  | Coder              | code diff in isolated workspace   | auto (build succeeds)      |
| check  | Reviewer/QA/Security| review + tests + scan results    | **checks pass, else escalate** |
| ship   | Release            | deploy plan + canary config       | **human sign-off (deploy)**|
| watch  | SRE                | post-deploy health               | auto (canary ok, else roll back) |
| retro  | Architect          | learnings appended to memory      | auto                       |

Two human sign-offs (adr, ship). Two automated checks (the `check` stage's
tests and security scan). Everything else advances on its own.

## The runner
Core's sprint runner is the only component that advances stage state. For each
proposed transition it checks, in order:
1. the transition is legal from the current stage;
2. the leaving gate condition holds — required artifact recorded, or check
   passed, or a valid human sign-off exists;
3. budget for the stage is not exhausted.
If any check fails the transition is refused and the reason is logged. On a
failed check past the retry limit, or an exhausted budget, the runner moves the
stage to `escalated` and raises a sign-off/decision request to the human.

The sprint definition is data (see `03` for the file shape). The lead agent
*follows* it; it cannot redefine the order or skip a gate, because only the
runner advances state and the runner enforces the gates.

## The build artifact lifecycle
The work product — the actual code — flows through `build → check → ship` on an
isolated branch that Core owns. This is what makes a green sprint mean a real,
landed change rather than a recorded summary.

- **One worktree per sprint.** When the sprint first reaches `build`, Core
  creates a git worktree at `.skipper/worktrees/<sprintId>` on a branch
  `skipper/<sprintId>`, branched from the current `main`. Its path and branch are
  recorded in `run.json` (ephemeral state). Core — not the persona — owns this
  lifecycle, so the branch survives across stages and process restarts.
- **The coder works in the worktree.** The build persona runs in the sprint
  worktree (its `Workspace.worktreePath`); it does not create or delete worktrees
  of its own. After the build stage's work returns successfully, Core commits all
  changes in the worktree (`git add -A && git commit`). An empty diff is allowed
  (nothing to commit) but logged.
- **Checks validate the branch.** The `check` stage runs against the sprint
  worktree, so tests and the security scan exercise the coder's changes — not
  `main`.
- **Ship lands the change.** After the deploy sign-off, `skipper deploy` merges
  `skipper/<sprintId>` into `main` (a no-ff merge in the repo root), then invokes
  the deploy adapter. The change is now in the repository.
- **Cleanup.** On sprint completion Core removes the worktree. The branch is
  deleted once merged.

Everything Core does to the worktree is appended to the event log, so the audit
trail covers the code's journey, not just the stage transitions.

## Gates and sign-offs
- A **check** gate passes when its check adapter returns success (e.g. tests
  green, scan clean). Verification independence matters: the persona that
  reviews/verifies must differ from the persona that wrote the code (use the
  independent cross-model reviewer, see `08-personas.md`).
- A **sign-off** gate passes only when Core holds a recorded human approval for
  that stage of that sprint: an actor (human principal), a timestamp, and an
  optional note. Agents cannot create one. The runner re-reads it; a hallucinated
  "approved" in agent output has no effect.

## Audit
Because every transition, message, artifact reference, and sign-off is appended
to the event log by Core, the log is a complete, ordered audit trail. The inbox
is a view of it; git history of `.skipper/` is a second, independent trail.
