import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveNextSelectionIndex,
  resolveSelectionIndex,
} from "../src/features/workspace/lib/timeline-selection";

describe("timeline selection navigation", () => {
  const eventIds = ["event-1", "event-2", "event-3", "event-4"] as const;

  it("resolves a selected event id to its index", () => {
    assert.equal(resolveSelectionIndex(eventIds, "event-3"), 2);
    assert.equal(resolveSelectionIndex(eventIds, null), -1);
    assert.equal(resolveSelectionIndex(eventIds, "missing"), -1);
  });

  it("moves selection with keyboard keys", () => {
    assert.equal(resolveNextSelectionIndex("ArrowUp", eventIds, 2), 1);
    assert.equal(resolveNextSelectionIndex("ArrowDown", eventIds, 2), 3);
    assert.equal(resolveNextSelectionIndex("Home", eventIds, 2), 0);
    assert.equal(resolveNextSelectionIndex("End", eventIds, 2), 3);
  });

  it("falls back to the last item when nothing is selected", () => {
    assert.equal(resolveNextSelectionIndex("ArrowDown", eventIds, -1), 3);
    assert.equal(resolveNextSelectionIndex("Enter", eventIds, -1), 3);
  });
});
