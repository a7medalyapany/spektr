import { eventStoreSelectors } from "../../../stores/event-selectors";
import { useEventStore } from "../../../stores/event-store";
import { EventInspectorDetails } from "./inspector/EventInspectorDetails";

export function InspectorPanel() {
  const selectedEvent = useEventStore(eventStoreSelectors.selectedEvent);

  return <EventInspectorDetails event={selectedEvent} />;
}
