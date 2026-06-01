# 00 — Overview

## What Skipper is
Skipper is one installable that runs a full software development lifecycle for a
project you point it at. You describe what you want, point it at a git repo, and
a single lead agent drives a sprint with a small crew of role personas — pausing
for your sign-off only at the two decisions that matter. It runs headless from a
CLI or with a React UI. It is a framework: usable for any SDLC effort, with the
work-management and roadmap tooling pluggable.

## The mental model
A one-person engineering studio run by one lead agent. You are the board. You
talk to one agent, hand it the brief and the repo, and it runs the sprint with
the crew, reporting status and asking for sign-off at the gates.

## Inspiration (concepts, not dependencies-as-products)
- **Hermes** → the personal coding-agent / conductor with memory. Embedded as the
  default agent runtime, behind an adapter so it can be swapped.
- **gstack** → the sprint methodology (think → plan → build → review → test → ship)
  and the role-persona skills, including an independent cross-model review.
  Embedded as the default persona skills.
- **Paperclip** → the org/role, inbox, sign-off/governance, budget, and audit
  concepts. Rebuilt lean as part of Core; no separate platform.

## Principles
1. **Lean.** No separate control-plane product, no service-per-persona, no
   heavyweight workflow engine, no multi-company org. If you find yourself
   standing up a second server to coordinate the first, you have left the lean
   version.
2. **Self-contained.** One install brings everything (UI, Core, embedded runtime,
   default skills). The user never installs or configures the runtime separately.
3. **File-based state.** State lives as files in the user's git repo. No database
   unless concurrency makes it absolutely necessary (and then: embedded SQLite,
   one file, not a server).
4. **The script is the enforcement.** The sprint is a declared definition the
   lead agent *follows*; Core's runner is the only thing that advances state, and
   it refuses transitions whose gate conditions are unmet. Determinism lives in
   Core, never in the LLM's discretion.
5. **CLI/UI parity.** Everything doable in the UI is doable from the CLI (minus
   visualization). The CLI is the headless, composable interface.
6. **Adapter-extensible from day one.** Core speaks only to adapter interfaces.
   Roadmap and work-management default to markdown and swap to Aha/Jira/etc.

## Non-goals (V1)
- Not a multi-tenant hosted platform. Single user, local-first.
- Not an agent framework; it uses agents, it does not define how to build them.
- Not a chat product; the lead agent has a job, not a chat window.
- No drag-and-drop pipeline builder; the sprint is a declared definition.
