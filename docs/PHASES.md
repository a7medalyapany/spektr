# Spektr — Phased Build Plan

> All paths are relative to the repo root (`~/spektr/`).
> Go commands always run from `proxy/`. npm/tauri commands always run from `desktop/`.

---

## Current state after setup.sh

- `proxy/pkg/types/event.go` — ✅ complete (all types including ServerPID, MessageType, RawPayload)
- `proxy/go.mod` — ✅ initialized with modernc.org/sqlite, gorilla/websocket, google/uuid
- `proxy/cmd/spektr/main.go` — stub, needs Phase 1 implementation
- `proxy/cmd/spektr-proxy/main.go` — stub, needs Phase 1 implementation
- `desktop/` — ✅ Tauri v2 + React scaffolded, all npm deps installed
- **Start at Task 2.** Task 1 (types) is already done.

---

## Before you write a single line of code

1. Read `docs/ARCHITECTURE.md` — especially the pipeline order and IPC protocol
2. Read `AGENTS.md` rules — the non-negotiables section
3. Keep Codex sessions focused: **one task per session**
<!-- 4. After each task: `git add -A && git commit -m "feat(proxy): ..."` before starting the next -->

---

## Phase 1 — The Eye

**Goal:** Working interception. MCP traffic flows through Spektr. You see it in the UI live.

### Implementation order (strict — each task depends on the previous compiling)

```
✅ Task 1  — Types (event.go already complete)
   Task 2  — Storage layer
   Task 3  — spektr-proxy hot path
   Task 4  — Event pipeline
   Task 5  — Daemon + WebSocket server
   Task 6  — React UI
   Task 7  — Wire up + smoke test
```

---

### Task 2 — Storage layer

**Storage files are split by domain, all in `package storage`:**

```
proxy/internal/storage/
├── db.go             Store struct + Open()
├── migrations.go     go:embed runner
├── migrations/
│   └── 001_init.sql  full schema
├── session.go        Session CRUD
├── event.go          Event CRUD + batch writer
└── search.go         FTS5 full-text search
```

