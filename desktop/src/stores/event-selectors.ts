import type { EventStoreState } from "./event-store";
import type { EventFilters } from "./event-store";
import type { MCPEvent } from "../types/events";
import type { RiskLevel } from "../types/events";

const EMPTY_EVENT_IDS: ReadonlyArray<string> = [];
const EMPTY_FILTER_OPTIONS: ReadonlyArray<FilterOption> = [];

export interface FilterOption {
  value: string;
  count: number;
}

function hasActiveFilters(filters: EventFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.sessionIds.length > 0 ||
    filters.serverNames.length > 0 ||
    filters.riskLevels.length > 0 ||
    filters.directions.length > 0 ||
    filters.categories.length > 0 ||
    filters.showPausedOnly
  );
}

function eventMatchesFilters(event: MCPEvent, filters: EventFilters): boolean {
  if (filters.showPausedOnly && !event.paused) {
    return false;
  }

  if (filters.sessionIds.length > 0 && !filters.sessionIds.includes(event.sessionId)) {
    return false;
  }

  if (filters.serverNames.length > 0 && !filters.serverNames.includes(event.serverName)) {
    return false;
  }

  if (filters.riskLevels.length > 0 && !filters.riskLevels.includes(event.riskLevel)) {
    return false;
  }

  if (filters.directions.length > 0 && !filters.directions.includes(event.direction)) {
    return false;
  }

  if (filters.categories.length > 0 && !filters.categories.includes(event.category)) {
    return false;
  }

  const search = filters.search.trim().toLowerCase();
  if (search.length === 0) {
    return true;
  }

  return [
    event.serverName,
    event.method,
    event.toolName ?? "",
    event.sessionId,
    event.riskLevel,
  ].some((value) => value.toLowerCase().includes(search));
}

export const eventStoreSelectors = {
  actions: (state: EventStoreState) => state.actions,
  connection: (state: EventStoreState) => state.connection,
  connectionStatus: (state: EventStoreState) => state.connection.status,
  eventsVersion: (state: EventStoreState) => state.eventsVersion,
  filters: (state: EventStoreState) => state.filters,
  hasActiveFilters: (state: EventStoreState) => hasActiveFilters(state.filters),
  ringVersion: (state: EventStoreState) => state.ring.version,
  selectedEventId: (state: EventStoreState) => state.selectedEventId,
  selectedEvent: (state: EventStoreState) =>
    state.selectedEventId ? state.eventsById.get(state.selectedEventId) ?? null : null,
  stats: (state: EventStoreState) => state.stats,
  timelineIds: (state: EventStoreState) => state.ring.ids,
} as const;

export function makeFilterOptionsSelector(
  mode: "session" | "server" | "risk",
) {
  let previousIds = EMPTY_EVENT_IDS;
  let previousEventsVersion = -1;
  let previousResult = EMPTY_FILTER_OPTIONS;

  return (state: EventStoreState): ReadonlyArray<FilterOption> => {
    if (previousIds === state.ring.ids && previousEventsVersion === state.eventsVersion) {
      return previousResult;
    }

    const counts = new Map<string, number>();

    for (const id of state.ring.ids) {
      const event = state.eventsById.get(id);
      if (!event) {
        continue;
      }

      const value =
        mode === "session"
          ? event.sessionId
          : mode === "server"
            ? event.serverName
            : (event.riskLevel satisfies RiskLevel);

      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    previousIds = state.ring.ids;
    previousEventsVersion = state.eventsVersion;
    previousResult =
      counts.size === 0
        ? EMPTY_FILTER_OPTIONS
        : Array.from(counts, ([value, count]) => ({ value, count })).sort((left, right) => {
            if (right.count !== left.count) {
              return right.count - left.count;
            }

            return left.value.localeCompare(right.value);
          });

    return previousResult;
  };
}

export function makeEventByIdSelector(eventId: string) {
  return (state: EventStoreState): MCPEvent | null => state.eventsById.get(eventId) ?? null;
}

export function makeIsEventSelectedSelector(eventId: string) {
  return (state: EventStoreState): boolean => state.selectedEventId === eventId;
}

export function makeFilteredTimelineIdsSelector() {
  let previousIds = EMPTY_EVENT_IDS;
  let previousEventsVersion = -1;
  let previousFilters: EventStoreState["filters"] | null = null;
  let previousResult = EMPTY_EVENT_IDS;

  return (state: EventStoreState): ReadonlyArray<string> => {
    if (
      previousIds === state.ring.ids &&
      previousEventsVersion === state.eventsVersion &&
      previousFilters === state.filters
    ) {
      return previousResult;
    }

    const nextResult = hasActiveFilters(state.filters)
      ? state.ring.ids.filter((id) => {
          const event = state.eventsById.get(id);
          return event ? eventMatchesFilters(event, state.filters) : false;
        })
      : state.ring.ids;

    previousIds = state.ring.ids;
    previousEventsVersion = state.eventsVersion;
    previousFilters = state.filters;
    previousResult = nextResult;

    return nextResult;
  };
}

export function makeTimelineWindowSelector(
  idsSelector: (state: EventStoreState) => ReadonlyArray<string>,
  startIndex: number,
  endIndex: number,
) {
  let previousIds = EMPTY_EVENT_IDS;
  let previousStart = -1;
  let previousEnd = -1;
  let previousResult = EMPTY_EVENT_IDS;

  return (state: EventStoreState): ReadonlyArray<string> => {
    const ids = idsSelector(state);

    if (previousIds === ids && previousStart === startIndex && previousEnd === endIndex) {
      return previousResult;
    }

    previousIds = ids;
    previousStart = startIndex;
    previousEnd = endIndex;
    previousResult = ids.slice(startIndex, endIndex);

    return previousResult;
  };
}
