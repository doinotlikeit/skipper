# Skipper roadmap

> This is Skipper's own roadmap — the V1 markdown roadmap adapter's data, used to
> build Skipper with Skipper once a runnable version exists (see spec/09).

## INIT-1 — Core + file-state
The sprint runner and the `.skipper/` file-state layer. The foundation
everything else reads and writes through. (spec/01, spec/02, spec/03)

## INIT-2 — Headless CLI
Full CLI parity with the eventual UI, minus visualization; composable and
scriptable. (spec/05)

## INIT-3 — Embedded runtime + crew
Wire the default lead agent and persona skills; zero-setup install; repo intake
("read and understand an existing repo"). (spec/07, spec/08)

## INIT-4 — UI
React + Vite dashboard, kanban, and inbox as pure clients of Core. (spec/06)

## INIT-5 — Packaging + self-hosting
One-command container, config-selectable adapters, and the self-hosting loop:
Skipper shipping features to its own repo. (spec/07, spec/09)

## INIT-6 — Real crew via agent-backend resolution
Make the conductor and persona adapters do real work by resolving an agent
backend: prefer the locally-installed Claude Code CLI (shell out, run in the
persona's git worktree), fall back to `ANTHROPIC_API_KEY` (embedded Anthropic
SDK), and fall back again to the stub with a warning. Config may pin a backend.
This is the item that closes the self-hosting loop — once the coder produces a
real diff under the worktree, Skipper can build its own roadmap. Prove it end to
end on a sample repo before pointing it at Skipper itself.
(spec/04 Agent backend resolution, spec/07, spec/08)

## Later (not V1)
Live Jira and Aha adapters beyond a reference each; additional personas;
embedded SQLite only if concurrency forces it; hosted/multi-user.