```
Read AGENTS.md (non-negotiables: modernc/sqlite, single writer, no CGO).
Read docs/ARCHITECTURE.md — "SQLite write pattern" and "Data Model" sections.
Read proxy/pkg/types/event.go — these are the exact types you will persist.

Create the following files in proxy/internal/storage/:

── proxy/internal/storage/migrations/001_init.sql ──────────────────────────
Full schema. Include exactly:

CREATE TABLE sessions (
    id            TEXT PRIMARY KEY,
    agent_type    TEXT NOT NULL,
    agent_pid     INTEGER,
    started_at    INTEGER NOT NULL,
    ended_at      INTEGER,
    total_events  INTEGER DEFAULT 0,
    total_cost    REAL    DEFAULT 0.0,
    metadata      JSON
);

CREATE TABLE events (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions(id),
    paired_id     TEXT,
    server_name   TEXT NOT NULL,
    server_pid    INTEGER,
    transport     TEXT NOT NULL,
    direction     TEXT NOT NULL,
    message_type  TEXT NOT NULL,
    category      TEXT NOT NULL,
    method        TEXT NOT NULL,
    message_id    TEXT,
    tool_name     TEXT,
    params        BLOB,
    result        BLOB,
    error_code    INTEGER,
    error_message TEXT,
    timestamp     INTEGER NOT NULL,
    duration_ms   INTEGER,
    risk_level    TEXT NOT NULL DEFAULT 'none',
    risk_flags    JSON DEFAULT '[]',
    paused        INTEGER DEFAULT 0,
    input_tokens  INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd      REAL    DEFAULT 0.0,
    raw_payload   BLOB
);

CREATE INDEX idx_events_session  ON events(session_id, timestamp DESC);
CREATE INDEX idx_events_server   ON events(server_name);
CREATE INDEX idx_events_risk     ON events(risk_level) WHERE risk_level != 'none';
CREATE INDEX idx_events_category ON events(category);

CREATE VIRTUAL TABLE events_fts USING fts5(
    id UNINDEXED,
    tool_name,
    params_text,
    result_text,
    content='events',
    content_rowid='rowid'
);

CREATE VIEW session_stats AS
SELECT
    session_id,
    COUNT(*)                                      AS total_events,
    COUNT(*) FILTER (WHERE direction='request')   AS total_requests,
    SUM(cost_usd)                                 AS total_cost_usd,
    SUM(input_tokens)                             AS total_input_tokens,
    SUM(output_tokens)                            AS total_output_tokens,
    COUNT(*) FILTER (WHERE risk_level='critical') AS critical_events,
    COUNT(*) FILTER (WHERE risk_level='high')     AS high_events,
    MAX(timestamp) - MIN(timestamp)               AS duration_ms
FROM events
GROUP BY session_id;

── proxy/internal/storage/db.go ─────────────────────────────────────────────
package storage

type Store struct {
    db *sql.DB
    // Prepared statements (prepared once in Open, reused forever)
    stmtInsertEvent   *sql.Stmt
    stmtInsertSession *sql.Stmt
}

func Open(path string) (*Store, error)
- Opens modernc.org/sqlite database (import _ "modernc.org/sqlite")
- PRAGMA journal_mode=DELETE (NOT WAL — single writer, no WAL overhead)
- PRAGMA busy_timeout=5000
- PRAGMA foreign_keys=ON
- Calls runMigrations(db)
- Prepares and stores stmtInsertEvent, stmtInsertSession
- Returns &Store{db: db, ...}

func (s *Store) Close() error

── proxy/internal/storage/migrations.go ─────────────────────────────────────
//go:embed migrations/*.sql
var migrationFS embed.FS

func runMigrations(db *sql.DB) error
- Read all *.sql files from embed.FS in sorted order
- Execute each in a transaction
- Idempotent: use IF NOT EXISTS on all CREATE statements

── proxy/internal/storage/session.go ────────────────────────────────────────
All functions take context.Context as first argument.

func (s *Store) InsertSession(ctx context.Context, sess *types.Session) error
func (s *Store) GetSession(ctx context.Context, id string) (*types.Session, error)
func (s *Store) ListSessions(ctx context.Context, limit int) ([]*types.Session, error)
func (s *Store) CloseSession(ctx context.Context, id string) error
  - Sets ended_at = now

── proxy/internal/storage/event.go ──────────────────────────────────────────
All functions take context.Context as first argument.

func (s *Store) InsertEvent(ctx context.Context, e *types.MCPEvent) error
  - Uses s.stmtInsertEvent prepared statement
  - Marshals e.Params, e.Result, e.RiskFlags to JSON
  - Stores e.RawPayload as BLOB

func (s *Store) BatchInsert(ctx context.Context, events []*types.MCPEvent) error
  - Single BEGIN/COMMIT transaction
  - Uses same prepared statement for all rows

func (s *Store) GetEvent(ctx context.Context, id string) (*types.MCPEvent, error)
func (s *Store) ListEvents(ctx context.Context, opts ListEventsOpts) ([]*types.MCPEvent, error)

type ListEventsOpts struct {
    SessionID string
    Server    string    // filter by server_name (empty = all)
    RiskLevel string    // filter by risk_level (empty = all)
    Category  string    // filter by category (empty = all)
    Limit     int       // default 100
    Offset    int
}

── proxy/internal/storage/search.go ─────────────────────────────────────────
func (s *Store) SearchEvents(ctx context.Context, sessionID, query string, limit int) ([]*types.MCPEvent, error)
  - Uses FTS5 virtual table: SELECT e.* FROM events e
    JOIN events_fts fts ON e.rowid = fts.rowid
    WHERE events_fts MATCH ? AND e.session_id = ?
    ORDER BY rank LIMIT ?

── proxy/internal/storage/db_test.go ────────────────────────────────────────
Table-driven tests using t.TempDir() for DB path.
Must test:
- Open creates schema without error
- InsertSession + GetSession round-trip (all fields preserved)
- InsertEvent + GetEvent round-trip (Params and RiskFlags correctly serialized)
- ListEvents with Server filter returns only matching rows
- BatchInsert of 500 events completes in < 100ms
- SearchEvents returns event when tool_name matches query

After: cd proxy && go test ./internal/storage/... -v -count=1
```

---

### Task 3 — spektr-proxy hot path

