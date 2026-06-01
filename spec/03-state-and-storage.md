# 03 — State and storage

No database. State lives as files in the user's git repo, split by write pattern.

## Layout (`.skipper/` inside the target repo)
```
.skipper/
  config.yaml          # adapter selections, budgets, model choices
  understanding.md     # what Skipper learned about the repo (from intake)
  roadmap.md           # the roadmap (V1 roadmap adapter); "what you want done"
  sprints/
    sprint-01.md       # one file per sprint: stages, owners, status (frontmatter)
    sprint-02.md
  log.jsonl            # append-only event log = inbox + audit trail
  artifacts/           # pointers/metadata for produced artifacts (ADRs, plans)
  run.json             # ephemeral runtime state (current run, locks); gitignored
```

The built code lives in the repo itself, not under `.skipper/`. `.skipper/`
(except `run.json`) is committed alongside the code, so state is versioned with
the artifact and travels with the repo.

## Why this split
- **Markdown** for human-facing, human-editable state (roadmap, sprint plans,
  ADRs, understanding): reviews and merges like code, both you and the agents
  edit it.
- **JSONL, append-only** for the high-frequency machine log (every handoff,
  sign-off, transition): appending avoids merge conflicts and is trivial to tail
  and parse. This file is the inbox and the audit trail.
- **A small ephemeral `run.json`** for the active run and locks; not committed.

## Sprint file shape (markdown + frontmatter)
```yaml
---
id: sprint-01
goal: "<one line>"
roadmap_ref: "<initiative id or anchor in roadmap.md>"
stages:
  - name: adr      owner: architect  status: signed_off
  - name: build    owner: coder      status: in_progress  task_ref: T-3
  - name: check    owner: reviewer   status: pending
budget: { max_tokens: ..., max_cost_usd: ... }
---
# Sprint 01 — <goal>
Human-readable notes, decisions, links to ADRs.
```
The kanban view is derived entirely from `stages[].status` across sprint files.

## Event shape (`log.jsonl`, one JSON object per line)
```json
{"ts":"<iso8601>","actor":"coder|architect|...|human:<id>","sprint":"sprint-01","stage":"build","type":"handoff|artifact|message|signoff_request|signoff|transition|check","ref":"<artifact/task id>","note":"<text>"}
```
The CLI `inbox` and the UI inbox both render this. Sign-offs are events with
`type:"signoff"` and a `human:<id>` actor.

## Concurrency and the database escape hatch
File state is correct for single-user, single-machine, serialized writes through
Core. If concurrent multi-writer operation later becomes a hard requirement, the
only sanctioned change is **embedded SQLite** (a single file, not a server) for
the event log and sprint index — and this must be specced before it is built.
