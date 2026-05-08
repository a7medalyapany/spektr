import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

import {
  type EventDirection,
  type IncomingMCPEvent,
  type MCPEvent,
  type MethodCategory,
  type RiskLevel,
  normalizeMCPEvent,
} from "../types/events";

export const EVENT_RING_BUFFER_CAPACITY = 10_000;

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface EventFilters {
  search: string;
  sessionIds: ReadonlyArray<string>;
  serverNames: ReadonlyArray<string>;
  riskLevels: ReadonlyArray<RiskLevel>;
  directions: ReadonlyArray<EventDirection>;
  categories: ReadonlyArray<MethodCategory>;
  showPausedOnly: boolean;
}

export interface EventConnectionState {
  status: ConnectionStatus;
  reconnectAttempt: number;
  connectedAt: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
}

export interface EventStats {
  totalReceived: number;
  bufferedEvents: number;
  droppedEvents: number;
  directionCounts: Record<EventDirection, number>;
  riskCounts: Record<RiskLevel, number>;
  serverCounts: Record<string, number>;
  lastEventAt: string | null;
}

interface EventRingState {
  capacity: number;
  order: Array<string | null>;
  ids: ReadonlyArray<string>;
  start: number;
  size: number;
  version: number;
}

export interface EventStoreState {
  eventsById: ReadonlyMap<string, MCPEvent>;
  eventsVersion: number;
  ring: EventRingState;
  selectedEventId: string | null;
  filters: EventFilters;
  connection: EventConnectionState;
  stats: EventStats;
  actions: {
    events: {
      ingestEvent: (
        event: IncomingMCPEvent,
        options?: { receivedAt?: string },
      ) => void;
      ingestEvents: (
        events: ReadonlyArray<IncomingMCPEvent>,
        options?: { receivedAt?: string },
      ) => void;
      replaceAll: (events: ReadonlyArray<IncomingMCPEvent>) => void;
      clear: () => void;
    };
    selection: {
      selectEvent: (eventId: string | null) => void;
      clearSelection: () => void;
    };
    filters: {
      patchFilters: (patch: Partial<EventFilters>) => void;
      resetFilters: () => void;
    };
    connection: {
      setConnecting: (attempt?: number) => void;
      setConnected: () => void;
      setDisconnected: (reason?: string | null) => void;
      setError: (message: string) => void;
      markMessageReceived: (timestamp?: string) => void;
      reset: () => void;
    };
  };
}

type MutableEventStats = {
  totalReceived: number;
  bufferedEvents: number;
  droppedEvents: number;
  directionCounts: Record<EventDirection, number>;
  riskCounts: Record<RiskLevel, number>;
  serverCounts: Record<string, number>;
  lastEventAt: string | null;
};

const EMPTY_EVENT_IDS: ReadonlyArray<string> = [];

function createDefaultFilters(): EventFilters {
  return {
    search: "",
    sessionIds: [],
    serverNames: [],
    riskLevels: [],
    directions: [],
    categories: [],
    showPausedOnly: false,
  };
}

function createDefaultConnectionState(): EventConnectionState {
  return {
    status: "idle",
    reconnectAttempt: 0,
    connectedAt: null,
    lastMessageAt: null,
    lastError: null,
  };
}

