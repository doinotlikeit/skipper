---
id: sprint-01
goal: "Build Core and the file-state layer (INIT-1)"
roadmap_ref: INIT-1
stages:
  - name: intake
    owner: architect
    status: done
  - name: adr
    owner: architect
    status: signed_off
    gate: human_signoff
  - name: plan
    owner: architect
    status: done
  - name: build
    owner: coder
    status: done
  - name: check
    owner: reviewer
    status: done
    gate: checks_pass
  - name: ship
    owner: release
    status: signed_off
    gate: human_signoff
  - name: watch
    owner: sre
    status: done
  - name: retro
    owner: architect
    status: done
budget:
  max_tokens: 2000000
  max_cost_usd: 50
created_at: "2026-06-01T00:00:00.000Z"
---
# Sprint 01 — Build Core and the file-state layer

First buildable slice (Milestone A in spec/10). Delivers:
- `.skipper/` read/write per spec/03 (markdown + append-only JSONL event log).
- The sprint runner with the three transition guards and the sign-off invariant.
- Unit tests for guards and file round-trips.

Acceptance: see Milestone A in `spec/10-acceptance.md`.

Notes: built by hand from `spec/` for this first sprint (Skipper does not exist
yet to build itself). Subsequent sprints switch to the self-hosting loop once
Milestone C lands.
