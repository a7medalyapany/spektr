import { Activity, Database, GitBranch, Search, ShieldAlert, Wifi } from "lucide-react";
import { Group, Panel } from "react-resizable-panels";
import { useEffect, useState } from "react";

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

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(query);

    const updateMatches = () => {
      setMatches(media.matches);
    };

    updateMatches();
    media.addEventListener("change", updateMatches);

    return () => {
      media.removeEventListener("change", updateMatches);
    };
  }, [query]);

  return matches;
}

function AppTopChrome() {
  const connection = useEventStore(eventStoreSelectors.connection);
  const stats = useEventStore(eventStoreSelectors.stats);
  const filters = useEventStore(eventStoreSelectors.filters);
  const actions = useEventStore(eventStoreSelectors.actions);

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
      <div className="flex min-h-10 flex-wrap items-center gap-2 border-b border-white/[0.07] bg-[var(--chrome-bg)] px-3 py-2 backdrop-blur-xl sm:flex-nowrap sm:px-4 sm:py-0">
        <div className="flex items-center gap-2">
          <img
            alt="Spektr"
            className="h-6 w-6 shrink-0 rounded-md border border-white/10 bg-black/30 object-contain shadow-[0_6px_18px_rgba(0,0,0,0.22)]"
            draggable={false}
            src="/logo.png"
          />
        </div>
        <div className="min-w-0 flex-1 text-left text-[13px] font-medium tracking-[0.01em] text-[var(--text-tertiary)]">
          Spektr
          <span className="ml-2 hidden text-[var(--text-quaternary)] lg:inline">
            {activeServers.length > 0 ? activeServers.join(" · ") : "awaiting MCP servers"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-md border border-white/[0.08] bg-white/[0.045] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
            Session
          </div>
          <div className="hidden rounded-md border border-white/[0.08] bg-white/[0.045] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] lg:block">
            Local-only
          </div>
        </div>
      </div>

      <div className="flex min-h-10 flex-wrap items-center gap-3 border-b border-white/[0.07] bg-[var(--chrome-bg-soft)] px-3 py-2 backdrop-blur-xl sm:flex-nowrap sm:px-3.5 sm:py-0">
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connection.status === "connected"
                ? "bg-emerald-400 animate-pulse"
                : connection.status === "connecting"
                  ? "bg-sky-400"
                  : connection.status === "error"
                    ? "bg-rose-400"
                    : "bg-white/25"
            }`}
          />
          <span className="capitalize">{connection.status}</span>
        </div>
        <div className="hidden h-4 w-px bg-white/[0.08] md:block" />
        <div className="text-[12px] text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">{formatCount(stats.bufferedEvents)}</span>{" "}
          buffered
        </div>
        <div className="hidden h-4 w-px bg-white/[0.08] lg:block" />
        <div className="hidden text-[12px] text-[var(--text-secondary)] lg:block">
          <span className="font-medium text-[var(--text-primary)]">{formatCount(stats.totalReceived)}</span>{" "}
          total events
        </div>
        <div className="hidden h-4 w-px bg-white/[0.08] xl:block" />
        <div className="hidden text-[12px] text-[var(--text-secondary)] xl:block">
          High risk <span className="font-medium text-[var(--text-primary)]">{formatCount(highRiskCount)}</span>
        </div>
        <label className="flex min-w-0 basis-full items-center gap-2 rounded-[7px] border border-white/[0.085] bg-white/[0.045] px-2.5 py-1.5 text-[12px] text-[var(--text-tertiary)] focus-within:border-[var(--accent-ring)] focus-within:ring-1 focus-within:ring-[var(--accent-ring)] sm:basis-auto sm:flex-1">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-quaternary)]" strokeWidth={1.8} />
          <span className="sr-only">Search events</span>
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-quaternary)]"
            onChange={(event) => {
              actions.filters.patchFilters({ search: event.target.value });
            }}
            placeholder={
              activeFilterCount > 0
                ? `${formatCount(activeFilterCount)} filters applied`
                : "Search events..."
            }
            type="text"
            value={filters.search}
          />
        </label>
        <div className="flex items-center gap-2 text-[12px]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${criticalCount > 0 ? "bg-rose-400 animate-pulse" : "bg-white/25"}`}
          />
          <span className={criticalCount > 0 ? "text-rose-200" : "text-[var(--text-secondary)]"}>
            {criticalCount > 0 ? `${formatCount(criticalCount)} critical` : "No critical"}
          </span>
        </div>
      </div>

    </>
  );
}

