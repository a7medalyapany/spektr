import { useQuery } from "@tanstack/react-query";

import { AppShell } from "./components/layout/AppShell";
import { useLiveEvents } from "./hooks/useLiveEvents";
import { queryKeys } from "./lib/query-keys";
import { fetchSessionEvents, fetchSessions } from "./lib/event-details-api";
import { useEventStore } from "./stores/event-store";
import { useEffect } from "react";

function App() {
  useLiveEvents();
  const replaceAll = useEventStore((state) => state.actions.events.replaceAll);
  const clearSelection = useEventStore((state) => state.actions.selection.clearSelection);

  const sessionsQuery = useQuery({
    queryKey: queryKeys.sessions.list(),
    queryFn: ({ signal }) => fetchSessions(signal),
  });

  useEffect(() => {
    const sessions = sessionsQuery.data;
    if (!sessions || sessions.length === 0) {
      return;
    }

    const latestSession = sessions.find((session) => session.total_events > 0) ?? sessions[0];
    void fetchSessionEvents(latestSession.id).then((events) => {
      replaceAll(events);
      clearSelection();
    });
  }, [clearSelection, replaceAll, sessionsQuery.data]);

  return <AppShell />;
}

export default App;