```
Read AGENTS.md hot-path rules (agent-first section).
Read proxy/pkg/types/event.go — specifically the ProxyReport type.
Read docs/ARCHITECTURE.md — "How stdio interception works" section.

Implement two files:

── proxy/internal/interceptor/socket.go ─────────────────────────────────────
package interceptor

type SocketClient struct {
    socketPath string
    conn       net.Conn
    mu         sync.Mutex
}

func NewSocketClient(socketPath string) *SocketClient

func (c *SocketClient) Connect() error
  - net.Dial("unix", c.socketPath)
  - Retry 3 times with 100ms backoff
  - Non-fatal: caller logs and continues if all retries fail

func (c *SocketClient) ReportAsync(report *types.ProxyReport)
  - json.Marshal the report, append '\n'
  - c.mu.Lock() (protects concurrent goroutine A and B writes)
  - c.conn.SetWriteDeadline(time.Now().Add(1 * time.Millisecond))
  - Write to conn
  - On any error: log with slog.Debug, return immediately — NEVER block
  - c.mu.Unlock()

func (c *SocketClient) Close() error

── proxy/cmd/spektr-proxy/main.go ───────────────────────────────────────────
Replace the stub entirely.

1. Parse flags:
   --server  string   (MCP server name, e.g. "filesystem")
   --socket  string   (daemon Unix socket path, default "/tmp/spektr.sock")
   Everything after "--" = real server command + args (flag.Args())

2. Validate: if len(flag.Args()) == 0, log error and exit(1)

3. Create and connect socket client (non-fatal — proxy works without daemon):
   client := interceptor.NewSocketClient(*socket)
   if err := client.Connect(); err != nil {
       slog.Warn("daemon not available, running in passthrough mode", "err", err)
   }

4. Start real MCP server:
   cmd := exec.Command(args[0], args[1:]...)
   serverIn, _  := cmd.StdinPipe()
   serverOut, _ := cmd.StdoutPipe()
   cmd.Stderr = os.Stderr
   cmd.Start()

5. ctx, cancel := context.WithCancel(context.Background())

6. var wg sync.WaitGroup
   wg.Add(2)

   // Goroutine A — Agent → Server
   go func() {
       defer wg.Done()
       defer cancel()
       scanner := bufio.NewScanner(os.Stdin)
       for scanner.Scan() {
           line := scanner.Bytes()
           client.ReportAsync(&types.ProxyReport{
               ServerName:  *server,
               Direction:   types.DirectionRequest,
               Raw:         append([]byte(nil), line...),  // copy
               TimestampMS: time.Now().UnixMilli(),
           })
           serverIn.Write(append(line, '\n'))
       }
   }()

   // Goroutine B — Server → Agent
   go func() {
       defer wg.Done()
       defer cancel()
       scanner := bufio.NewScanner(serverOut)
       for scanner.Scan() {
           line := scanner.Bytes()
           client.ReportAsync(&types.ProxyReport{
               ServerName:  *server,
               Direction:   types.DirectionResponse,
               Raw:         append([]byte(nil), line...),
               TimestampMS: time.Now().UnixMilli(),
           })
           os.Stdout.Write(append(line, '\n'))
       }
   }()

   // Stop when either goroutine exits or ctx cancelled
   go func() {
       <-ctx.Done()
       cmd.Process.Signal(os.Interrupt)
   }()

   wg.Wait()
   cmd.Wait()
   client.Close()

CRITICAL: Goroutines A and B contain ONLY: Scan(), ReportAsync(), Write().
No JSON parsing. No blocking calls. No mutexes (except inside ReportAsync).

Smoke test (run from repo root):
cd proxy && echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  go run ./cmd/spektr-proxy -- cat
Expected: same JSON line printed to stdout, process exits cleanly.
```

---

### Task 4 — Event pipeline

