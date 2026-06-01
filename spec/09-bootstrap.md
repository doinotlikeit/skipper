# 09 — Bootstrap and self-hosting

Skipper is written and maintained by Skipper.

## Spec-driven development
`spec/` is the source of truth. The implementation is generated from it and kept
in lockstep. The flow for any change — including the first build:
1. Update or add the relevant `spec/` document. The spec changes first.
2. Capture the intent in this repo's own `.skipper/roadmap.md`.
3. Plan it into a sprint (`.skipper/sprints/`).
4. The crew implements against the spec; the runner enforces the gates.
5. Human signs off the ADR and the deploy.
6. Ship. The spec and the code stay in agreement.

## The self-hosting loop
This repository *is* a Skipper project: it has `.skipper/roadmap.md` and
`.skipper/sprints/`. Before Skipper can run itself, a coding agent builds V1 by
hand from `spec/` following `CLAUDE.md`. The moment a runnable Skipper exists
(Milestone C in `10-acceptance.md`), switch the build of further milestones to
run *through* Skipper:
```
skipper attach .            # attach Skipper to its own repo
skipper sprint plan         # plan the next milestone from roadmap.md
skipper sprint run          # the crew implements; you sign off the ADR and deploy
```
From then on, new features are specced, planned, built, reviewed, and shipped by
Skipper, on Skipper. Hand-editing remains allowed but the preferred path is to
drive changes through the product.

## Why this matters
The dogfooding loop is the strongest acceptance test: if Skipper can ship a
real feature to its own codebase, end to end, with the gates and sign-offs
working, the product works.
