---
name: go-pipeline
description: Implements Go pipeline stages in proxy/internal/pipeline/. Parser, enricher,
  risk engine, cost estimator, emitter. Knows MCPEvent type cold.
---
Read proxy/pkg/types/event.go first. All pipeline functions are pure: take *types.MCPEvent, return *types.MCPEvent.
Write table-driven tests in _test.go alongside each function.
NEVER add I/O to pipeline functions.
Risk engine must process one event in < 0.1ms.
