# 07 — Packaging and install

Skipper is self-contained. Installing Skipper brings everything: the UI, Core,
the CLI, and the embedded agent runtime (the default lead agent and crew skills).
The user never separately installs or configures the runtime.

## Distribution
The runtime is polyglot — Core/CLI/UI are TypeScript, the embedded lead agent is
Python — so the clean single artifact is a **container image**:
```
skipper up            # starts Core, serves the UI, embedded runtime already wired
```
Provide also a CLI installer that provisions a managed local environment under
`~/.skipper/` for users who don't want a container. Either path must require zero
manual runtime setup.

## What the install does
- Provisions a **version-pinned** embedded runtime under `~/.skipper/runtime/`:
  the default lead agent and the default persona skills, installed and wired
  automatically (the user does not run the underlying tools' setup themselves).
- Registers the default adapters (`roadmap: markdown`, `workboard: markdown`,
  `conductor: hermes`, `persona: gstack`, `check: tests+security`, `deploy: ci`).
- Leaves the embedded pieces behind the conductor/persona adapters, so an
  advanced user can swap them later without touching Core.
- Selects the **agent backend** by detection (see `04`): the locally-installed
  Claude Code CLI is preferred; an `ANTHROPIC_API_KEY` is the fallback; the stub
  is the last resort. Install does not require either — Skipper runs the loop
  with the stub and warns when no real backend is present.

## Pinning and reproducibility
The embedded runtime and skills are pinned by version so a given Skipper release
behaves reproducibly. Learning/skill mutation (if the runtime supports it) is
confined to a dev profile; the default/production path runs with a frozen skill
set so sprints are repeatable.

## First run
```
skipper init               # one-time: provision runtime, write ~/.skipper/config
skipper attach <repo>      # point at a repo (intake runs if it already has code)
skipper up                 # (optional) bring up the UI
```
After `init`, the user has a working agent with no dependency hunt.
