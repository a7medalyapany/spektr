import * as assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  eventStoreSelectors,
  makeFilteredTimelineIdsSelector,
} from "../src/stores/event-selectors";
import { useEventStore } from "../src/stores/event-store";
import { createTestEvent } from "./helpers";

describe("event filters", () => {
  beforeEach(() => {
    useEventStore.getState().actions.events.clear();
    useEventStore.getState().actions.filters.resetFilters();
  });

  it("filters timeline ids by session", () => {
    useEventStore.getState().actions.events.ingestEvents([
      createTestEvent(1, { sessionId: "session-a", serverName: "bash", riskLevel: "none" }),
      createTestEvent(2, { sessionId: "session-b", serverName: "github", riskLevel: "high" }),
      createTestEvent(3, { sessionId: "session-a", serverName: "filesystem", riskLevel: "low" }),
    ]);

    useEventStore.getState().actions.filters.patchFilters({
      sessionIds: ["session-a"],
    });

    const selector = makeFilteredTimelineIdsSelector();
    const filteredIds = selector(useEventStore.getState());

    assert.equal(filteredIds.join(","), "event-1,event-3");
  });

  it("reports active filters when search or scoped filters are set", () => {
    assert.equal(eventStoreSelectors.hasActiveFilters(useEventStore.getState()), false);

    useEventStore.getState().actions.filters.patchFilters({
      search: "tools/call",
      sessionIds: ["session-a"],
    });

    assert.equal(eventStoreSelectors.hasActiveFilters(useEventStore.getState()), true);
  });
});
