import { useEffect, useEffectEvent, useRef } from "react";

import {
  type LiveEventsClientState,
  liveEventsClient,
} from "../lib/live-events-client";
import { eventStoreSelectors } from "../stores/event-selectors";
import { useEventStore } from "../stores/event-store";
import type { MCPEvent } from "../types/events";

export interface UseLiveEventsOptions {
  enabled?: boolean;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  url?: string;
}

export function useLiveEvents({
  enabled = true,
  flushIntervalMs = 16,
  maxBatchSize = 200,
  url,
}: UseLiveEventsOptions = {}): void {
  const actions = useEventStore(eventStoreSelectors.actions);
  const bufferRef = useRef<MCPEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  const flushBuffer = useEffectEvent(() => {
    if (bufferRef.current.length === 0) {
      return;
    }

    const events = bufferRef.current;
    bufferRef.current = [];

    actions.events.ingestEvents(events, {
      receivedAt: new Date().toISOString(),
    });
  });

  const clearFlushTimer = useEffectEvent(() => {
    if (flushTimerRef.current === null) {
      return;
    }

    window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
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

  const handleStateChange = useEffectEvent((state: LiveEventsClientState) => {
    switch (state.status) {
      case "idle":
        actions.connection.reset();
        break;
      case "connecting":
        actions.connection.setConnecting(state.reconnectAttempt);
        break;
      case "connected":
        actions.connection.setConnected();
        break;
      case "disconnected":
        actions.connection.setDisconnected(state.lastError);
        break;
      case "error":
        actions.connection.setError(state.lastError ?? "live event websocket error");
        break;
    }
  });

  const handleEvent = useEffectEvent((event: MCPEvent) => {
    bufferRef.current.push(event);

    if (bufferRef.current.length >= maxBatchSize) {
      clearFlushTimer();
      flushBuffer();
      return;
    }

    scheduleFlush();
  });

  useEffect(() => {
    if (!enabled) {
      clearFlushTimer();
      bufferRef.current = [];
      actions.connection.reset();
      return undefined;
    }

    const unsubscribe = liveEventsClient.subscribe({
      onEvent: handleEvent,
      onStateChange: handleStateChange,
    });

    liveEventsClient.retain({ url });

    return () => {
      unsubscribe();
      clearFlushTimer();
      flushBuffer();
      liveEventsClient.release();
    };
  }, [
    actions.connection,
    clearFlushTimer,
    enabled,
    flushBuffer,
    handleEvent,
    handleStateChange,
    maxBatchSize,
    scheduleFlush,
    url,
  ]);
}
