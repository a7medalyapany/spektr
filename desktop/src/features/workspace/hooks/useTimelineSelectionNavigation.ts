import type { Virtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import type { KeyboardEvent, RefObject } from "react";

import {
  resolveNextSelectionIndex,
  resolveSelectionIndex,
  type TimelineNavigationKey,
} from "../lib/timeline-selection";
import { eventStoreSelectors } from "../../../stores/event-selectors";
import { useEventStore } from "../../../stores/event-store";

type ScrollBehaviorMode = "auto" | "smooth";
const NAVIGATION_KEYS: ReadonlySet<string> = new Set([
  "ArrowDown",
  "ArrowUp",
  "End",
  "Enter",
  "Home",
]);

interface UseTimelineSelectionNavigationOptions {
  eventIds: ReadonlyArray<string>;
  scrollElementRef: RefObject<HTMLDivElement | null>;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
}

interface UseTimelineSelectionNavigationResult {
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPointerDownCapture: () => void;
}

function isIndexVisible(
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>,
  index: number,
): boolean {
  const virtualItems = rowVirtualizer.getVirtualItems();
  if (virtualItems.length === 0) {
    return false;
  }

  const firstVisibleIndex = virtualItems[0]?.index ?? -1;
  const lastVisibleIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;

  return index >= firstVisibleIndex && index <= lastVisibleIndex;
}

export function useTimelineSelectionNavigation({
  eventIds,
  scrollElementRef,
  rowVirtualizer,
}: UseTimelineSelectionNavigationOptions): UseTimelineSelectionNavigationResult {
  const selectEvent = useEventStore((state) => state.actions.selection.selectEvent);
  const eventIdsRef = useRef(eventIds);
  const rowVirtualizerRef = useRef(rowVirtualizer);

  useEffect(() => {
    eventIdsRef.current = eventIds;
  }, [eventIds]);

  useEffect(() => {
    rowVirtualizerRef.current = rowVirtualizer;
  }, [rowVirtualizer]);

  const scrollSelectedEventIntoView = useEffectEvent(
    (selectedEventId: string | null, behavior: ScrollBehaviorMode) => {
      if (!selectedEventId) {
        return;
      }

      const index = eventIdsRef.current.indexOf(selectedEventId);
      if (index === -1 || isIndexVisible(rowVirtualizerRef.current, index)) {
        return;
      }

      rowVirtualizerRef.current.scrollToIndex(index, {
        align: "auto",
        behavior,
      });
    },
  );

  useEffect(() => {
    return useEventStore.subscribe(eventStoreSelectors.selectedEventId, (selectedEventId) => {
      scrollSelectedEventIntoView(selectedEventId, "smooth");
    });
  }, [scrollSelectedEventIntoView]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!NAVIGATION_KEYS.has(event.key)) {
        return;
      }

      const key = event.key as TimelineNavigationKey;
      const nextEventIds = eventIdsRef.current;

      if (nextEventIds.length === 0) {
        return;
      }

      event.preventDefault();
      scrollElementRef.current?.focus();

      const selectedEventId = useEventStore.getState().selectedEventId;
      const selectedIndex = resolveSelectionIndex(nextEventIds, selectedEventId);

      if (key === "Enter" && selectedEventId && selectedIndex !== -1) {
        scrollSelectedEventIntoView(selectedEventId, "smooth");
        return;
      }

      const nextIndex = resolveNextSelectionIndex(key, nextEventIds, selectedIndex);

      if (nextIndex === -1) {
        return;
      }

      const nextEventId = nextEventIds[nextIndex];
      if (!nextEventId) {
        return;
      }

      selectEvent(nextEventId);
    },
    [scrollElementRef, selectEvent],
  );

  const onPointerDownCapture = useCallback(() => {
    scrollElementRef.current?.focus();
  }, [scrollElementRef]);

  return {
    onKeyDown,
    onPointerDownCapture,
  };
}
