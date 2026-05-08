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
