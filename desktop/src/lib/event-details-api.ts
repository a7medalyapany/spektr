import {
  normalizeMCPEvent,
  parseBackendMCPEvent,
  type BackendMCPEvent,
  type MCPEvent,
} from "../types/events";

const DEFAULT_API_BASE_URL = "http://localhost:48300/api";

interface ApiEnvelope<T> {
  data: T;
  error?: string;
}

export interface BackendMCPEventDetail extends BackendMCPEvent {
  raw_payload?: string;
}

export interface MCPEventDetail extends MCPEvent {
  rawPayload: string | null;
}

export interface SessionSummary {
  id: string;
  agent_type: string;
  started_at: string;
  ended_at?: string | null;
  total_events: number;
  total_cost_usd: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEventDetail(value: unknown): MCPEventDetail {
  if (!isRecord(value)) {
    throw new Error("event detail response must be an object");
  }

  const event = normalizeMCPEvent(parseBackendMCPEvent(value));
  const rawPayload =
    typeof value.raw_payload === "string"
      ? value.raw_payload
      : value.raw_payload === undefined || value.raw_payload === null
        ? null
        : (() => {
            throw new Error("event detail raw payload must be a string");
          })();

  return {
    ...event,
    rawPayload,
  };
}

export async function fetchEventDetail(
  sessionId: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<MCPEventDetail> {
  const response = await fetch(
    `${DEFAULT_API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}/events/${encodeURIComponent(eventId)}`,
    {
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`failed to fetch event detail (${response.status})`);
  }

  const payload = (await response.json()) as ApiEnvelope<unknown>;
  if (payload.error) {
    throw new Error(payload.error);
  }

  return parseEventDetail(payload.data);
}

export async function fetchSessions(signal?: AbortSignal): Promise<ReadonlyArray<SessionSummary>> {
  const response = await fetch(`${DEFAULT_API_BASE_URL}/sessions?limit=200`, { signal });

  if (!response.ok) {
    throw new Error(`failed to fetch sessions (${response.status})`);
  }

  const payload = (await response.json()) as ApiEnvelope<unknown>;
  if (payload.error) {
    throw new Error(payload.error);
  }

  if (!Array.isArray(payload.data)) {
    throw new Error("sessions response must be an array");
  }

  return payload.data.map((value) => {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as Record<string, unknown>).id !== "string" ||
      typeof (value as Record<string, unknown>).agent_type !== "string" ||
      typeof (value as Record<string, unknown>).started_at !== "string" ||
      typeof (value as Record<string, unknown>).total_events !== "number" ||
      typeof (value as Record<string, unknown>).total_cost_usd !== "number"
    ) {
      throw new Error("session summary shape is invalid");
    }

    const session = value as Record<string, unknown>;
    return {
      id: session.id as string,
      agent_type: session.agent_type as string,
      started_at: session.started_at as string,
      ended_at:
        session.ended_at === undefined || session.ended_at === null
          ? null
          : (session.ended_at as string),
      total_events: session.total_events as number,
      total_cost_usd: session.total_cost_usd as number,
    };
  });
}

export async function fetchSessionEvents(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ReadonlyArray<MCPEvent>> {
  const response = await fetch(
    `${DEFAULT_API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}/events?limit=10000`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(`failed to fetch session events (${response.status})`);
  }

  const payload = (await response.json()) as ApiEnvelope<unknown>;
  if (payload.error) {
    throw new Error(payload.error);
  }

  if (!Array.isArray(payload.data)) {
    throw new Error("session events response must be an array");
  }

  return payload.data.map((value) => normalizeMCPEvent(parseBackendMCPEvent(value)));
}
