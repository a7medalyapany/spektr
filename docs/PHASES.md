# Spektr — Phased Build Plan

> Engineering lead's orchestration document.
> Each phase is independently shippable. Read fully before starting each one.

---

## Before you write a single line of code

### Pre-phase checklist (do this first, every time)
1. Read `docs/ARCHITECTURE.md` fully — especially the IPC protocol and pipeline order
2. Read `AGENTS.md` rules (Non-negotiables section)
3. Confirm your Go version: `go version` → must be 1.26.x
4. Open a fresh Claude Code session for each phase
5. Use `/init` to regenerate CLAUDE.md context at the start of each session

### What agents are bad at (compensate for these)
- **Drifting from the architecture.** Agents will reach for `net/http` frameworks. They must use stdlib.
- **Hot path violations.** Agents will add blocking calls to the proxy path. Review every proxy change manually.
- **CGO creep.** Agents may suggest `mattn/go-sqlite3`. Always reject in favour of `modernc.org/sqlite`.
- **Schema drift.** Agents may change the MCPEvent struct without updating SQL schema. Always do both.

---

## Phase 1 — The Eye (6-8 weeks)
**Goal:** Working interception. Agent traffic flows through Spektr. You see it in the UI.

### What to focus on BEFORE writing code
- Understand `bufio.Scanner` on os.Stdin and how pipe goroutines work
- Read the go-mitmproxy README, specifically the addon interface
- Understand Tauri v2 sidecar pattern: https://v2.tauri.app/develop/sidecar/
- Manually test stdio piping: `echo 'hello' | cat | cat` — understand the chain

### Implementation order (critical — do this sequence)
1. `pkg/types/event.go` — define all types before anything else
2. `internal/storage/` — schema, migrations, write path
3. `cmd/spektr-proxy/main.go` — the hot-path interceptor
4. `internal/socket/server.go` — Unix socket server in daemon
5. `internal/pipeline/parser.go` — JSON-RPC classifier
6. `internal/pipeline/enricher.go` — metadata + request-response correlation
7. `internal/stream/server.go` — WebSocket + REST server
8. `cmd/spektr/main.go` — wire everything together
9. `internal/config/` — agent config detector + patcher
10. React UI — event timeline with TanStack Virtual
11. Tauri shell — window, sidecar lifecycle, tray

### Claude Code prompts for Phase 1

**Prompt 1.1 — Go types (run first, alone)**
```
Read pkg/types/event.go which already has the MCPEvent struct.
Your task: Review it against docs/ARCHITECTURE.md DATA_MODEL section.
Add any missing types to complete the type system:
- Session struct
- DaemonConfig struct (the stdin JSON config the daemon reads at startup)
- ProxyReport struct (what spektr-proxy sends to daemon via Unix socket)
- All enums must be string-typed constants, not iota ints
- Add godoc comments to every exported type and field
Do NOT add business logic. Types only.
Run: cd proxy && go build ./pkg/... to verify.
```

**Prompt 1.2 — SQLite storage layer**
```
Implement internal/storage/ in the Spektr Go proxy.
Read docs/ARCHITECTURE.md for the schema. Read pkg/types/event.go for types.
Files to create:
- db.go: open modernc.org/sqlite database, WAL mode OFF (single writer), PRAGMA journal_mode=DELETE
- migrations.go: embed SQL migration files using go:embed, run on startup
- queries.go: typed functions — InsertEvent, GetEvent, ListEvents (with filter params), InsertSession, GetSession
- migrations/001_init.sql: full schema from ARCHITECTURE.md

Rules:
- Use modernc.org/sqlite ONLY — never mattn/go-sqlite3
- All query functions take context.Context as first arg
- Use prepared statements stored on the Store struct (prepare once, reuse)
- Write table-driven tests in db_test.go using t.TempDir() for the DB path
Run: cd proxy && go test ./internal/storage/...
```

**Prompt 1.3 — spektr-proxy hot path**
```
Implement cmd/spektr-proxy/main.go — the stdio interceptor.
Read AGENTS.md hot-path rules. Read docs/ARCHITECTURE.md proxy section.
Read internal/interceptor/socket.go (Unix socket client — implement this first).

The proxy must:
1. Parse flags: --server (name), --socket (path), then -- <real command and args>
2. Start real MCP server: exec.Command(args[0], args[1:]...) with stdin/stdout pipes
3. Start Unix socket client: connect to daemon socket (non-blocking, retry 3x with 100ms backoff)
4. Goroutine A — Agent→Server: read os.Stdin line by line (bufio.Scanner), send copy to daemon
   via socket (1ms timeout, fire-and-forget), write to real server's stdin
5. Goroutine B — Server→Agent: read real server stdout line by line, send copy to daemon,
   write to os.Stdout
6. sync.WaitGroup both goroutines
7. On either goroutine exit, signal the other to stop via context cancellation

The Unix socket send format (newline-delimited JSON):
{"server_name":"filesystem","direction":"request","raw":"<raw line>","ts":<unix ms>}

CRITICAL: Never add parsing or blocking logic to goroutines A or B. Raw bytes only.
Test with: echo '{}' | go run ./cmd/spektr-proxy -- cat
```

