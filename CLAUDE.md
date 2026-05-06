# Spektr — Claude Code Instructions

@AGENTS.md

---

## Claude-specific additions

### Context engineering notes
- Read `docs/ARCHITECTURE.md` before touching any IPC code
- Read `docs/DATA_MODEL.md` before creating or modifying any Go types
- When working on the pipeline, read `internal/pipeline/` top-down: parser → enricher → risk → cost → emitter
- When context hits 70%, run `/compact` before continuing

### Session hygiene
- Work in focused sessions: one session per package or feature
- At the end of each session, summarize what changed and why → append to `docs/DECISIONS.md`
- If you're unsure about a design decision, check `docs/ARCHITECTURE.md` ADR section first

### Go style in this repo
- Use table-driven tests with `t.Run`
- Prefer `errors.Is` / `errors.As` over string matching
- All exported functions have godoc comments
- Use `context.Context` as first arg on all blocking operations
- Goroutines must be either waited on (sync.WaitGroup) or fire-and-forget with documented reason

### React style in this repo
- One component per file, named same as file
- Props interfaces defined in the same file, named `{Component}Props`
- Custom hooks live in `src/hooks/`, named `use{Feature}.ts`
- Zustand stores live in `src/stores/`, one store per domain

### IMPORTANT — hot path rule
When modifying anything in `proxy/internal/interceptor/stdio.go` or
`proxy/cmd/spektr-proxy/main.go`, you MUST verify that the modification
does not add any synchronous blocking call. These files are on the agent's
critical path. Any blocking here directly degrades the AI agent's performance.

### When to ask vs. proceed
- **Proceed without asking:** file formatting, test writing, docs, type definitions
- **Ask first:** changes to IPC protocol, SQLite schema migrations, Tauri capability grants
