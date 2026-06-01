# Skipper — High-Level Architecture

Source of truth: [`spec/01-architecture.md`](../spec/01-architecture.md). This is a
visual summary of components and the one-loop data flow.

## Components & data flow

```mermaid
flowchart TB
    Human(["👤 Human / Board<br/>defines intent · signs off"])

    subgraph Clients["Thin clients (no business logic)"]
        CLI["CLI<br/>headless · composable"]
        UI["UI (React + Vite)<br/>dashboard · kanban · inbox"]
    end

    subgraph Core["CORE — single writer of state"]
        API["API<br/>HTTP + WebSocket"]
        Runner["Sprint Runner<br/>state machine · gate &amp; budget guards"]
        FS["File-state<br/>reader / writer"]
        Log["Event Log<br/>append-only"]
        API --> Runner
        Runner --> FS
        Runner --> Log
    end

    subgraph Adapters["Adapter interfaces (Core depends only on these)"]
        Roadmap["Roadmap"]
        WorkBoard["WorkBoard"]
        Conductor["Conductor"]
        Persona["Persona"]
        Check["Check"]
        Deploy["Deploy"]
    end

    subgraph Runtime["Embedded runtime (default impls)"]
        Hermes["Hermes<br/>lead agent · memory"]
        Crew["gstack crew<br/>architect · coder · reviewer<br/>qa · security · release · sre"]
        Hermes --> Crew
    end

    subgraph Repo["Target git repo"]
        Skipper[".skipper/<br/>roadmap.md · sprints/*.md<br/>log.jsonl · artifacts/ · run.json"]
        Code["built code<br/>(in the repo itself)"]
    end

    %% intent in
    Human -->|"intent / sign-off"| CLI
    Human -->|"intent / sign-off"| UI
    CLI <-->|"API + WS"| API
    UI  <-->|"API + WS"| API

    %% core drives work through adapters
    Runner -->|"pull next stage"| Conductor
    Conductor --> Hermes
    Runner -->|"delegate stage"| Persona
    Persona --> Crew
    Runner -->|"gate evidence"| Check
    Runner -->|"release"| Deploy
    Runner -->|"what to build"| Roadmap
    Runner -->|"tasks / kanban"| WorkBoard

    %% adapters back into runtime / repo
    Check -.->|"tests · scan results"| Runner
    Crew -->|"work in isolated<br/>git worktree"| Code

    %% state persistence
    FS <-->|"read / write markdown"| Skipper
    Log -->|"append events"| Skipper

    %% live stream back out
    Log -.->|"WebSocket stream"| API
    API -.->|"live re-render"| UI
    API -.->|"inbox --follow"| CLI

    %% gates require a human
    Runner -.->|"sign-off request<br/>(adr · ship)"| Human
```

## The loop, in order

1. **Intent in** — human adds to the roadmap via CLI or UI → Core writes `roadmap.md`.
2. **Plan** — the Runner dissects intent into an ordered sprint, writes `sprints/*.md`,
   appends `sprint.created` to `log.jsonl`.
3. **Drive** — Conductor (Hermes) pulls the next stage; Core advances **only** when the
   stage's gate condition holds (passing check or recorded human sign-off).
4. **Delegate** — the lead agent hands the stage to the right Persona (crew role), which
   works in an isolated git worktree.
5. **Record** — every handoff, artifact, sign-off, and transition is appended to the
   event log. Nothing bypasses Core.
6. **Stream out** — Core pushes changes over WebSocket; the UI re-renders live and the
   CLI `inbox --follow` tails the same stream.

## Invariants the diagram encodes

- **Single writer** — only Core mutates project state; agents request changes through
  Core operations.
- **Sign-offs aren't self-issuable** — the two gates (`adr`, `ship`) require a recorded
  human approval the Runner re-reads; no agent can mint one.
- **Core ⇄ adapters only** — Core never imports a concrete tool; swapping Hermes / Jira /
  a coder is an adapter change, not a Core change.
- **State is files** — `.skipper/` (markdown + append-only JSONL) versioned in the repo;
  no database.