```
Read docs/ARCHITECTURE.md — "Event pipeline" section (ordered list).
Read proxy/pkg/types/event.go — every field.
Read proxy/internal/storage/event.go — InsertEvent signature.

Create these files in proxy/internal/pipeline/:

── proxy/internal/pipeline/parser.go ────────────────────────────────────────
package pipeline

func Parse(report *types.ProxyReport) (*types.MCPEvent, error)
  Input: a ProxyReport (server name, direction, raw JSON-RPC bytes, timestamp)

  1. json.Unmarshal report.Raw into a base struct:
     { JSONRPC, ID *json.RawMessage, Method string,
       Params json.RawMessage, Result json.RawMessage, Error json.RawMessage }

  2. Build MCPEvent:
     - ServerName = report.ServerName
     - Transport  = types.TransportStdio
     - Direction  = report.Direction
     - Timestamp  = time.UnixMilli(report.TimestampMS)
     - Method     = base.Method
     - MessageID  = base.ID
     - Params     = base.Params
     - Result     = base.Result

  3. Classify MessageType:
     - base.Method != "" && base.ID != nil  → MessageTypeRequest
     - base.Method != "" && base.ID == nil  → MessageTypeNotification
     - base.Result != nil                   → MessageTypeResponse
     - base.Error != nil                    → MessageTypeError

  4. Category via classifyMethod(method string) types.MethodCategory (unexported):
     "tools/call"         → CategoryToolCall
     "tools/list"         → CategoryToolList
     "resources/read"     → CategoryResourceRead
     "resources/list"     → CategoryResourceList
     "prompts/get"        → CategoryPromptGet
     "sampling/..."       → CategorySampling
     anything else        → CategoryLifecycle

  5. For tools/call requests: extract ToolName and ToolArgs from Params:
     params shape: {"name": "write_file", "arguments": {...}}
     Set event.ToolName = params.name
     Set event.ToolArgs = params.arguments (raw JSON)

  6. Set RiskLevel = types.RiskNone (enricher fills this in later)
     Set RiskFlags = []types.RiskFlag{}

  7. Store report.Raw in event.RawPayload

  Return completed *types.MCPEvent

── proxy/internal/pipeline/enricher.go ──────────────────────────────────────
package pipeline

type Enricher struct {
    sessionID string
    inFlight  sync.Map   // key: "serverName:messageID" → *types.MCPEvent
}

func NewEnricher(sessionID string) *Enricher

func (e *Enricher) Enrich(event *types.MCPEvent) *types.MCPEvent
  1. Generate UUID v7:
     id, _ := uuid.NewV7()
     event.ID = id.String()
  2. event.SessionID = e.sessionID
  3. For requests (MessageTypeRequest) with a non-nil MessageID:
     key := event.ServerName + ":" + string(*event.MessageID)
     e.inFlight.Store(key, event)
  4. For responses (MessageTypeResponse) with a non-nil MessageID:
     key := event.ServerName + ":" + string(*event.MessageID)
     if req, ok := e.inFlight.LoadAndDelete(key); ok {
         reqEvent := req.(*types.MCPEvent)
         event.PairedID   = reqEvent.ID
         reqEvent.PairedID = event.ID
         event.DurationMs = event.Timestamp.Sub(reqEvent.Timestamp).Milliseconds()
     }
  5. Return event

── proxy/internal/pipeline/parser_test.go ───────────────────────────────────
Table-driven tests. Must cover:
- Valid tools/call request: ToolName and ToolArgs extracted correctly
- Valid tools/list request: Category = CategoryToolList
- Response with result: MessageType = MessageTypeResponse
- Notification (no id): MessageType = MessageTypeNotification
- Error response: MessageType = MessageTypeError
- Invalid JSON: returns non-nil error

After: cd proxy && go test ./internal/pipeline/... -v -count=1
```

---

### Task 5 — Daemon + WebSocket server

