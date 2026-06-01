# 05 — CLI

The CLI is a first-class interface, not an afterthought. Its purpose is headless
operation and invocation from existing toolsets (CI, scripts, other agents).

## Principles
- **Parity.** Everything doable in the UI is doable from the CLI, minus
  visualization (no rendered dashboard/kanban; status is printed instead).
- **Thin client.** The CLI calls the same Core operations the UI does. No logic
  lives in the CLI. It can run Core in-process for fully headless use, or attach
  to a running `skipper up`.
- **Composable.** Every command supports `--json` for machine output, returns
  meaningful exit codes (0 ok, non-zero on failure/refused-transition), and reads
  non-interactive flags so it never blocks in a script. Feels like the Claude
  Code / Gemini / Copilot CLIs: subcommands, quiet/JSON modes, scriptable.

## Command surface
```
skipper init                     # provision embedded runtime; first-run setup
skipper up                       # start Core + serve UI (foreground/daemon)
skipper attach <repo>            # attach to a git repo; if existing, run intake first

skipper project init             # scaffold .skipper/ in the current repo
skipper project status [--json]  # project + sprint + stage status

skipper roadmap show
skipper roadmap add "<goal>"     # define what you want done (roadmap adapter)

skipper sprint plan [--from <initiative>]   # architect plans a sprint from roadmap
skipper sprint run [--stage <name>] [--watch]  # drive sprint (or one stage), headless
skipper sprint status [--json]

skipper task list [--sprint <id>] [--json]
skipper task show <id> [--json]
skipper task move <id> <stage>

skipper signoff list [--json]    # pending sign-offs (adr, deploy)
skipper signoff approve <id> [--note "..."]
skipper signoff reject  <id> [--note "..."]

skipper inbox [--follow] [--json]   # tail the event log (messages + audit)
skipper check run <name>            # run a check adapter (tests, security)
skipper deploy                      # invoke deploy adapter (gated by sign-off)

skipper agent <role> "<task>"       # invoke a single persona ad hoc (like `claude -p`)
skipper adapter list
skipper adapter use <seam> <impl>   # e.g. skipper adapter use workboard jira
```

## Headless examples
```
# CI: plan and run a sprint, fail the job if a gate is unmet
skipper sprint plan --from INIT-3 && skipper sprint run --json || exit 1

# Another tool drives a single stage and reads structured output
skipper agent reviewer "review PR diff" --json

# Approve the pending ADR sign-off from a script
skipper signoff approve $(skipper signoff list --json | jq -r '.[0].id')
```

Interactive use (a human at a terminal) is supported too: bare `skipper` opens a
prompt that maps natural requests onto these commands, the way the coding-agent
CLIs do — but every action underneath is one of the commands above.