**Prompt 1.4 — Event pipeline**
```
Implement internal/pipeline/ in order: parser.go, enricher.go, emitter.go.
Read docs/ARCHITECTURE.md pipeline section. Read pkg/types/event.go.

parser.go:
- func Parse(raw []byte, serverName string, direction Direction) (*types.MCPEvent, error)
- Classify JSON-RPC into MessageType (request/response/notification/error)
- Extract method, id, params, result
- Call classifyMethod(method string) MethodCategory
- Set ToolName/ToolArgs for tools/call events

enricher.go:
- func Enrich(event *types.MCPEvent, sessionID string) *types.MCPEvent
- Assign UUID v7 ID using github.com/google/uuid
- Set SessionID
- Use sync.Map keyed by "serverName:messageID" to correlate request↔response
- Set PairedID and DurationMs on responses

emitter.go:
- type Emitter struct with ring buffer (circular slice, cap 5000), ws hub, write channel
- func (e *Emitter) Emit(event *types.MCPEvent)  — non-blocking, drops if full
- Ring buffer uses atomic index, no mutex
- Write channel: buffered cap 10000, consumed by single goroutine that batches SQLite inserts
- WebSocket broadcast: goroutine per connection, drop if send channel full (never block)

Write tests for parser.go and enricher.go. Emitter tested in integration test.
```

**Prompt 1.5 — WebSocket + REST server**
```
Implement internal/stream/server.go — the HTTP server on :48300.
Read docs/ARCHITECTURE.md REST API endpoints section.

Use Go 1.26 stdlib net/http ONLY. No external routers.
Routes using method+path syntax: mux.HandleFunc("GET /api/sessions/{id}", ...)

Implement:
- GET /api/sessions (list from SQLite, 50 most recent)
- GET /api/sessions/{id} (with computed stats: total_events, total_cost, duration)
- GET /api/sessions/{id}/events (paginated, filter by ?server=&risk=&category=&limit=&offset=)
- GET /api/sessions/{id}/events/{eid}
- GET /api/events/live (WebSocket upgrade using gorilla/websocket)
- Standard JSON envelope: {"data": ..., "error": null}

WebSocket hub (hub.go):
- type Hub struct with map[*Client]bool, broadcast chan []byte, register/unregister chans
- func (h *Hub) Run() — the select loop, run in goroutine
- func (h *Hub) Broadcast(data []byte) — non-blocking send to broadcast channel

CORS: Allow only http://localhost:1420 (Vite dev) and tauri://localhost (production).
Bind to 127.0.0.1:48300 only — never 0.0.0.0.
```

**Prompt 1.6 — React event timeline (UI)**
```
Implement the Spektr event timeline UI.
Read src/stores/eventStore.ts (create if not exists) and AGENTS.md React rules.

Files to create/implement:
1. src/stores/eventStore.ts — Zustand v5 store:
   - events: MCPEvent[] (max 5000, newest first)
   - addEvent(e: MCPEvent): void — prepend, slice to 5000
   - filters: { server?: string; riskLevel?: string; search?: string }
   - selectedEventId: string | null
   - filteredEvents computed via useMemo in components (NOT in store)

2. src/hooks/useLiveEvents.ts — WebSocket hook:
   - Connect to ws://localhost:48300/api/events/live
   - Parse JSON → MCPEvent, call addEvent
   - Exponential backoff reconnect (1s, 2s, 4s, max 30s)
   - Expose: isConnected: boolean

3. src/components/EventTimeline.tsx — TanStack Virtual list:
   - Takes events: MCPEvent[] as prop
   - useVirtualizer: estimateSize=40, overscan=10
   - Each row: risk border (colored left strip 3px), direction badge, server badge (color from hash),
     method label, tool name (bold), duration (ms), cost ($)
   - Click row → selectEvent

4. src/components/EventDetail.tsx — right panel:
   - Shows selected event or empty state
   - Tabs: Params | Result | Risk | Raw
   - CodeMirror 6 JSON viewer in Params and Result tabs
   - Risk tab: list of RiskFlag with severity badge

5. src/App.tsx — layout: sidebar (20%) | EventTimeline (50%) | EventDetail (30%)

Use Tailwind v4 utility classes. shadcn/ui for badges, tabs, skeleton states.
Server color: derive hue from hash(serverName) % 360, use HSL.
```

