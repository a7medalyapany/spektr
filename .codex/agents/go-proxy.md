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
