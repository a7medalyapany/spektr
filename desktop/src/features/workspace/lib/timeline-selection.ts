export type TimelineNavigationKey = "ArrowDown" | "ArrowUp" | "End" | "Enter" | "Home";

export function resolveSelectionIndex(
  eventIds: ReadonlyArray<string>,
  selectedEventId: string | null,
): number {
  if (!selectedEventId) {
    return -1;
  }

  return eventIds.indexOf(selectedEventId);
}

export function resolveNextSelectionIndex(
  key: TimelineNavigationKey,
  eventIds: ReadonlyArray<string>,
  selectedIndex: number,
): number {
  if (eventIds.length === 0) {
    return -1;
  }

  if (key === "Home") {
    return 0;
  }

  if (key === "End") {
    return eventIds.length - 1;
  }

  if (selectedIndex === -1) {
    return eventIds.length - 1;
  }

  if (key === "ArrowUp") {
    return Math.max(0, selectedIndex - 1);
  }

  if (key === "ArrowDown") {
    return Math.min(eventIds.length - 1, selectedIndex + 1);
  }

  return selectedIndex;
}
