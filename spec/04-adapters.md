# 04 — Adapters

Core depends only on these interfaces. V1 ships a default implementation for each
(markdown/local/embedded). Concrete tools (Aha, Jira, a specific coder) are
drop-in implementations and never referenced by Core directly.

Signatures are illustrative TypeScript; keep them small and stable.

## 1. Roadmap (what to build, at the top level)
```ts
interface Roadmap {
  listInitiatives(): Promise<Initiative[]>;
  addInitiative(text: string): Promise<Initiative>;
  link(sprintId: string, initiativeId: string): Promise<void>;
}
```
- V1: `markdown` — reads/writes `.skipper/roadmap.md`.
- Drop-in: `aha`.

## 2. WorkBoard (sprint-level activity / tasks)
```ts
interface WorkBoard {
  createSprint(goal: string, roadmapRef?: string): Promise<Sprint>;
  listTasks(sprintId: string): Promise<Task[]>;
  moveTask(taskId: string, toStage: Stage): Promise<void>;
  setStatus(taskId: string, status: Status): Promise<void>;
  comment(taskId: string, actor: string, text: string): Promise<void>;
}
```
- V1: `markdown` — reads/writes `.skipper/sprints/*.md`.
- Drop-in: `jira`, `linear`, `github-projects`.

## 3. Conductor (the lead agent runtime)
```ts
interface Conductor {
  drive(sprint: Sprint, ctx: ProjectContext): AsyncIterable<RunEvent>;
  ask(human: SignoffRequest | Question): Promise<void>; // routes to inbox/chat
}
```
- V1: `hermes` — the embedded lead agent (memory, chat gateway).
- Drop-in: any agent that can call Core operations.

## 4. Persona (a crew role doing a stage's work)
```ts
interface Persona {
  role: "architect"|"coder"|"reviewer"|"qa"|"security"|"release"|"sre";
  run(task: StageTask, workspace: Workspace): Promise<StageResult>;
}
```
- V1: `gstack` skill + model + isolated workspace; the coder shells out to an
  external coding agent (Claude Code / OpenCode) in a git worktree.
- Drop-in: any role implementation.

## 5. Check (automated gate evidence)
```ts
interface Check { name: string; run(workspace: Workspace): Promise<CheckResult>; }
```
- V1: `tests` (project test runner), `security` (scanner). 
- Drop-in: coverage, lint, custom gates.

## 6. Deploy (release execution)
```ts
interface Deploy { plan(workspace: Workspace): Promise<DeployPlan>;
                   execute(plan: DeployPlan): Promise<DeployResult>; }
```
- V1: `ci` — hand to the repo's CI/CD with canary + rollback hooks.
- Drop-in: platform-specific deployers.

## Agent backend resolution
The `conductor` and `persona` adapters both need an underlying agent runtime to
do real work. V1 supports two, resolved in this order:

1. **`claude-code` (default).** Shell out to the locally-installed Claude Code
   CLI, run inside the persona's git worktree. Selected when the `claude` binary
   is found on `PATH`. This reuses the user's existing coding agent — no API key
   handling in Skipper.
2. **`api` (fallback).** If the CLI is not installed but `ANTHROPIC_API_KEY` is
   set, use the embedded Anthropic SDK adapter (model per `config.yaml`).
3. **`stub` (last resort).** If neither is available, fall back to the logging
   stub: the sprint loop, gates, and sign-offs still run, but `build` produces a
   placeholder artifact rather than a real diff. Core logs a warning so this is
   never silent.

The resolution is the default; `config.yaml` may pin a backend explicitly:
```yaml
backend: claude-code   # or: api | stub  — forces one, skipping detection
```
Backend selection is a property of the conductor/persona *implementation*, not of
Core. Core only ever sees the adapter interfaces (§3, §4) and the contract result
(artifact ref, exit status, logs ref) — never the binary or the API.

## Rule
Adding support for a tool is one adapter implementation plus a `config.yaml`
entry (`roadmap: aha`, `workboard: jira`). No change to Core.