```
Read docs/ARCHITECTURE.md — "REST API endpoints" and "IPC protocol" sections.
Read proxy/internal/storage/ — all files (know the Store API cold).
Read proxy/internal/pipeline/ — Parse and Enrich signatures.

── proxy/internal/stream/hub.go ─────────────────────────────────────────────
package stream

type Client struct {
    hub  *Hub
    conn *websocket.Conn
    send chan []byte    // buffered, cap 256
}

type Hub struct {
    clients    map[*Client]bool
    broadcast  chan []byte
    register   chan *Client
    unregister chan *Client
}

func NewHub() *Hub

func (h *Hub) Run()
  Loop on select:
  - register:   h.clients[c] = true
  - unregister: delete(h.clients, c); close(c.send)
  - broadcast:  for each client, non-blocking send to c.send
    If c.send is full: delete client, close conn (never block)

func (h *Hub) Broadcast(data []byte)
  Non-blocking send to h.broadcast channel (drop if full — never block caller)

── proxy/internal/stream/server.go ──────────────────────────────────────────
package stream

Use Go 1.26 stdlib net/http ONLY. Bind to 127.0.0.1:48300.

CORS middleware (wrap all handlers):
  Allow: http://localhost:1420, tauri://localhost
  Methods: GET, POST, DELETE, OPTIONS
  Handle OPTIONS preflight.

Routes (Go 1.26 method+path syntax):
  mux.HandleFunc("GET /api/sessions",                   s.handleListSessions)
  mux.HandleFunc("GET /api/sessions/{id}",              s.handleGetSession)
  mux.HandleFunc("GET /api/sessions/{id}/events",       s.handleListEvents)
  mux.HandleFunc("GET /api/sessions/{id}/events/{eid}", s.handleGetEvent)
  mux.HandleFunc("GET /api/events/live",                s.handleWebSocket)
  mux.HandleFunc("POST /api/events/{id}/approve",       s.handleApprove)
  mux.HandleFunc("POST /api/events/{id}/deny",          s.handleDeny)
  mux.HandleFunc("DELETE /api/sessions/{id}",           s.handleDeleteSession)

All JSON responses use this envelope:
  type envelope struct {
      Data  any    `json:"data"`
      Error string `json:"error,omitempty"`
  }
  func writeJSON(w http.ResponseWriter, status int, data any)
  func writeError(w http.ResponseWriter, status int, msg string)

handleWebSocket:
  Upgrade using gorilla/websocket (CheckOrigin: allow localhost only)
  Register client with hub
  Start writePump goroutine (reads from client.send, writes to ws)
  Run readPump in current goroutine (reads ping/pong only, detects disconnect)

── proxy/cmd/spektr/main.go ─────────────────────────────────────────────────
Replace the stub entirely.

func main():
1. Setup slog JSON handler on stderr

2. Read DaemonConfig from stdin:
   var cfg types.DaemonConfig
   json.NewDecoder(os.Stdin).Decode(&cfg)

3. Open SQLite:
   store, err := storage.Open(cfg.DBPath)

4. Create session:
   sessionID = uuid.NewV7().String()
   store.InsertSession(ctx, &types.Session{ID: sessionID, AgentType: "unknown", StartedAt: time.Now()})

5. Start pipeline components:
   enricher := pipeline.NewEnricher(sessionID)
   hub      := stream.NewHub()
   go hub.Run()

6. Start Unix socket server on cfg.SocketPath:
   Listener accepts connections, each connection handled in goroutine:
   - Read newline-delimited JSON as types.ProxyReport
   - Call pipeline.Parse(report) → event
   - Call enricher.Enrich(event)
   - TODO Phase 2: call risk.Evaluate(event), cost.Estimate(event)
   - go store.BatchInsert (via write channel)
   - hub.Broadcast(json.Marshal(event))

7. Start HTTP server on cfg.WSPort (stream.NewServer(store, hub)):
   go http.ListenAndServe(fmt.Sprintf("127.0.0.1:%d", cfg.WSPort), server.Routes())

8. Write ready signal to stdout:
   json.NewEncoder(os.Stdout).Encode(map[string]any{"event": "ready", "ws_port": cfg.WSPort})

9. Handle SIGTERM/SIGINT:
   signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
   <-ctx.Done()
   store.Close()

After:
cd proxy && go build ./cmd/spektr && go build ./cmd/spektr-proxy
Both must compile with zero errors and zero warnings.
```

---

### Task 6 — React UI

