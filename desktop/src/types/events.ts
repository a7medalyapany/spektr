export type EventDirection = "request" | "response" | "notification";

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

export interface CostEstimate {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

export interface MCPEvent {
  id: string;
  sessionId: string;
  pairedId?: string;
  serverName: string;
  direction: EventDirection;
  method: string;
  params?: unknown;
  result?: unknown;
  timestamp: string;
  durationMs?: number;
  riskLevel: RiskLevel;
  riskFlags: string[];
  cost?: CostEstimate;
}
