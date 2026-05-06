# Spektr — Agent Instructions

> Universal context file. Codex reads this directly. Claude Code loads it via `@AGENTS.md` in CLAUDE.md.

---

## What this project is

**Spektr** is an open-source, local-first desktop app that debugs AI coding agents.
It intercepts MCP (Model Context Protocol) traffic between AI agents (Claude Code, Cursor,
Windsurf, Codex) and their MCP servers — showing every tool call, file write, shell command,
and API request in real-time, with risk detection and session replay.

---

## Repo structure (workspace monorepo — root is neutral)

```
spektr/                   ← git root (Makefile, docs, agent files only — no tool owns this)
├── proxy/                ← Go 1.26 module root  → run all `go` commands from here
│   ├── cmd/
│   │   ├── spektr/           main daemon binary
│   │   └── spektr-proxy/     lightweight per-MCP-server interceptor
│   ├── internal/
│   │   ├── config/           agent config detection + patching
│   │   ├── interceptor/      stdio + HTTP proxy logic
│   │   ├── pipeline/         parse → enrich → risk → cost → emit
│   │   ├── storage/          SQLite via modernc/sqlite (NO CGO)
│   │   ├── stream/           WebSocket + REST on :48300
│   │   └── socket/           Unix domain socket server
│   ├── pkg/types/            shared types (MCPEvent, Session, RiskLevel)
│   └── go.mod
├── desktop/              ← Tauri v2 + React root  → run all `npm`/`tauri` commands from here
│   ├── src/                  React 19 components, hooks, stores
│   ├── src-tauri/            Rust/Tauri shell
│   │   ├── src/main.rs
│   │   ├── binaries/         compiled Go binaries land here (git-ignored)
│   │   └── tauri.conf.json
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   └── PHASES.md
├── .claude/agents/       subagent definitions
├── AGENTS.md             ← this file
├── CLAUDE.md             ← Claude Code config (imports this file)
└── Makefile              orchestrates proxy/ and desktop/ from root
```

---

## Non-negotiable rules

1. **Never use CGO.** `CGO_ENABLED=0` everywhere. Use `modernc.org/sqlite`, not `mattn/go-sqlite3`.
2. **Agent-first.** `spektr-proxy` must NEVER block the agent. Every observability op is ≤1ms timeout, fire-and-forget. Daemon being down = proxy keeps forwarding silently.
3. **No external router.** Go 1.26 stdlib `net/http` supports `GET /api/events/{id}` natively. No Gin, Chi, Echo, Gorilla.
4. **One SQLite writer.** All DB writes go through a single goroutine + buffered channel. Never concurrent writes.
5. **`pkg/types` is types only.** Zero business logic. Zero imports from `internal/`.
6. **Structured logging.** `log/slog` everywhere. No bare `fmt.Println` in production paths.
7. **Wrap errors.** `fmt.Errorf("context: %w", err)`. Never swallow silently.
8. **No browser storage.** No `localStorage`/`sessionStorage` in React. State = Zustand or TanStack Query.
9. **Minimal Tauri capabilities.** Default deny. Only grant what's strictly needed.
10. **Test the pipeline.** Unit tests target `internal/pipeline` (pure functions). Integration tests use real stdio pipes + mock MCP servers.

---

## Tech stack (pinned)

| Layer | Tech | Version |
|-------|------|---------|
| Proxy engine | Go | 1.26.2 |
| SQLite driver | modernc.org/sqlite | latest |
| Desktop shell | Tauri | v2.x |
| Frontend | React + Vite | 19.x / 6.x |
| State | Zustand | 5.x |
| Server state | TanStack Query | 5.x |
| Virtualization | TanStack Virtual | 3.x |
| Routing | TanStack Router | latest |
| Styling | Tailwind CSS | 4.x |
| Components | shadcn/ui | latest |
| Code viewer | CodeMirror | 6.x |

---

## Key type — MCPEvent

```go
type MCPEvent struct {
    ID          string          // UUID v7 (time-ordered)
    SessionID   string
    PairedID    string          // matching request/response UUID
    ServerName  string          // "filesystem", "github", "bash"
    Direction   Direction       // request | response | notification
    Method      string          // "tools/call", "resources/read", etc.
    Params      json.RawMessage
    Result      json.RawMessage
    Timestamp   time.Time
    DurationMs  int64
    RiskLevel   RiskLevel       // none | low | medium | high | critical
    RiskFlags   []RiskFlag
    Cost        *CostEstimate
}
```

Full definition: `proxy/pkg/types/event.go`

---

## IPC channels

| Channel | Transport | Direction | Purpose |
|---------|-----------|-----------|---------|
| Startup config | stdin JSON | Tauri → Go daemon | Initial setup |
| Lifecycle events | stdout JSON lines | Go daemon → Tauri | ready / error |
| Live traffic | WebSocket `:48300/stream` | Go → React | Real-time events |
| REST API | HTTP `:48300/api` | React → Go | Historical queries |
| Tauri commands | Tauri IPC invoke | React → Rust | OS ops |
| Proxy reports | Unix socket `/tmp/spektr.sock` | spektr-proxy → daemon | Event stream |

---

## Common commands

```bash
# From repo root
make dev          # run everything (proxy + desktop) in dev mode
make test         # run all tests (Go + TS typecheck)
make build        # production build

# Go only (run from proxy/)
cd proxy
go build ./...
go test -race ./...
go vet ./...

# Desktop only (run from desktop/)
cd desktop
npm run dev           # Vite dev server only
npm run tauri dev     # full Tauri dev mode
npx tsc --noEmit      # TypeScript typecheck
```

---

## What NOT to do

- Do NOT add Gin, Echo, Fiber, Chi to Go — use stdlib net/http
- Do NOT use `mattn/go-sqlite3` — use `modernc.org/sqlite`
- Do NOT write to SQLite from the proxy goroutine — use write channel
- Do NOT import `internal/` from `pkg/types`
- Do NOT use `any` in Go unless truly unavoidable
- Do NOT use `useEffect` for data fetching in React — use TanStack Query
- Do NOT run `npm` commands from the repo root — always `cd desktop` first
- Do NOT run `go` commands from the repo root — always `cd proxy` first
