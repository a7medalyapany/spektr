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

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isJsonValue(value: unknown): value is JsonValue {
  if (isJsonPrimitive(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTransport(value: unknown): value is Transport {
  return value === "stdio" || value === "http";
}

function isEventDirection(value: unknown): value is EventDirection {
  return value === "request" || value === "response" || value === "notification";
}

function isMessageType(value: unknown): value is MessageType {
  return value === "request" || value === "response" || value === "notification" || value === "error";
}

function isMethodCategory(value: unknown): value is MethodCategory {
  return (
    value === "tool_call" ||
    value === "resource_read" ||
    value === "resource_list" ||
    value === "tool_list" ||
    value === "prompt_get" ||
    value === "sampling" ||
    value === "lifecycle"
  );
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return value === "none" || value === "low" || value === "medium" || value === "high" || value === "critical";
}

function parseBackendRiskFlag(value: unknown): BackendRiskFlag {
  if (!isRecord(value)) {
    throw new Error("live event risk flag must be an object");
  }

  if (typeof value.rule !== "string" || !isRiskLevel(value.level) || typeof value.description !== "string") {
    throw new Error("live event risk flag shape is invalid");
  }

  return {
    rule: value.rule,
    level: value.level,
    description: value.description,
  };
}

function parseBackendCostEstimate(value: unknown): BackendCostEstimate {
  if (!isRecord(value)) {
    throw new Error("live event cost must be an object");
  }

  if (
    typeof value.input_tokens !== "number" ||
    typeof value.output_tokens !== "number" ||
    typeof value.total_usd !== "number"
  ) {
    throw new Error("live event cost shape is invalid");
  }

  return {
    input_tokens: value.input_tokens,
    output_tokens: value.output_tokens,
    total_usd: value.total_usd,
  };
}

function parseBackendError(value: unknown): BackendMCPError {
  if (!isRecord(value)) {
    throw new Error("live event error must be an object");
  }

  if (typeof value.code !== "number" || typeof value.message !== "string") {
    throw new Error("live event error shape is invalid");
  }

  if (value.data !== undefined && !isJsonValue(value.data)) {
    throw new Error("live event error data must be valid JSON");
  }

  return {
    code: value.code,
    message: value.message,
    data: value.data,
  };
}

export function parseBackendMCPEvent(value: unknown): BackendMCPEvent {
  if (!isRecord(value)) {
    throw new Error("live event payload must be an object");
  }

  if (
    typeof value.id !== "string" ||
    typeof value.session_id !== "string" ||
    typeof value.server_name !== "string" ||
    typeof value.server_pid !== "number" ||
    !isTransport(value.transport) ||
    !isEventDirection(value.direction) ||
    !isMessageType(value.message_type) ||
    !isMethodCategory(value.category) ||
    typeof value.method !== "string" ||
    typeof value.timestamp !== "string" ||
    !isRiskLevel(value.risk_level)
  ) {
    throw new Error("live event payload shape is invalid");
  }

  if (value.message_id !== undefined && value.message_id !== null && !isJsonValue(value.message_id)) {
    throw new Error("live event message_id must be valid JSON");
  }

  if (value.params !== undefined && value.params !== null && !isJsonValue(value.params)) {
    throw new Error("live event params must be valid JSON");
  }

  if (value.result !== undefined && value.result !== null && !isJsonValue(value.result)) {
    throw new Error("live event result must be valid JSON");
  }

  if (value.tool_args !== undefined && value.tool_args !== null && !isJsonValue(value.tool_args)) {
    throw new Error("live event tool_args must be valid JSON");
  }

  if (value.paired_id !== undefined && typeof value.paired_id !== "string") {
    throw new Error("live event paired_id must be a string");
  }

  if (value.tool_name !== undefined && typeof value.tool_name !== "string") {
    throw new Error("live event tool_name must be a string");
  }

  if (value.duration_ms !== undefined && typeof value.duration_ms !== "number") {
    throw new Error("live event duration_ms must be a number");
  }

  if (value.paused !== undefined && typeof value.paused !== "boolean") {
    throw new Error("live event paused must be a boolean");
  }

  let riskFlags: ReadonlyArray<BackendRiskFlag> | undefined;
  if (value.risk_flags !== undefined) {
    if (!Array.isArray(value.risk_flags)) {
      throw new Error("live event risk_flags must be an array");
    }
    riskFlags = value.risk_flags.map(parseBackendRiskFlag);
  }

  return {
    id: value.id,
    session_id: value.session_id,
    paired_id: value.paired_id,
    server_name: value.server_name,
    server_pid: value.server_pid,
    transport: value.transport,
    direction: value.direction,
    message_type: value.message_type,
    category: value.category,
    method: value.method,
    message_id: value.message_id as JsonValue | null | undefined,
    params: value.params as JsonValue | null | undefined,
    result: value.result as JsonValue | null | undefined,
    error: value.error === undefined || value.error === null ? null : parseBackendError(value.error),
    tool_name: value.tool_name,
    tool_args: value.tool_args as JsonValue | null | undefined,
    timestamp: value.timestamp,
    duration_ms: value.duration_ms,
    risk_level: value.risk_level,
    risk_flags: riskFlags,
    paused: value.paused,
    cost: value.cost === undefined || value.cost === null ? null : parseBackendCostEstimate(value.cost),
  };
}

export function parseLiveEventMessage(message: string): MCPEvent {
  const parsed: unknown = JSON.parse(message);
  return normalizeMCPEvent(parseBackendMCPEvent(parsed));
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
