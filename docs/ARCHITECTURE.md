# Spektr — Architecture Reference

> Canonical reference. Agents read this before touching IPC, storage, or pipeline code.

---

## System overview

Spektr runs as three OS-level processes:

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
restored on daemon exit (including SIGTERM, SIGKILL recovery via Tauri shell).

---

## IPC protocol specification

### 1. Daemon startup (Tauri → Go via stdin)
```json
{
  "proxy_port": 8080,
  "ws_port": 48300,
  "socket_path": "/tmp/spektr.sock",
  "db_path": "/Users/user/.spektr/sessions/session-<uuid>.spektr",
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
{"server_name":"filesystem","direction":"request","raw":"<base64 JSON-RPC>","ts":1746400000000}
```

### 4. WebSocket live stream (Daemon → React)
Full `MCPEvent` JSON objects, one per message.

---

## Event pipeline (in order)

```
Raw bytes arrive from spektr-proxy via Unix socket
    │
    ▼
parser.go        → parse JSON-RPC, classify method, extract tool name/args
    │
    ▼
enricher.go      → add session ID, server name, correlate request↔response (sync.Map),
                   compute duration_ms for responses
    │
    ▼
risk.go          → run all RiskRules, set risk_level and risk_flags
    │
    ▼
cost.go          → estimate input/output tokens, compute cost_usd
    │
    ▼
emitter.go       → fan-out:
                   1. ring buffer (in-memory, cap 5000, non-blocking)
                   2. WebSocket hub broadcast (non-blocking)
                   3. SQLite write channel (buffered 10k, single writer goroutine)
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

| Level | Color | Auto-pause? | Examples |
|-------|-------|-------------|---------|
| none | — | No | tools/list, resources/list |
| low | Blue | No | File read (own project) |
| medium | Yellow | No | External HTTP fetch, shell command |
| high | Orange | No | .env write, file delete, sudo |
| critical | Red | **YES** | rm -rf, DROP TABLE, SSH key write |

Auto-pause: spektr-proxy blocks forwarding and waits for user approval via
reverse Unix socket message (timeout: 30s → auto-deny).

---

## REST API endpoints (all on :48300)

```
GET  /api/sessions
GET  /api/sessions/{id}
GET  /api/sessions/{id}/events          ?server=&risk=&category=&limit=100&offset=0
GET  /api/sessions/{id}/events/{eid}
GET  /api/sessions/{id}/timeline
GET  /api/sessions/{id}/cost
POST /api/sessions/{id}/replay          body: {"speed": 5.0}
POST /api/events/{id}/approve
POST /api/events/{id}/deny
GET  /api/export/{id}                   ?format=json|ndjson
DELETE /api/sessions/{id}
```

All responses: `Content-Type: application/json`, standard `{"data": ..., "error": null}` envelope.
