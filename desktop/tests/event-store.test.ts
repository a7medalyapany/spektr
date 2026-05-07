import * as assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { eventStoreSelectors } from "../src/stores/event-selectors";
import { useEventStore } from "../src/stores/event-store";
import { createTestEvent } from "./helpers";

describe("event store selection", () => {
  beforeEach(() => {
    useEventStore.getState().actions.events.clear();
    useEventStore.getState().actions.selection.clearSelection();
  });

  it("selects an event and exposes it to the inspector selector", () => {
    useEventStore.getState().actions.events.ingestEvents([
      createTestEvent(1),
      createTestEvent(2),
      createTestEvent(3),
    ]);

    useEventStore.getState().actions.selection.selectEvent("event-2");

    assert.equal(useEventStore.getState().selectedEventId, "event-2");
    assert.equal(eventStoreSelectors.selectedEvent(useEventStore.getState())?.id, "event-2");
  });

  it("keeps selection stable across live ingest when the selected event remains buffered", () => {
    useEventStore.getState().actions.events.ingestEvents([
      createTestEvent(1),
      createTestEvent(2),
      createTestEvent(3),
    ]);
    useEventStore.getState().actions.selection.selectEvent("event-2");

    useEventStore.getState().actions.events.ingestEvents([
      createTestEvent(4),
      createTestEvent(5),
    ]);

    assert.equal(useEventStore.getState().selectedEventId, "event-2");
    assert.equal(eventStoreSelectors.selectedEvent(useEventStore.getState())?.id, "event-2");
  });

  it("clears selection when the selected event is evicted from the ring buffer", () => {
    const batch = Array.from({ length: 10_000 }, (_, index) => createTestEvent(index));
    useEventStore.getState().actions.events.ingestEvents(batch);
    useEventStore.getState().actions.selection.selectEvent("event-1");

    useEventStore.getState().actions.events.ingestEvent(createTestEvent(10_000));
    useEventStore.getState().actions.events.ingestEvent(createTestEvent(10_001));

    assert.equal(useEventStore.getState().selectedEventId, null);
    assert.equal(eventStoreSelectors.selectedEvent(useEventStore.getState()), null);
  });
});
