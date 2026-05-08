import { Activity, ShieldAlert, Wifi } from "lucide-react";
import { Group, Panel } from "react-resizable-panels";

import { InspectorPanel } from "../../features/workspace/components/InspectorPanel";
import { SidebarPanel } from "../../features/workspace/components/SidebarPanel";
import { TimelinePanel } from "../../features/workspace/components/TimelinePanel";
import { eventStoreSelectors } from "../../stores/event-selectors";
import { useEventStore } from "../../stores/event-store";
import { AppFrame } from "./AppFrame";
import { ResizeHandle } from "./ResizeHandle";

const COUNT_FORMATTER = new Intl.NumberFormat("en-US");

function formatCount(value: number): string {
  return COUNT_FORMATTER.format(value);
}

function formatConnectedSince(timestamp: string | null): string {
  if (!timestamp) {
    return "No active stream";
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return parsed.toLocaleTimeString("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  });
}

function AppChrome() {
  const connection = useEventStore(eventStoreSelectors.connection);
  const stats = useEventStore(eventStoreSelectors.stats);
  const selectedEvent = useEventStore(eventStoreSelectors.selectedEvent);
  const filters = useEventStore(eventStoreSelectors.filters);

  const activeServers = Object.keys(stats.serverCounts).sort();
  const criticalCount = stats.riskCounts.critical;
  const highRiskCount = stats.riskCounts.high + stats.riskCounts.critical;
  const activeFilterCount =
    filters.sessionIds.length +
    filters.serverNames.length +
    filters.riskLevels.length +
    filters.directions.length +
    filters.categories.length +
    (filters.showPausedOnly ? 1 : 0) +
    (filters.search.trim().length > 0 ? 1 : 0);

  return (
    <>
      <div className="flex h-11 items-center gap-3 border-b border-white/[0.07] bg-[#07090d]/95 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c940]" />
        </div>
        <div className="min-w-0 flex-1 text-center text-[13px] font-medium tracking-[0.01em] text-[var(--text-secondary)]">
          Spektr
          <span className="ml-2 text-[var(--text-quaternary)]">
            {activeServers.length > 0 ? activeServers.join(" · ") : "awaiting MCP servers"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
            Session
          </div>
          <div className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
            Local-only
          </div>
        </div>
      </div>

      <div className="flex h-12 items-center gap-3 border-b border-white/[0.07] bg-[#0a0c10]/92 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <span
            className={`h-2 w-2 rounded-full ${
              connection.status === "connected"
                ? "bg-emerald-400"
                : connection.status === "connecting"
                  ? "bg-sky-400"
                  : connection.status === "error"
                    ? "bg-rose-400"
                    : "bg-white/25"
            }`}
          />
          <span className="capitalize">{connection.status}</span>
        </div>
        <div className="h-4 w-px bg-white/[0.08]" />
        <div className="text-[12px] text-[var(--text-secondary)]">
          <span className="text-[var(--text-primary)]">{formatCount(stats.bufferedEvents)}</span>{" "}
          buffered
        </div>
        <div className="h-4 w-px bg-white/[0.08]" />
        <div className="text-[12px] text-[var(--text-secondary)]">
          <span className="text-[var(--text-primary)]">{formatCount(stats.totalReceived)}</span>{" "}
          total events
        </div>
        <div className="h-4 w-px bg-white/[0.08]" />
        <div className="text-[12px] text-[var(--text-secondary)]">
          High risk <span className="text-[var(--text-primary)]">{formatCount(highRiskCount)}</span>
        </div>
        <div className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] text-[var(--text-tertiary)]">
          {filters.search.trim().length > 0
            ? `Search: ${filters.search}`
            : activeFilterCount > 0
              ? `${formatCount(activeFilterCount)} filters applied`
              : "Filter timeline by method, tool, server, session, and risk from the left pane"}
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span
            className={`h-2 w-2 rounded-full ${criticalCount > 0 ? "bg-rose-400" : "bg-white/25"}`}
          />
          <span className={criticalCount > 0 ? "text-rose-200" : "text-[var(--text-secondary)]"}>
            {criticalCount > 0 ? `${formatCount(criticalCount)} critical` : "No critical"}
          </span>
        </div>
      </div>

      <div className="flex h-8 items-center gap-4 border-b border-white/[0.06] bg-[#080a0d]/88 px-4 text-[11px] text-[var(--text-tertiary)]">
        <div className="flex items-center gap-1.5">
          <Wifi className="h-3.5 w-3.5" strokeWidth={1.8} />
          WebSocket :48300/api/events/live
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" strokeWidth={1.8} />
          Connected {formatConnectedSince(connection.connectedAt)}
        </div>
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.8} />
          Daemon-backed inspection
        </div>
        <div className="min-w-0 flex-1 truncate text-right">
          {selectedEvent
            ? `Focused: ${selectedEvent.serverName} · ${selectedEvent.toolName ?? selectedEvent.method}`
            : "Focused: none"}
        </div>
      </div>
    </>
  );
}

function MobileShell() {
  return (
    <div className="flex min-h-[calc(100vh-1.5rem)] flex-col gap-3 lg:hidden">
      <div className="h-[28vh] min-h-52">
        <SidebarPanel />
      </div>
      <div className="h-[34vh] min-h-64">
        <TimelinePanel />
      </div>
      <div className="min-h-72 flex-1">
        <InspectorPanel />
      </div>
    </div>
  );
}

function DesktopShell() {
  return (
    <div className="hidden min-h-[calc(100vh-2rem)] lg:block">
      <div className="h-[calc(100vh-2rem)] overflow-hidden rounded-[28px] border border-[var(--panel-border)] bg-[#0a0c10]/88 shadow-[0_20px_60px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
        <AppChrome />
        <Group
          className="h-[calc(100%-7.75rem)] bg-transparent p-2"
          id="spektr-app-shell"
          orientation="horizontal"
        >
          <Panel defaultSize={21} id="sidebar" maxSize={28} minSize={17}>
            <SidebarPanel />
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={47} id="timeline" minSize={36}>
            <TimelinePanel />
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={32} id="inspector" maxSize={40} minSize={24}>
            <InspectorPanel />
          </Panel>
        </Group>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <AppFrame>
      <DesktopShell />
      <MobileShell />
    </AppFrame>
  );
}