function createEmptyStats(): EventStats {
  return {
    totalReceived: 0,
    bufferedEvents: 0,
    droppedEvents: 0,
    directionCounts: {
      request: 0,
      response: 0,
      notification: 0,
    },
    riskCounts: {
      none: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
    serverCounts: {},
    lastEventAt: null,
  };
}

function createEmptyRingState(capacity = EVENT_RING_BUFFER_CAPACITY): EventRingState {
  return {
    capacity,
    order: Array<string | null>(capacity).fill(null),
    ids: EMPTY_EVENT_IDS,
    start: 0,
    size: 0,
    version: 0,
  };
}

function cloneStats(stats: EventStats): MutableEventStats {
  return {
    totalReceived: stats.totalReceived,
    bufferedEvents: stats.bufferedEvents,
    droppedEvents: stats.droppedEvents,
    directionCounts: { ...stats.directionCounts },
    riskCounts: { ...stats.riskCounts },
    serverCounts: { ...stats.serverCounts },
    lastEventAt: stats.lastEventAt,
  };
}

function incrementEventStats(stats: MutableEventStats, event: MCPEvent): void {
  stats.directionCounts[event.direction] += 1;
  stats.riskCounts[event.riskLevel] += 1;
  stats.serverCounts[event.serverName] = (stats.serverCounts[event.serverName] ?? 0) + 1;
}

function decrementEventStats(stats: MutableEventStats, event: MCPEvent): void {
  stats.directionCounts[event.direction] = Math.max(0, stats.directionCounts[event.direction] - 1);
  stats.riskCounts[event.riskLevel] = Math.max(0, stats.riskCounts[event.riskLevel] - 1);

  const currentCount = stats.serverCounts[event.serverName] ?? 0;
  if (currentCount <= 1) {
    delete stats.serverCounts[event.serverName];
    return;
  }

  stats.serverCounts[event.serverName] = currentCount - 1;
}

function materializeRingIds(
  order: ReadonlyArray<string | null>,
  start: number,
  size: number,
): ReadonlyArray<string> {
  if (size === 0) {
    return EMPTY_EVENT_IDS;
  }

  const ids = new Array<string>(size);
  for (let index = 0; index < size; index += 1) {
    const value = order[(start + index) % order.length];
    if (value === null) {
      throw new Error("event ring invariant violated: missing id in occupied slot");
    }
    ids[index] = value;
  }

  return ids;
}

function appendIdsToRing(
  ring: EventRingState,
  idsToAppend: ReadonlyArray<string>,
): { nextRing: EventRingState; evictedIds: ReadonlyArray<string> } {
  if (idsToAppend.length === 0) {
    return {
      nextRing: ring,
      evictedIds: EMPTY_EVENT_IDS,
    };
  }

  const order = ring.order.slice();
  const evictedIds: string[] = [];
  let start = ring.start;
  let size = ring.size;

  for (const id of idsToAppend) {
    if (size === ring.capacity) {
      const evictedId = order[start];
      if (evictedId !== null) {
        evictedIds.push(evictedId);
      }
      order[start] = id;
      start = (start + 1) % ring.capacity;
      continue;
    }

    order[(start + size) % ring.capacity] = id;
    size += 1;
  }

  return {
    nextRing: {
      capacity: ring.capacity,
      order,
      start,
      size,
      version: ring.version + 1,
      ids: materializeRingIds(order, start, size),
    },
    evictedIds,
  };
}

function buildStateFromEvents(
  events: ReadonlyArray<IncomingMCPEvent>,
): Pick<EventStoreState, "eventsById" | "eventsVersion" | "ring" | "stats" | "selectedEventId"> {
  const normalizedEvents = events.map(normalizeMCPEvent);
  const ring = createEmptyRingState();
  const stats = cloneStats(createEmptyStats());
  const eventsById = new Map<string, MCPEvent>();

  const dedupedEvents = new Map<string, MCPEvent>();
  for (const event of normalizedEvents) {
    dedupedEvents.set(event.id, event);
  }

  const orderedEvents = Array.from(dedupedEvents.values());
  const trimmedEvents = orderedEvents.slice(-EVENT_RING_BUFFER_CAPACITY);
  const appendResult = appendIdsToRing(ring, trimmedEvents.map((event) => event.id));

  for (const event of trimmedEvents) {
    eventsById.set(event.id, event);
    incrementEventStats(stats, event);
    stats.lastEventAt = event.timestamp;
  }

  stats.totalReceived += normalizedEvents.length;
  stats.droppedEvents += Math.max(0, orderedEvents.length - trimmedEvents.length);
  stats.bufferedEvents = appendResult.nextRing.size;

  return {
    eventsById,
    eventsVersion: normalizedEvents.length,
    ring: appendResult.nextRing,
    stats,
    selectedEventId: null,
  };
}

function ingestIncomingEvents(
  state: EventStoreState,
  incomingEvents: ReadonlyArray<IncomingMCPEvent>,
): Pick<EventStoreState, "eventsById" | "eventsVersion" | "ring" | "stats" | "selectedEventId"> | null {
  if (incomingEvents.length === 0) {
    return null;
  }

  const events = incomingEvents.map(normalizeMCPEvent);
  const eventsById = new Map(state.eventsById);
  const stats = cloneStats(state.stats);
  const idsToAppend: string[] = [];

  for (const event of events) {
    const previous = eventsById.get(event.id);
    if (previous) {
      decrementEventStats(stats, previous);
    } else {
      idsToAppend.push(event.id);
    }

    eventsById.set(event.id, event);
    incrementEventStats(stats, event);
    stats.lastEventAt = event.timestamp;
  }

  const { nextRing, evictedIds } = appendIdsToRing(state.ring, idsToAppend);

  for (const evictedId of evictedIds) {
    const evictedEvent = eventsById.get(evictedId);
    if (!evictedEvent) {
      continue;
    }

    decrementEventStats(stats, evictedEvent);
    eventsById.delete(evictedId);
  }

  stats.totalReceived += events.length;
  stats.droppedEvents += evictedIds.length;
  stats.bufferedEvents = nextRing.size;

  const selectedEventId =
    state.selectedEventId && eventsById.has(state.selectedEventId) ? state.selectedEventId : null;

  return {
    eventsById,
    eventsVersion: state.eventsVersion + events.length,
    ring: nextRing,
    stats,
    selectedEventId,
  };
}

export const useEventStore = create<EventStoreState>()(
  subscribeWithSelector((set) => ({
    eventsById: new Map<string, MCPEvent>(),
    eventsVersion: 0,
    ring: createEmptyRingState(),
    selectedEventId: null,
    filters: createDefaultFilters(),
    connection: createDefaultConnectionState(),
    stats: createEmptyStats(),
    actions: {
      events: {
        ingestEvent: (event, options) => {
          set((state) => {
            const nextState = ingestIncomingEvents(state, [event]);
            if (!nextState) {
              return state;
            }

            return {
              ...nextState,
              connection: options?.receivedAt
                ? {
                    ...state.connection,
                    lastMessageAt: options.receivedAt,
                  }
                : state.connection,
            };
          });
        },
        ingestEvents: (events, options) => {
          set((state) => {
            const nextState = ingestIncomingEvents(state, events);
            if (!nextState) {
              return state;
            }

            return {
              ...nextState,
              connection: options?.receivedAt
                ? {
                    ...state.connection,
                    lastMessageAt: options.receivedAt,
                  }
                : state.connection,
            };
          });
        },
        replaceAll: (events) => {
          set((state) => ({
            ...state,
            ...buildStateFromEvents(events),
          }));
        },
        clear: () => {
          set((state) => ({
            ...state,
            eventsById: new Map<string, MCPEvent>(),
            eventsVersion: 0,
            ring: createEmptyRingState(),
            stats: createEmptyStats(),
            selectedEventId: null,
          }));
        },
      },
      selection: {
        selectEvent: (eventId) => {
          set((state) => ({
            selectedEventId: eventId && state.eventsById.has(eventId) ? eventId : null,
          }));
        },
        clearSelection: () => {
          set({ selectedEventId: null });
        },
      },
      filters: {
        patchFilters: (patch) => {
          set((state) => ({
            filters: {
              ...state.filters,
              ...patch,
            },
          }));
        },
        resetFilters: () => {
          set({ filters: createDefaultFilters() });
        },
      },
      connection: {
        setConnecting: (attempt = 0) => {
          set((state) => ({
            connection: {
              ...state.connection,
              status: "connecting",
              reconnectAttempt: attempt,
              lastError: null,
            },
          }));
        },
        setConnected: () => {
          set((state) => ({
            connection: {
              ...state.connection,
              status: "connected",
              connectedAt: new Date().toISOString(),
              reconnectAttempt: 0,
              lastError: null,
            },
          }));
        },
        setDisconnected: (reason = null) => {
          set((state) => ({
            connection: {
              ...state.connection,
              status: "disconnected",
              lastError: reason,
            },
          }));
        },
        setError: (message) => {
          set((state) => ({
            connection: {
              ...state.connection,
              status: "error",
              lastError: message,
            },
          }));
        },
        markMessageReceived: (timestamp) => {
          set((state) => ({
            connection: {
              ...state.connection,
              lastMessageAt: timestamp ?? new Date().toISOString(),
            },
          }));
        },
        reset: () => {
          set({ connection: createDefaultConnectionState() });
        },
      },
    },
  })),
);