```
Read AGENTS.md React rules section.
Read proxy/pkg/types/event.go — you are mirroring these types in TypeScript.
All files are under desktop/src/. All npm commands run from desktop/.

── desktop/src/types/index.ts ───────────────────────────────────────────────
TypeScript mirror of Go types. Field names must match JSON tags exactly (camelCase).

export type Direction      = 'request' | 'response' | 'notification'
export type RiskLevel      = 'none' | 'low' | 'medium' | 'high' | 'critical'
export type MethodCategory = 'tool_call' | 'resource_read' | 'resource_list' |
                             'tool_list' | 'prompt_get' | 'sampling' | 'lifecycle'

export interface RiskFlag {
  rule: string
  level: RiskLevel
  description: string
}

export interface CostEstimate {
  input_tokens: number
  output_tokens: number
  total_usd: number
}

export interface MCPEvent {
  id: string
  session_id: string
  paired_id: string
  server_name: string
  server_pid: number
  transport: 'stdio' | 'http'
  direction: Direction
  message_type: 'request' | 'response' | 'notification' | 'error'
  category: MethodCategory
  method: string
  message_id?: string
  params?: unknown
  result?: unknown
  tool_name?: string
  tool_args?: unknown
  timestamp: string          // ISO 8601
  duration_ms: number
  risk_level: RiskLevel
  risk_flags: RiskFlag[]
  paused: boolean
  cost?: CostEstimate
}

export interface Session {
  id: string
  agent_type: string
  started_at: string
  ended_at?: string
  total_events: number
  total_cost_usd: number
}

── desktop/src/stores/eventStore.ts ─────────────────────────────────────────
import { create } from 'zustand'
import type { MCPEvent } from '@/types'

interface Filters {
  server: string | null
  riskLevel: RiskLevel | null
  search: string
}

interface EventStore {
  events: MCPEvent[]
  addEvent: (e: MCPEvent) => void
  clearEvents: () => void
  filters: Filters
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void
  selectedId: string | null
  selectEvent: (id: string | null) => void
  isConnected: boolean
  setConnected: (v: boolean) => void
}

export const useEventStore = create<EventStore>((set) => ({
  events: [],
  addEvent: (e) => set((s) => ({ events: [e, ...s.events].slice(0, 5000) })),
  clearEvents: () => set({ events: [] }),
  filters: { server: null, riskLevel: null, search: '' },
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  selectedId: null,
  selectEvent: (id) => set({ selectedId: id }),
  isConnected: false,
  setConnected: (v) => set({ isConnected: v }),
}))

// Derived: apply filters. Use this in components via useMemo.
export function applyFilters(events: MCPEvent[], filters: Filters): MCPEvent[] {
  return events.filter((e) => {
    if (filters.server && e.server_name !== filters.server) return false
    if (filters.riskLevel) {
      const order = ['none','low','medium','high','critical']
      if (order.indexOf(e.risk_level) < order.indexOf(filters.riskLevel)) return false
    }
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!e.method.includes(q) && !(e.tool_name ?? '').includes(q)) return false
    }
    return true
  })
}

── desktop/src/hooks/useLiveEvents.ts ───────────────────────────────────────
import { useEffect, useRef } from 'react'
import { useEventStore } from '@/stores/eventStore'
import type { MCPEvent } from '@/types'

export function useLiveEvents() {
  const addEvent    = useEventStore((s) => s.addEvent)
  const setConnected = useEventStore((s) => s.setConnected)
  const retryDelay  = useRef(1000)

  useEffect(() => {
    let ws: WebSocket
    let unmounted = false

    function connect() {
      ws = new WebSocket('ws://localhost:48300/api/events/live')

      ws.onopen = () => {
        setConnected(true)
        retryDelay.current = 1000
      }

      ws.onmessage = (e) => {
        try {
          const event: MCPEvent = JSON.parse(e.data)
          addEvent(event)
          if (event.risk_level === 'critical') {
            new Notification('Spektr — Critical Risk', {
              body: `${event.server_name}: ${event.risk_flags[0]?.description ?? event.method}`,
            })
          }
        } catch { /* malformed message, ignore */ }
      }

      ws.onclose = () => {
        setConnected(false)
        if (!unmounted) {
          setTimeout(connect, retryDelay.current)
          retryDelay.current = Math.min(retryDelay.current * 2, 30_000)
        }
      }
    }

    connect()
    return () => { unmounted = true; ws?.close() }
  }, [])
}

── desktop/src/lib/utils.ts ─────────────────────────────────────────────────
// Server color: deterministic HSL from server name
export function serverColor(name: string): string {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 70%, 55%)`
}

// Risk level → Tailwind class for left border
export const riskBorder: Record<string, string> = {
  none:     'border-l-zinc-300 dark:border-l-zinc-600',
  low:      'border-l-blue-500',
  medium:   'border-l-amber-500',
  high:     'border-l-orange-500',
  critical: 'border-l-red-500 animate-pulse',
}

── desktop/src/components/EventRow.tsx ──────────────────────────────────────
Single row in the virtualized list.
Props: event: MCPEvent, isSelected: boolean, onClick: () => void