### Phase 1 success criteria
- [ ] `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | spektr-proxy --server test --socket /tmp/spektr.sock -- cat` outputs the line unchanged and daemon receives it
- [ ] Events appear in the UI within 100ms of being intercepted
- [ ] Patching and restoring a real Claude Code config file works without data loss
- [ ] UI renders 10,000 events without frame drops (test with mock data)
- [ ] `make test` passes

---

## Phase 2 — The Brain (4-5 weeks)
**Goal:** Risk engine, cost tracking, auto-pause, session replay.

### Implementation order
1. `internal/pipeline/risk.go` — full rule set
2. Auto-pause protocol in `spektr-proxy` (reverse socket message)
3. `internal/pipeline/cost.go`
4. Session replay endpoint + playback UI
5. OS notifications for critical events (Tauri notification plugin)

### Claude Code prompt for Phase 2 (risk engine)
```
Implement internal/pipeline/risk.go in the Spektr Go proxy.
Read docs/ARCHITECTURE.md Risk levels section. Read pkg/types/event.go.

Implement:
type RiskRule struct {
    Name  string
    Level types.RiskLevel
    Desc  string
    Check func(event *types.MCPEvent) bool
}

type RiskEngine struct { rules []RiskRule }

func NewRiskEngine() *RiskEngine — returns engine with all default rules loaded

func (e *RiskEngine) Evaluate(event *types.MCPEvent) *types.MCPEvent
  — runs all rules, sets event.RiskLevel (highest match), event.RiskFlags (all matches)
  — returns event unchanged if no rules match

Default rules to implement (exact names matter for tests):
Critical: shell-destructive-delete, shell-destructive-db, shell-format-disk, credential-file-write
High: env-file-write, sensitive-file-read, file-delete, shell-sudo, git-force-push
Medium: external-network-fetch, shell-command, large-file-write, package-install
Low: env-var-read, file-write

Helper functions (unexported):
- toolNameIs(names ...string) func(*types.MCPEvent) bool
- toolArgContains(field string, subs ...string) func(*types.MCPEvent) bool
- toolPathMatchesAny(field string, patterns ...string) func(*types.MCPEvent) bool
- resourceURIMatchesAny(patterns ...string) func(*types.MCPEvent) bool

Write exhaustive table-driven tests covering every rule with both matching and non-matching events.
Benchmark: BenchmarkRiskEngine must show < 1µs per event.
```

---

## Phase 3 — Power Features (6-8 weeks)

### Claude Code prompt for session diff
```
Implement session diff: compare two .spektr session files.
Read docs/ARCHITECTURE.md schema section for the events table structure.
Read internal/storage/queries.go for existing query patterns.

Implement GET /api/diff?a={session_id}&b={session_id}:
- Group events by (server_name, method, tool_name) in both sessions
- Compare: endpoints only in A, only in B, in both (with risk level changes)
- Return DiffResult struct with: added[]EndpointSummary, removed[], changed[]EndpointDiff
- EndpointSummary: server, method, tool_name, call_count, avg_duration_ms, risk_level
- EndpointDiff: the above for both sessions, plus risk_changed bool

React component: src/components/SessionDiff.tsx
- Two-column layout: Session A (left) | Session B (right)
- Color-coded rows: green=added, red=removed, yellow=changed risk
- Sortable by call_count, avg_duration, risk_level
```

---

## Agent orchestration strategy

### How to use Claude Code + Codex together

**Claude Code** (your primary agent):
- Architecture decisions, complex logic, pipeline code, type design
- Use `/agents` to spawn subagents from `.claude/agents/` for focused work
- Run with `--dangerously-skip-permissions` only in isolated dev environment

**Codex CLI**:
- Boilerplate generation, test writing, repetitive CRUD, Tailwind styling
- Point at specific files: `codex "implement the ListEvents query in internal/storage/queries.go"`
- Best for tasks with clear input/output with no architectural judgment

### Session rhythm (how to work)
```
1. Morning: open Claude Code session, run /init
2. Pick ONE phase item from the implementation order list
3. Share the relevant prompt from PHASES.md with the agent
4. Agent implements → you review hot-path changes manually
5. Run make test before committing
6. Commit with conventional commits: feat(proxy): implement pipeline parser
7. End of day: ask Claude "summarize what changed and any decisions made"
   → append to docs/DECISIONS.md
8. Close session (context doesn't carry over — this is by design)
```

### Context window management
- At 70% context: `/compact`
- At 85%: open new session, paste the relevant prompt fresh
- Never let context hit 90% — quality degrades sharply
- Keep sessions focused: one session = one package or one feature

### Red flags to watch for
- Agent adds `github.com/gin-gonic/gin` → reject, use stdlib
- Agent writes to SQLite from proxy goroutine → reject, use write channel
- Agent uses `mattn/go-sqlite3` → reject, use modernc
- Agent makes WebSocket connection blocking → reject, use non-blocking hub
- Agent puts business logic in `pkg/types` → reject, types only
