# Spektr — Architecture Reference

> Canonical reference. Agents read this before touching IPC, storage, or pipeline code.

---

## System overview

```
AI Agent (Claude Code / Cursor)
    │
    │  JSON-RPC over stdio (agent spawns MCP servers as subprocesses)
    │
    ▼
spektr-proxy  ←─── one per MCP server, ~3 MB Go binary
    │               Transparent stdio pipe
    │               Non-blocking report via Unix socket
    │               ┌────────────────────────────────┐
    ├──────────────►│  Spektr Daemon (Go)             │
    │  Unix socket  │  Pipeline: parse→enrich→risk   │
    │               │  SQLite storage (modernc)       │
    ▼               │  WebSocket :48300/stream        │
Real MCP Server     │  REST API  :48300/api           │
(unchanged)         └───────────────┬────────────────┘
                                    │ WebSocket
                                    ▼
                    ┌───────────────────────────────┐
                    │  Tauri v2 Shell (Rust)         │
                    │  + React 19 / Vite 6 UI        │
                    │  Live timeline • Risk alerts   │
                    │  Session replay • Cost tracker │
                    └───────────────────────────────┘
```

---

## The config injection trick

**How Spektr intercepts without touching the agent:**

Spektr patches the agent's MCP config file before the agent starts:
- Claude Code: `~/.claude/claude_desktop_config.json`
- Cursor: `~/.cursor/mcp.json`
- Windsurf: `~/.windsurf/mcp.json`

Each server command is wrapped with `spektr-proxy`:

```json
// BEFORE
{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home"] }

// AFTER (Spektr patches)
{ "command": "spektr-proxy", "args": ["--server", "filesystem", "--socket", "/tmp/spektr.sock",
  "--", "npx", "-y", "@modelcontextprotocol/server-filesystem", "/home"] }
```

Original config is backed up to `~/.spektr/config-backup.json` and atomically
restored on daemon exit (including SIGTERM/SIGKILL recovery via Tauri shell).

---

## How stdio interception works

This is the core mechanism of `spektr-proxy`. Understanding it is required before
touching any code in `proxy/cmd/spektr-proxy/` or `proxy/internal/interceptor/`.

### The process model

When the AI agent reads its patched config and spawns an MCP server, it actually
spawns `spektr-proxy`. The proxy then spawns the real MCP server as its own child.
This creates an exact chain:

```
AI Agent process
    │  writes JSON-RPC to subprocess stdin
    ▼
spektr-proxy process          ← you are here
    │  Goroutine A: reads own stdin, forwards to real server stdin
    │  Goroutine B: reads real server stdout, forwards to own stdout
    │
    ├─────────────────────────────────────► Spektr Daemon
    │   Unix socket, fire-and-forget            (non-blocking, 1ms timeout)
    │
    ▼
Real MCP Server process
    (filesystem / github / bash — unmodified, unaware of proxy)
```

### The two-goroutine model

`spektr-proxy` runs exactly two goroutines for the lifetime of the session:

**Goroutine A — Agent → Server (request direction)**
```
bufio.Scanner reads os.Stdin line by line
    → copy line bytes to ProxyReport{Direction: request}
    → client.ReportAsync(report)     // non-blocking, 1ms timeout
    → serverIn.Write(line + '\n')    // forward to real server
```

**Goroutine B — Server → Agent (response direction)**
```
bufio.Scanner reads cmd.StdoutPipe() line by line
    → copy line bytes to ProxyReport{Direction: response}
    → client.ReportAsync(report)     // non-blocking, 1ms timeout
    → os.Stdout.Write(line + '\n')   // forward to agent
```

Both goroutines run concurrently. A `sync.WaitGroup` joins them. A shared
`context.WithCancel` ensures that when either goroutine exits (agent closed,
server crashed), the other is signalled to stop and `cmd.Wait()` is called.

### The non-blocking constraint (CRITICAL)

The proxy is on the AI agent's critical path. If the proxy blocks, the agent blocks.

Rule: **Goroutines A and B must contain only: Scan(), ReportAsync(), Write().**

`ReportAsync` enforces the non-blocking contract internally:
```go
conn.SetWriteDeadline(time.Now().Add(1 * time.Millisecond))
conn.Write(data)
// on timeout or error: log debug, return immediately — never block caller
```

If the Spektr daemon is down, `ReportAsync` silently no-ops. The proxy continues
forwarding traffic. The agent never knows anything went wrong.

### Wire format

Each `ProxyReport` is sent as a single line of JSON (newline-delimited) over the
Unix socket:

```go
type ProxyReport struct {
    ServerName  string    `json:"server_name"`
    Direction   Direction `json:"direction"`
    Raw         []byte    `json:"raw"`         // base64 when JSON-encoded
    TimestampMS int64     `json:"timestamp_ms"`
}
```

Note: Go marshals `[]byte` as base64 automatically. The daemon unmarshals and gets
raw bytes back — no manual base64 encoding/decoding needed in application code.

### Shutdown sequence

