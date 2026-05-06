# Spektr

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