function AppStatusbar() {
  const connection = useEventStore(eventStoreSelectors.connection);
  const stats = useEventStore(eventStoreSelectors.stats);
  const selectedEvent = useEventStore(eventStoreSelectors.selectedEvent);

  return (
    <div className="flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.07] bg-[var(--chrome-bg)] px-3 py-1 text-[11px] text-[var(--text-tertiary)] sm:flex-nowrap sm:px-3.5 sm:py-0">
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <Database className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span className="font-medium text-[var(--text-secondary)]">
          {formatCount(stats.bufferedEvents)}
        </span>
        buffered
      </div>
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <Wifi className="h-3.5 w-3.5" strokeWidth={1.8} />
        WebSocket :48300/api/events/live
      </div>
      <div className="hidden items-center gap-1.5 whitespace-nowrap lg:flex">
        <Activity className="h-3.5 w-3.5" strokeWidth={1.8} />
        Connected {formatConnectedSince(connection.connectedAt)}
      </div>
      <div className="hidden items-center gap-1.5 whitespace-nowrap xl:flex">
        <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span className={stats.riskCounts.critical > 0 ? "text-rose-300" : ""}>
          {formatCount(stats.riskCounts.critical)}
        </span>
        critical · <span className="text-amber-300">{formatCount(stats.riskCounts.medium)}</span> medium
      </div>
      <div className="min-w-0 basis-full truncate text-left sm:basis-auto sm:flex-1 sm:text-right">
        {selectedEvent
          ? `Focused: ${selectedEvent.serverName} · ${selectedEvent.toolName ?? selectedEvent.method}`
          : "Focused: none"}
      </div>
      <div className="hidden h-3.5 w-px bg-white/[0.08] lg:block" />
      <div className="hidden items-center gap-1.5 whitespace-nowrap lg:flex">
        <GitBranch className="h-3.5 w-3.5" strokeWidth={1.8} />
        local
      </div>
    </div>
  );
}

function WorkspaceShell() {
  const isCompactLayout = useMediaQuery("(max-width: 1359px)");

  if (isCompactLayout) {
    return (
      <div className="flex h-[calc(100dvh-1rem)] min-h-0 min-w-0 flex-col overflow-hidden rounded-[16px] border border-[var(--panel-border-strong)] bg-[#0a0c10]/92 shadow-[0_20px_60px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
        <AppTopChrome />
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden bg-[#0b0c10] p-1">
          <div className="h-[20rem] min-h-0 shrink-0 overflow-hidden">
            <SidebarPanel />
          </div>
          <div className="h-[28rem] min-h-0 shrink-0 overflow-hidden">
            <TimelinePanel compact />
          </div>
          <div className="h-[20rem] min-h-0 shrink-0 overflow-hidden">
            <InspectorPanel />
          </div>
        </div>
        <AppStatusbar />
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-1rem)] min-h-[var(--workspace-min-height)] min-w-[var(--workspace-min-width)] overflow-hidden sm:h-[calc(100dvh-1.5rem)]">
      <div className="flex h-full flex-col overflow-hidden rounded-[16px] border border-[var(--panel-border-strong)] bg-[#0a0c10]/92 shadow-[0_20px_60px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
        <AppTopChrome />
        <Group
          className="min-h-0 flex-1 bg-[#0b0c10] p-1"
          id="spektr-workspace-shell"
          orientation="horizontal"
          resizeTargetMinimumSize={{ coarse: 44, fine: 18 }}
        >
          <Panel defaultSize={280} id="sidebar" maxSize={360} minSize={248}>
            <div className="h-full min-h-0 min-w-[16rem] overflow-hidden">
              <SidebarPanel />
            </div>
          </Panel>

          <ResizeHandle />

          <Panel
            defaultSize={820}
            groupResizeBehavior="preserve-pixel-size"
            id="timeline"
            minSize={720}
          >
            <div className="h-full min-h-0 min-w-[var(--timeline-min-width)] overflow-hidden">
              <TimelinePanel />
            </div>
          </Panel>

          <ResizeHandle />

          <Panel defaultSize={340} id="inspector" maxSize={420} minSize={320}>
            <div className="h-full min-h-0 min-w-[20rem] overflow-hidden">
              <InspectorPanel />
            </div>
          </Panel>
        </Group>
        <AppStatusbar />
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <AppFrame>
      <WorkspaceShell />
    </AppFrame>
  );
}
