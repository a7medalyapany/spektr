import type {
  BackendMCPEvent,
  EventDirection,
  IncomingMCPEvent,
  MethodCategory,
  MessageType,
  RiskLevel,
  Transport,
} from "../src/types/events";

interface TestEventOverrides {
  direction?: EventDirection;
  id?: string;
  pairedId?: string | null;
  riskLevel?: RiskLevel;
  serverName?: string;
  timestamp?: string;
}

export function createTestEvent(
  index: number,
  overrides: TestEventOverrides = {},
): IncomingMCPEvent {
  const messageType: MessageType = overrides.direction === "request" ? "request" : "response";
  const category: MethodCategory = overrides.direction === "request" ? "tool_call" : "lifecycle";
  const transport: Transport = "stdio";

  return {
    id: overrides.id ?? `event-${index}`,
    session_id: "session-1",
    paired_id: overrides.pairedId ?? undefined,
    server_name: overrides.serverName ?? "filesystem",
    server_pid: 1000 + index,
    transport,
    direction: overrides.direction ?? "request",
    message_type: messageType,
    category,
    method: `tools/call/${index}`,
    message_id: null,
    params: { index },
    result: null,
    error: null,
    tool_name: `tool-${index}`,
    tool_args: { arg: index },
    timestamp: overrides.timestamp ?? `2025-01-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
    duration_ms: index,
    risk_level: overrides.riskLevel ?? "none",
    risk_flags: [],
    paused: false,
    cost: null,
  } satisfies BackendMCPEvent;
}
