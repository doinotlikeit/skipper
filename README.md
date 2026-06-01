# Skipper

> A self-contained agent that runs your whole SDLC. One install, a small crew of
> role personas, a declared sprint with human sign-offs, and all state kept as
> files in your git repo.

This repository is **spec-first**. The `spec/` directory is the source of truth;
the implementation is generated and maintained *from* it by a coding agent.
Skipper is meant to be written and maintained by Skipper.

## What Skipper is

One install you point at a git repo. You define what you want done, and a single
lead agent drives an SDLC sprint with a crew of personas (architect, coder,
reviewer, QA, security, release), pausing for your sign-off at the two moments
that matter: approving the ADR, and authorizing deploy. Everything else runs on
its own. It works headless from a CLI or with a React UI.

It draws ideas from three projects without depending on their products:
- **Hermes** — the personal-agent / conductor model (embedded as the default runtime).
- **gstack** — the sprint methodology and role-persona skills (embedded).
- **Paperclip** — the org/inbox/governance concepts (rebuilt lean, no platform).

## How a coding agent should use this repo

1. Read `CLAUDE.md` (build instructions and conventions).
2. Read `spec/` in numeric order. It is complete and authoritative.
3. Build in the milestone order defined in `spec/10-acceptance.md`.
4. Treat the spec as the contract. If behavior and spec disagree, the spec wins —
   change the spec first, then the code.

## Self-hosting

Once Skipper builds, run Skipper on this repo. `.skipper/roadmap.md` is Skipper's
own roadmap; `.skipper/sprints/` holds its sprints. New features are specced,
planned into a sprint, built by the crew, signed off, and shipped — by Skipper.

## Layout

```
spec/            the authoritative specification (read in order)
.skipper/        Skipper's own project state (roadmap, sprints) — dogfooding
CLAUDE.md        instructions for the coding agent building Skipper
AGENTS.md        agent-agnostic pointer to CLAUDE.md
```

License: MIT (intended). Status: pre-implementation spec.