Layout (horizontal flex, 40px tall, border-l-[3px]):
  [risk border] [direction badge →/←] [server badge] [method · tool_name (bold)] [→ duration ms] [cost $]

- Direction badge: '→' for request (blue tint), '←' for response (green tint)
- Server badge: background = serverColor(event.server_name), white text, rounded pill
- tool_name shown only if present (category === 'tool_call')
- duration_ms shown only on responses (direction === 'response')
- cost shown only if event.cost?.total_usd > 0
- isSelected: bg-zinc-100 dark:bg-zinc-800

── desktop/src/components/EventTimeline.tsx ─────────────────────────────────
Virtualized list using @tanstack/react-virtual.

Props: events: MCPEvent[]

const parentRef = useRef<HTMLDivElement>(null)
const virtualizer = useVirtualizer({
  count: events.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 40,
  overscan: 10,
})

// Auto-scroll to top when new event arrives and user is already at top
useEffect(() => {
  if (parentRef.current && parentRef.current.scrollTop < 80) {
    parentRef.current.scrollTo({ top: 0 })
  }
}, [events.length])

Return:
<div ref={parentRef} style={{ height: '100%', overflow: 'auto' }}>
  <div style={{ height: virtualizer.getTotalSize() }}>
    {virtualizer.getVirtualItems().map((vItem) => (
      <div key={vItem.key} style={{ position:'absolute', top:0, left:0, width:'100%',
        transform: `translateY(${vItem.start}px)` }}>
        <EventRow event={events[vItem.index]} ... />
      </div>
    ))}
  </div>
</div>

── desktop/src/components/EventDetail.tsx ───────────────────────────────────
Right panel. Shows selected event or empty state ("← Select an event").

Props: eventId: string | null

- Fetch event from local store by id (useEventStore)
- Use shadcn/ui Tabs: Params | Result | Risk | Raw
- Params tab: CodeMirror 6 JSON viewer (read-only, one-dark theme)
  Value: JSON.stringify(event.params, null, 2)
- Result tab: same, for event.result
- Risk tab: if risk_flags.length === 0 show "No risks detected"
  Otherwise: list each RiskFlag with a colored badge matching riskBorder colors
- Raw tab: <pre className="font-mono text-xs"> with raw JSON-RPC

── desktop/src/components/TopBar.tsx ────────────────────────────────────────
Props: none (reads from useEventStore)

Layout: flex justify-between items-center h-12 px-4 border-b

Left:  ⚡ Spektr  (bold, with lightning emoji)
Center: event count · session cost total ($X.XXXX)
Right:  connection dot — green pulse if connected, red if not
        text: "Connected" / "Disconnected"

── desktop/src/components/Sidebar.tsx ───────────────────────────────────────
Props: events: MCPEvent[] (to derive unique server names)

Sections:
1. Servers — unique server names from events, checkbox per server,
   clicking sets filters.server (null if deselecting current)
   Each server name has its color dot (serverColor)

2. Risk filter — radio: All | Medium+ | High+ | Critical only
   Sets filters.riskLevel

3. Search — <input> debounced 200ms, sets filters.search

── desktop/src/App.tsx ──────────────────────────────────────────────────────
import { useMemo } from 'react'
import { useEventStore, applyFilters } from '@/stores/eventStore'
import { useLiveEvents } from '@/hooks/useLiveEvents'
import TopBar from '@/components/TopBar'
import Sidebar from '@/components/Sidebar'
import EventTimeline from '@/components/EventTimeline'
import EventDetail from '@/components/EventDetail'

export default function App() {
  useLiveEvents()  // establish WebSocket connection at app root
  const { events, filters, selectedId } = useEventStore()
  const filtered = useMemo(() => applyFilters(events, filters), [events, filters])

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[220px] flex-shrink-0 border-r overflow-y-auto">
          <Sidebar events={events} />
        </aside>
        <main className="flex-1 overflow-hidden">
          <EventTimeline events={filtered} />
        </main>
        <aside className="w-[380px] flex-shrink-0 border-l overflow-y-auto">
          <EventDetail eventId={selectedId} />
        </aside>
      </div>
    </div>
  )
}

