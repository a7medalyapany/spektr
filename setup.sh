#!/bin/bash
# ============================================================
# Spektr — Full Local Dev Setup (EndeavourOS / Arch Linux)
# Run from empty dir: mkdir ~/spektr && cd ~/spektr && bash setup.sh
# Prerequisites: go 1.26+, node v22+, rustup stable, git, gh
# ============================================================

set -e

echo ""
echo "⚡ Spektr workspace setup"
echo ""

# ── 0. Prerequisites ─────────────────────────────────────────

echo "▸ Checking prerequisites..."
fail=0
for cmd in go node npm cargo git; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "  ✗ $cmd not found"; fail=1; }
done
[ $fail -eq 1 ] && echo "" && echo "Install missing tools then rerun." && exit 1

echo "  Go:   $(go version | awk '{print $3}')"
echo "  Node: $(node --version)"
echo "  Rust: $(rustc --version | awk '{print $2}')"
echo ""

# ── 1. Git ───────────────────────────────────────────────────

echo "▸ Initialising git..."
git init

cat > .gitignore << 'EOF'
# Go
proxy/bin/
# Tauri / Rust
desktop/src-tauri/target/
desktop/src-tauri/binaries/*
!desktop/src-tauri/binaries/.gitkeep
# Node
desktop/node_modules/
desktop/dist/
# Runtime
~/.spektr/
# IDE
.idea/
*.swp
.DS_Store
EOF

# ── 2. Directory skeleton ────────────────────────────────────

echo "▸ Creating workspace layout..."

# proxy/ — Go module root
mkdir -p \
  proxy/cmd/spektr \
  proxy/cmd/spektr-proxy \
  proxy/internal/config \
  proxy/internal/interceptor \
  proxy/internal/pipeline \
  proxy/internal/storage/migrations \
  proxy/internal/stream \
  proxy/internal/socket \
  proxy/pkg/types

# desktop/ — Tauri app root (kept empty for npm create tauri-app)
mkdir -p desktop

# meta
mkdir -p docs .claude/agents .github/workflows

# ── 3. Go module ─────────────────────────────────────────────

echo "▸ Setting up Go module..."
cd proxy

go mod init github.com/spektr-dev/spektr

# Core dependencies
go get modernc.org/sqlite@latest
go get github.com/google/uuid@latest
go get github.com/gorilla/websocket@latest
go get github.com/lqqyt2423/go-mitmproxy@latest

# Dev dependencies
go get -tool golang.org/x/tools/cmd/goimports@latest

go mod tidy


# Stub entrypoints
cat > cmd/spektr/main.go << 'EOF'
package main

import (
	"encoding/json"
	"log/slog"
	"os"
)

type DaemonConfig struct {
	WSPort     int    `json:"ws_port"`
	SocketPath string `json:"socket_path"`
	DBPath     string `json:"db_path"`
	LogLevel   string `json:"log_level"`
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)))

	var cfg DaemonConfig
	if err := json.NewDecoder(os.Stdin).Decode(&cfg); err != nil {
		slog.Error("failed to read config", "err", err)
		os.Exit(1)
	}

	slog.Info("spektr daemon starting", "ws_port", cfg.WSPort)
	// TODO Phase 1: start socket server, pipeline, WebSocket server
	select {}
}
EOF

cat > cmd/spektr-proxy/main.go << 'EOF'
package main

import (
	"flag"
	"log/slog"
	"os"
)

func main() {
	server := flag.String("server", "", "MCP server name")
	socket := flag.String("socket", "/tmp/spektr.sock", "daemon Unix socket path")
	flag.Parse()

	args := flag.Args()
	if len(args) == 0 {
		slog.Error("no real server command after --")
		os.Exit(1)
	}

	slog.Info("spektr-proxy", "server", *server, "socket", *socket, "cmd", args[0])
	// TODO Phase 1: spawn real server, intercept stdio, report to daemon
}
EOF

cat > pkg/types/event.go << 'EOF'
package types

import (
	"encoding/json"
	"time"
)

type Direction      string
type Transport      string
type MessageType    string
type MethodCategory string
type RiskLevel      string

const (
	DirectionRequest      Direction = "request"
	DirectionResponse     Direction = "response"
	DirectionNotification Direction = "notification"

	TransportStdio Transport = "stdio"
	TransportHTTP  Transport = "http"

	RiskNone     RiskLevel = "none"
	RiskLow      RiskLevel = "low"
	RiskMedium   RiskLevel = "medium"
	RiskHigh     RiskLevel = "high"
	RiskCritical RiskLevel = "critical"

	CategoryToolCall     MethodCategory = "tool_call"
	CategoryResourceRead MethodCategory = "resource_read"
	CategoryResourceList MethodCategory = "resource_list"
	CategoryToolList     MethodCategory = "tool_list"
	CategoryPromptGet    MethodCategory = "prompt_get"
	CategorySampling     MethodCategory = "sampling"
	CategoryLifecycle    MethodCategory = "lifecycle"
)

// MCPEvent is the canonical type for every intercepted MCP message.
type MCPEvent struct {
	ID        string    `json:"id"`
	SessionID string    `json:"session_id"`
	PairedID  string    `json:"paired_id"`

	ServerName string    `json:"server_name"`
	Transport  Transport `json:"transport"`

	Direction   Direction        `json:"direction"`
	Category    MethodCategory   `json:"category"`
	Method      string           `json:"method"`
	MessageID   *json.RawMessage `json:"message_id,omitempty"`
	Params      json.RawMessage  `json:"params,omitempty"`
	Result      json.RawMessage  `json:"result,omitempty"`
	Error       *MCPError        `json:"error,omitempty"`

	ToolName string          `json:"tool_name,omitempty"`
	ToolArgs json.RawMessage `json:"tool_args,omitempty"`

	Timestamp  time.Time `json:"timestamp"`
	DurationMs int64     `json:"duration_ms"`

	RiskLevel RiskLevel  `json:"risk_level"`
	RiskFlags []RiskFlag `json:"risk_flags"`
	Paused    bool       `json:"paused"`

	Cost *CostEstimate `json:"cost,omitempty"`
}

type MCPError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

type RiskFlag struct {
	Rule        string    `json:"rule"`
	Level       RiskLevel `json:"level"`
	Description string    `json:"description"`
}

type CostEstimate struct {
	InputTokens  int     `json:"input_tokens"`
	OutputTokens int     `json:"output_tokens"`
	TotalUSD     float64 `json:"total_usd"`
}

type Session struct {
	ID           string     `json:"id"`
	AgentType    string     `json:"agent_type"`
	StartedAt    time.Time  `json:"started_at"`
	EndedAt      *time.Time `json:"ended_at,omitempty"`
	TotalEvents  int        `json:"total_events"`
	TotalCostUSD float64    `json:"total_cost_usd"`
}

// ProxyReport is what spektr-proxy sends to the daemon via Unix socket.
type ProxyReport struct {
	ServerName  string    `json:"server_name"`
	Direction   Direction `json:"direction"`
	Raw         []byte    `json:"raw"`
	TimestampMS int64     `json:"ts"`
}

// DaemonConfig is the JSON the Tauri shell sends to the daemon via stdin on startup.
type DaemonConfig struct {
	WSPort     int    `json:"ws_port"`
	SocketPath string `json:"socket_path"`
	DBPath     string `json:"db_path"`
	LogLevel   string `json:"log_level"`
}
EOF

go build ./...
echo "  ✓ Go module ready"
cd ..

# ── 4. Tauri + React (in empty desktop/) ─────────────────────

echo "▸ Setting up Tauri v2 + React in desktop/..."

# Install Tauri CLI if missing
if ! cargo tauri --version >/dev/null 2>&1; then
  echo "  Installing Tauri CLI (this takes a few minutes)..."
  cargo install tauri-cli --version "^2" --locked
fi

cd desktop

npm create tauri-app@latest . -- \
  --template react-ts \
  --manager npm \
  --yes

npm install \
  zustand \
  @tanstack/react-query \
  @tanstack/react-virtual \
  @tanstack/react-router \
  @codemirror/view \
  @codemirror/state \
  @codemirror/lang-json \
  @codemirror/theme-one-dark \
  recharts \
  lucide-react \
  clsx \
  tailwind-merge

npm install -D \
  tailwindcss \
  @tailwindcss/vite

# shadcn/ui
npx shadcn@latest init --yes --base-color slate 2>/dev/null || true

# binaries placeholder
mkdir -p src-tauri/binaries
touch src-tauri/binaries/.gitkeep

cd ..
echo "  ✓ desktop/ ready"

# ── 5. Root Makefile ─────────────────────────────────────────

cat > Makefile << 'EOF'
.PHONY: dev build test proxy-build proxy-test ui-check clean

PROXY_DIR   := proxy
DESKTOP_DIR := desktop
BINS        := $(DESKTOP_DIR)/src-tauri/binaries

dev:
	cd $(DESKTOP_DIR) && npm run tauri dev

ui-dev:
	cd $(DESKTOP_DIR) && npm run dev

proxy-build:
	cd $(PROXY_DIR) && CGO_ENABLED=0 go build -ldflags="-s -w" \
	  -o ../$(BINS)/spektr        ./cmd/spektr
	cd $(PROXY_DIR) && CGO_ENABLED=0 go build -ldflags="-s -w" \
	  -o ../$(BINS)/spektr-proxy  ./cmd/spektr-proxy

proxy-test:
	cd $(PROXY_DIR) && go test -race ./...

proxy-lint:
	cd $(PROXY_DIR) && go vet ./...

ui-check:
	cd $(DESKTOP_DIR) && npx tsc --noEmit

test: proxy-test ui-check

build: proxy-build
	cd $(DESKTOP_DIR) && npm run tauri build

clean:
	rm -rf $(DESKTOP_DIR)/dist $(DESKTOP_DIR)/src-tauri/target
	find $(PROXY_DIR) -name '*.test' -delete
EOF

# ── 6. Claude agent files ────────────────────────────────────

cat > .claude/agents/go-pipeline.md << 'EOF'
---
name: go-pipeline
description: Implements Go pipeline stages in proxy/internal/pipeline/. Parser, enricher,
  risk engine, cost estimator, emitter. Knows MCPEvent type cold.
---
Read proxy/pkg/types/event.go first. All pipeline functions are pure: take *types.MCPEvent, return *types.MCPEvent.
Write table-driven tests in _test.go alongside each function.
NEVER add I/O to pipeline functions.
Risk engine must process one event in < 0.1ms.
EOF

cat > .claude/agents/go-proxy.md << 'EOF'
---
name: go-proxy
description: Implements stdio interception in proxy/cmd/spektr-proxy/ and
  proxy/internal/interceptor/. Critical hot-path code — every line matters.
---
This code is on the agent's critical path. Rules:
- Unix socket sends: 1ms write deadline, fire-and-forget. Daemon down = proxy keeps running.
- bufio.Scanner for stdin and server stdout — one goroutine each.
- sync.WaitGroup to join both goroutines cleanly.
- Forward bytes as: write(append(line, '\n'))
- ZERO parsing in the forwarding goroutines. Raw bytes only.
Test: echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | go run ./cmd/spektr-proxy -- cat
EOF

cat > .claude/agents/react-ui.md << 'EOF'
---
name: react-ui
description: Implements React components in desktop/src/. Event timeline, detail panel,
  session list, risk UI, WebSocket hook. All frontend features.
---
Stack: React 19, Vite 6, Zustand v5, TanStack Query v5, TanStack Virtual v3, shadcn/ui, Tailwind v4.
- Event list MUST use TanStack Virtual. Never render all events.
- WebSocket connection lives in desktop/src/hooks/useLiveEvents.ts only.
- Historical data = TanStack Query pointing to http://localhost:48300/api
- Server badge color = HSL(hash(serverName) % 360, 70%, 55%)
- Risk colors: none=zinc, low=blue-500, medium=amber-500, high=orange-500, critical=red-500+animate-pulse
- No localStorage. State = Zustand or TanStack Query.
EOF

# ── 7. README ────────────────────────────────────────────────

cat > README.md << 'EOF'
# ⚡ Spektr

> The open-source debugger for AI coding agents.

Spektr intercepts every MCP tool call your AI agent makes — in real-time.
See file writes, shell commands, API calls, and risk alerts as they happen.

**Free. Local. Open source.**

## Quick start

```bash
# Prerequisites: Go 1.26+, Node v22+, Rust stable (EndeavourOS: see docs/SETUP_ARCH.md)
make dev
```

## Architecture

→ [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Roadmap

- **Phase 1** — Core interception: stdio proxy, live timeline UI ← *current*
- **Phase 2** — Risk engine, cost tracking, session replay
- **Phase 3** — CLI, session diff, custom rules
EOF

# ── Done ─────────────────────────────────────────────────────

echo ""
echo "✅ Done. Workspace layout:"
echo ""
echo "  proxy/     → Go 1.26 module  (go test ./... etc.)"
echo "  desktop/   → Tauri v2 + React  (npm run tauri dev etc.)"
echo "  Makefile   → orchestrates both from repo root"
echo ""
echo "Next steps:"
echo "  1. make proxy-test      verify Go compiles and tests pass"
echo "  2. make dev             run full app in dev mode"
echo "  3. gh repo create spektr --public --source=. --remote=origin --push"
echo ""
