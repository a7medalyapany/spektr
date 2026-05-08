import type { JsonValue, MCPEvent, RiskLevel } from "../../../types/events";
import type { MCPEventDetail } from "../../../lib/event-details-api";

export const INSPECTOR_RISK_STYLES: Record<RiskLevel, string> = {
  critical: "border-rose-400/18 bg-rose-400/14 text-rose-100",
  high: "border-orange-400/18 bg-orange-400/14 text-orange-100",
  low: "border-emerald-400/18 bg-emerald-400/14 text-emerald-100",
  medium: "border-amber-400/18 bg-amber-400/14 text-amber-100",
  none: "border-white/10 bg-white/[0.04] text-[var(--text-secondary)]",
};

export interface InspectorJsonSection {
  id: string;
  label: string;
  value: unknown;
}

export function formatEventTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return parsed.toLocaleString("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    second: "2-digit",
  });
}

export function formatLatency(durationMs: number): string {
  if (durationMs <= 0) {
    return "--";
  }

  if (durationMs < 1) {
    return "<1ms";
  }

  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`;
  }

  return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`;
}

export function getPrimaryLabel(event: MCPEvent): string {
  if (event.toolName && event.toolName.trim().length > 0) {
    return event.toolName;
  }

  return event.method;
}

export function formatJsonDocument(value: unknown): string {
  if (value === null) {
    return "null";
  }

  return JSON.stringify(value, null, 2);
}

export function sanitizeRawPayload(rawPayload: string | null): string {
  if (!rawPayload || rawPayload.trim().length === 0) {
    return "// Raw JSON-RPC payload unavailable";
  }

  return rawPayload;
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeHeaders(value: JsonValue): value is Record<string, JsonValue> {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => typeof value[key] === "string");
}

function findHeaders(value: JsonValue | null, depth = 0): Record<string, JsonValue> | null {
  if (value === null || depth > 3) {
    return null;
  }

  if (looksLikeHeaders(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findHeaders(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if ("headers" in value) {
    const headersValue = value.headers;
    if (headersValue !== undefined && looksLikeHeaders(headersValue)) {
      return headersValue;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const found = findHeaders(nestedValue, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

export function buildParsedPayloadSections(detail: MCPEventDetail): ReadonlyArray<InspectorJsonSection> {
  const sections: InspectorJsonSection[] = [];
  const headers =
    findHeaders(detail.params) ?? findHeaders(detail.result) ?? findHeaders(detail.error?.data ?? null);

  if (detail.toolArgs) {
    sections.push({
      id: "tool-arguments",
      label: "Tool Arguments",
      value: detail.toolArgs,
    });
  }

  if (detail.params) {
    sections.push({
      id: "params",
      label: "Params",
      value: detail.params,
    });
  }

  if (headers) {
    sections.push({
      id: "headers",
      label: "Headers",
      value: headers,
    });
  }

  if (detail.result) {
    sections.push({
      id: "result",
      label: "Result",
      value: detail.result,
    });
  }

  if (detail.error) {
    sections.push({
      id: "error",
      label: "Error",
      value: detail.error,
    });
  }

  return sections;
}