```
Either goroutine's scanner returns false (EOF or error)
    → deferred cancel() fires
    → context cancelled
    → background goroutine sends os.Interrupt to real server process
    → real server exits
    → goroutine B's scanner hits EOF and exits
    → WaitGroup.Done() for both goroutines
    → wg.Wait() returns
    → cmd.Wait() cleans up the real server process
    → client.Close() flushes Unix socket
    → main() returns
```

---

## IPC protocol specification

### 1. Daemon startup (Tauri → Go via stdin)

```json
{
  "proxy_port": 8080,
  "ws_port": 48300,
  "socket_path": "/tmp/spektr.sock",
  "db_path": "/home/user/.spektr/sessions/session-<uuid>.spektr",
  "log_level": "info"
}
```

### 2. Daemon events (Go → Tauri via stdout JSON lines)

```json
{"event": "ready", "ws_port": 48300}
{"event": "error", "message": "port conflict on 48300"}
{"event": "session_started", "session_id": "<uuid>"}
```

### 3. Proxy → Daemon (Unix socket, newline-delimited JSON)

```json
{"server_name":"filesystem","direction":"request","raw":"<base64 JSON-RPC>","timestamp_ms":1746400000000}
```

Field reference:
- `server_name` — matches the `--server` flag passed to spektr-proxy
- `direction` — `"request"` (agent→server) or `"response"` (server→agent)
- `raw` — base64-encoded raw JSON-RPC line (Go []byte → base64 automatically)
- `timestamp_ms` — Unix timestamp in milliseconds, captured at interception point

### 4. WebSocket live stream (Daemon → React)

Full `MCPEvent` JSON objects, one per WebSocket message. The `raw_payload` field
is excluded (`json:"-"` tag) to keep message size small.

---

## Event pipeline (in order)

```
Raw bytes arrive from spektr-proxy via Unix socket
    │
    ▼
parser.go        → parse JSON-RPC, classify method, extract tool name/args
    │
    ▼
enricher.go      → add session ID, correlate request↔response (sync.Map),
                   compute duration_ms for responses, assign UUID v7
    │
    ▼
risk.go          → run all RiskRules, set risk_level and risk_flags   [Phase 2]
    │
    ▼
cost.go          → estimate input/output tokens, compute cost_usd     [Phase 2]
    │
    ▼
emitter           → fan-out:
                   1. WebSocket hub broadcast (non-blocking)
                   2. SQLite write channel (buffered 10k, single writer goroutine)

                   Phase 1: fan-out logic is inlined in the daemon's socket handler.
                   Phase 2: extracted into proxy/internal/pipeline/emitter.go.
```

---

## SQLite write pattern (MUST follow)

```go
// Only this goroutine writes to SQLite — ever.
func (s *Store) runWriter(ctx context.Context) {
    ticker := time.NewTicker(50 * time.Millisecond)
    var batch []*types.MCPEvent

    for {
        select {
        case event := <-s.writeCh:
            batch = append(batch, event)
            if len(batch) >= 200 {
                s.flushBatch(batch)
                batch = batch[:0]
            }
        case <-ticker.C:
            if len(batch) > 0 {
                s.flushBatch(batch)
                batch = batch[:0]
            }
        case <-ctx.Done():
            s.flushBatch(batch)
            return
        }
    }
}
```

Batch inserts use a single `BEGIN TRANSACTION ... COMMIT` block.
Never call `flushBatch` from any other goroutine.

---

## Risk levels and auto-pause

| Level    | Color  | Auto-pause? | Examples                              |
|----------|--------|-------------|---------------------------------------|
| none     | —      | No          | tools/list, resources/list            |
| low      | Blue   | No          | File read (own project)               |
| medium   | Yellow | No          | External HTTP fetch, shell command    |
| high     | Orange | No          | .env write, file delete, sudo         |
| critical | Red    | **YES**     | rm -rf, DROP TABLE, SSH key write     |

Auto-pause: spektr-proxy blocks forwarding and waits for user approval via
reverse Unix socket message (timeout: 30s → auto-deny).

---

## REST API endpoints (all on :48300)

Phase 1 endpoints (implement in Task 5):

```
GET    /api/sessions
GET    /api/sessions/{id}
GET    /api/sessions/{id}/events       ?server=&risk=&category=&limit=100&offset=0
GET    /api/sessions/{id}/events/{eid}
GET    /api/events/live                (WebSocket upgrade)
POST   /api/events/{id}/approve
POST   /api/events/{id}/deny
DELETE /api/sessions/{id}
```

Phase 2 endpoints (do not implement in Phase 1):

```
GET  /api/sessions/{id}/timeline       (Phase 2)
GET  /api/sessions/{id}/cost           (Phase 2)
POST /api/sessions/{id}/replay         (Phase 2)  body: {"speed": 5.0}
GET  /api/export/{id}                  (Phase 2)  ?format=json|ndjson
```

All responses use this envelope:
```json
{"data": <payload>, "error": null}
{"data": null, "error": "message"}
```