After: cd desktop && npx tsc --noEmit
Must produce zero TypeScript errors.
Then: cd desktop && npm run build
Must produce zero errors.
```

---

### Task 7 — Smoke test end-to-end

```
Goal: prove the full chain works before touching Phase 2.

1. Start the daemon manually:
   echo '{"ws_port":48300,"socket_path":"/tmp/spektr.sock","db_path":"/tmp/test.spektr","log_level":"debug"}' \
   | cd proxy && go run ./cmd/spektr

   Expected stdout: {"event":"ready","ws_port":48300}

2. In a second terminal, start the UI:
   cd desktop && npm run dev
   Open http://localhost:1420 — should show empty timeline, red "Disconnected" dot

   Wait ~1s → dot turns green "Connected"

3. In a third terminal, simulate MCP traffic through the proxy:
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"write_file","arguments":{"path":"/tmp/test.txt","content":"hello"}}}' \
   | cd proxy && go run ./cmd/spektr-proxy --server filesystem --socket /tmp/spektr.sock -- cat

4. Expected result in UI:
   - One row appears in the timeline within 200ms
   - Server badge shows "filesystem" with a color
   - Tool name shows "write_file" in bold
   - Clicking the row shows the params in the Params tab

5. git add -A && git commit -m "feat: phase 1 complete — live MCP interception"
   git push origin main
```

---

## Phase 2 — The Brain (4-5 weeks after Phase 1)

### Task: Risk engine

```
Read docs/ARCHITECTURE.md — Risk levels table.
Read proxy/pkg/types/event.go — RiskLevel, RiskFlag types.
Read proxy/internal/pipeline/ — you will add risk.go here.

Implement proxy/internal/pipeline/risk.go:

type RiskRule struct {
    Name  string
    Level types.RiskLevel
    Desc  string
    Check func(event *types.MCPEvent) bool
}

type RiskEngine struct{ rules []RiskRule }

func NewRiskEngine() *RiskEngine  — loads all default rules

func (e *RiskEngine) Evaluate(event *types.MCPEvent) *types.MCPEvent
  - Runs all rules, collects all matches as RiskFlags
  - Sets RiskLevel to the highest matching level
  - Returns event (modified in place)

Helper constructors (unexported):
  toolNameIs(names ...string) func(*types.MCPEvent) bool
  toolArgContains(field string, subs ...string) func(*types.MCPEvent) bool
  toolPathMatchesAny(field string, patterns ...string) func(*types.MCPEvent) bool
  resourceURIMatchesAny(patterns ...string) func(*types.MCPEvent) bool

Critical rules: shell-destructive-delete, shell-destructive-db, credential-file-write
High rules: env-file-write, sensitive-file-read, file-delete, shell-sudo, git-force-push
Medium rules: external-network-fetch, shell-command, large-file-write, package-install
Low rules: env-var-read, file-write

Write proxy/internal/pipeline/risk_test.go:
  Table-driven. Every rule gets a matching AND a non-matching test case.
  Benchmark: BenchmarkRiskEngine — must show < 1µs per event.

After: cd proxy && go test ./internal/pipeline/... -v -bench=. -count=1
```

---

## Agent orchestration

### Codex session rhythm
```
cd ~/spektr
codex                            # always launch from repo root
```

**One task per session.** Paste the task prompt after Codex has indexed the repo.
When it asks for file permission mode: choose "Edit files".

**Focused task examples:**
```bash
codex "implement proxy/internal/storage/event.go — the event CRUD functions.
Read AGENTS.md and proxy/internal/storage/db.go first."

codex "implement desktop/src/components/EventTimeline.tsx using TanStack Virtual.
Read AGENTS.md React rules first."
```

### What to review manually (never trust Codex blindly)
- `proxy/cmd/spektr-proxy/main.go` goroutines A and B: must contain ONLY scan + report + write
- Any file that touches SQLite: must use the write channel, never direct writes
- Any new Go dependency: reject if it's a web framework, use stdlib
- TypeScript: no `any`, no `localStorage`, no `useEffect` for data fetching

### Commit format
```
feat(proxy): implement storage event queries
feat(ui): implement virtualized event timeline
fix(proxy): prevent blocking write in proxy goroutine B
test(pipeline): add risk engine benchmark
docs: update ARCHITECTURE with session replay API
```