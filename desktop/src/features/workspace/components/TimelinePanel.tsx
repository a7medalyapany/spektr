import { CircleDotDashed } from "lucide-react";
import { useRef } from "react";

import { PanelCard } from "../../../components/layout/PanelCard";
import { makeFilteredTimelineIdsSelector } from "../../../stores/event-selectors";
import { useEventStore } from "../../../stores/event-store";
import { cn } from "../../../lib/cn";
import { TimelineViewport } from "./timeline/TimelineViewport";

const STATUS_STYLES = {
  connected: "border-emerald-400/16 bg-emerald-400/12 text-emerald-100",
  connecting: "border-sky-400/16 bg-sky-400/12 text-sky-100",
  disconnected: "border-white/10 bg-white/[0.04] text-[var(--text-secondary)]",
  error: "border-rose-400/18 bg-rose-400/14 text-rose-100",
  idle: "border-white/10 bg-white/[0.04] text-[var(--text-secondary)]",
} as const;

const COUNT_FORMATTER = new Intl.NumberFormat("en-US");

function formatCount(value: number): string {
  return COUNT_FORMATTER.format(value);
}

function formatRelativeTimestamp(timestamp: string | null): string {
  if (!timestamp) {
    return "No traffic yet";
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

interface TimelinePanelProps {
  compact?: boolean;
}

export function TimelinePanel({ compact = false }: TimelinePanelProps) {
  const filteredIdsSelectorRef = useRef<ReturnType<typeof makeFilteredTimelineIdsSelector> | null>(
    null,
  );
  if (filteredIdsSelectorRef.current === null) {
    filteredIdsSelectorRef.current = makeFilteredTimelineIdsSelector();
  }

  const eventIds = useEventStore(filteredIdsSelectorRef.current);
  const connectionStatus = useEventStore((state) => state.connection.status);
  const totalReceived = useEventStore((state) => state.stats.totalReceived);
  const bufferedEvents = useEventStore((state) => state.stats.bufferedEvents);
  const droppedEvents = useEventStore((state) => state.stats.droppedEvents);
  const highRiskCount = useEventStore(
    (state) => state.stats.riskCounts.high + state.stats.riskCounts.critical,
  );
  const lastEventAt = useEventStore((state) => state.stats.lastEventAt);

  return (
    <PanelCard
      actions={
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
            STATUS_STYLES[connectionStatus],
          )}
        >
          <CircleDotDashed className="h-3.5 w-3.5" strokeWidth={1.8} />
          {connectionStatus}
        </span>
      }
      contentClassName="gap-1.5"
      description="Dense, virtualized live MCP traffic optimized for fast scanning."
      eyebrow="Live Stream"
      title="Timeline"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-subpanel)] border border-white/[0.06] bg-black/[0.16] px-2.5 py-1.5">
        <p className="text-[10px] text-[var(--text-secondary)]">
          <span className="text-[var(--text-primary)]">{formatCount(eventIds.length)}</span> visible
        </p>
        <p className="text-[10px] text-[var(--text-secondary)]">
          <span className="text-[var(--text-primary)]">{formatCount(bufferedEvents)}</span> buffered
        </p>
        <p className="text-[10px] text-[var(--text-secondary)]">
          <span className="text-[var(--text-primary)]">{formatCount(totalReceived)}</span> received
        </p>
        <p className="text-[10px] text-[var(--text-secondary)]">
          <span className="text-amber-300">{formatCount(highRiskCount)}</span> high risk
        </p>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
          <CircleDotDashed className="h-3 w-3" strokeWidth={1.8} />
          Latest {formatRelativeTimestamp(lastEventAt)}
          <span className="text-[var(--text-secondary)]">Dropped {formatCount(droppedEvents)}</span>
        </div>
      </div>

      <TimelineViewport compact={compact} eventIds={eventIds} />
    </PanelCard>
  );
}
