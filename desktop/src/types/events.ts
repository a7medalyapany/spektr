export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
  [key: string]: JsonValue;
};

export type EventDirection = "request" | "response" | "notification";
export type Transport = "stdio" | "http";
export type MessageType = "request" | "response" | "notification" | "error";
export type MethodCategory =
  | "tool_call"
  | "resource_read"
  | "resource_list"
  | "tool_list"
  | "prompt_get"
  | "sampling"
  | "lifecycle";
export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
}

export interface BackendCostEstimate {
  input_tokens: number;
  output_tokens: number;
  total_usd: number;
}

export interface MCPError {
  code: number;
  message: string;
  data?: JsonValue;
}

export interface BackendMCPError {
  code: number;
  message: string;
  data?: JsonValue;
}

export interface RiskFlag {
  rule: string;
  level: RiskLevel;
  description: string;
}

export interface BackendRiskFlag {
  rule: string;
  level: RiskLevel;
  description: string;
}

export interface MCPEvent {
  id: string;
  sessionId: string;
  pairedId: string | null;
  serverName: string;
  serverPid: number;
  transport: Transport;
  direction: EventDirection;
  messageType: MessageType;
  category: MethodCategory;
  method: string;
  messageId: JsonValue | null;
  params: JsonValue | null;
  result: JsonValue | null;
  error: MCPError | null;
  toolName: string | null;
  toolArgs: JsonValue | null;
  timestamp: string;
  durationMs: number;
  riskLevel: RiskLevel;
  riskFlags: ReadonlyArray<RiskFlag>;
  paused: boolean;
  cost: CostEstimate | null;
}

export interface BackendMCPEvent {
  id: string;
  session_id: string;
  paired_id?: string;
  server_name: string;
  server_pid: number;
  transport: Transport;
  direction: EventDirection;
  message_type: MessageType;
  category: MethodCategory;
  method: string;
  message_id?: JsonValue | null;
  params?: JsonValue | null;
  result?: JsonValue | null;
  error?: BackendMCPError | null;
  tool_name?: string;
  tool_args?: JsonValue | null;
  timestamp: string;
  duration_ms?: number;
  risk_level: RiskLevel;
  risk_flags?: ReadonlyArray<BackendRiskFlag>;
  paused?: boolean;
  cost?: BackendCostEstimate | null;
}

export type IncomingMCPEvent = MCPEvent | BackendMCPEvent;

export function isBackendMCPEvent(event: IncomingMCPEvent): event is BackendMCPEvent {
  return "session_id" in event;
}

export function normalizeMCPEvent(event: IncomingMCPEvent): MCPEvent {
  if (!isBackendMCPEvent(event)) {
    return event;
  }

  return {
    id: event.id,
    sessionId: event.session_id,
    pairedId: event.paired_id ?? null,
    serverName: event.server_name,
    serverPid: event.server_pid,
    transport: event.transport,
    direction: event.direction,
    messageType: event.message_type,
    category: event.category,
    method: event.method,
    messageId: event.message_id ?? null,
    params: event.params ?? null,
    result: event.result ?? null,
    error: event.error ?? null,
    toolName: event.tool_name ?? null,
    toolArgs: event.tool_args ?? null,
    timestamp: event.timestamp,
    durationMs: event.duration_ms ?? 0,
    riskLevel: event.risk_level,
    riskFlags: event.risk_flags ?? [],
    paused: event.paused ?? false,
    cost: event.cost
      ? {
          inputTokens: event.cost.input_tokens,
          outputTokens: event.cost.output_tokens,
          totalUsd: event.cost.total_usd,
        }
      : null,
  };
}
