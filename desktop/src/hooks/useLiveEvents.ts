import { useEffect, useEffectEvent, useRef } from "react";

import { eventStoreSelectors } from "../stores/event-selectors";
import { useEventStore } from "../stores/event-store";
import type { BackendMCPEvent } from "../types/events";

const DEFAULT_LIVE_EVENTS_URL = "ws://localhost:48300/api/events/live";

export interface UseLiveEventsOptions {
  enabled?: boolean;
  flushIntervalMs?: number;
  url?: string;
}

export function useLiveEvents({
  enabled = true,
  flushIntervalMs = 16,
  url = DEFAULT_LIVE_EVENTS_URL,
}: UseLiveEventsOptions = {}): void {
  const actions = useEventStore(eventStoreSelectors.actions);
  const bufferRef = useRef<BackendMCPEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  const flushBuffer = useEffectEvent(() => {
    if (bufferRef.current.length === 0) {
      return;
    }

    const events = bufferRef.current;
    bufferRef.current = [];

    actions.events.ingestEvents(events, {
      receivedAt: events[events.length - 1]?.timestamp,
    });
  });

  const scheduleFlush = useEffectEvent(() => {
    if (flushTimerRef.current !== null) {
      return;
    }

    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flushBuffer();
    }, flushIntervalMs);
  });

  useEffect(() => {
    if (!enabled) {
      actions.connection.reset();
      return undefined;
    }

    actions.connection.setConnecting();

    const socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      actions.connection.setConnected();
    });

    socket.addEventListener("message", (message) => {
      try {
        if (typeof message.data !== "string") {
          actions.connection.setError("live event websocket message was not text");
          return;
        }

        const event = JSON.parse(message.data) as BackendMCPEvent;
        bufferRef.current.push(event);
        scheduleFlush();
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : "failed to parse live event message";
        actions.connection.setError(messageText);
      }
    });

    socket.addEventListener("close", () => {
      flushBuffer();
      actions.connection.setDisconnected();
    });

    socket.addEventListener("error", () => {
      actions.connection.setError("live event websocket error");
    });

    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      flushBuffer();
      socket.close();
      actions.connection.setDisconnected();
    };
  }, [actions, enabled, url]);
}
