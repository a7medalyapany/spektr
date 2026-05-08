import { Activity, CircleDotDashed, DatabaseZap, ShieldAlert } from "lucide-react";
import { useRef } from "react";
import type { ReactNode } from "react";

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

interface TimelineMetricProps {
  icon: ReactNode;
  label: string;
  value: string;
}

function TimelineMetric({ icon, label, value }: TimelineMetricProps) {
  return (
    <div className="rounded-[var(--radius-subpanel)] border border-[var(--panel-border)] bg-[var(--surface-muted)] px-3.5 py-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-quaternary)]">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-2 text-[14px] font-semibold tracking-[0.01em] text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

export function TimelinePanel() {
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
      contentClassName="gap-2.5"
      description="Virtualized live MCP traffic optimized for dense scanning and low-latency inspection."
      eyebrow="Live Stream"
      title="Timeline"
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <TimelineMetric
          icon={<DatabaseZap className="h-3.5 w-3.5" strokeWidth={1.8} />}
          label="Buffered"
          value={`${formatCount(eventIds.length)} visible`}
        />
        <TimelineMetric
          icon={<Activity className="h-3.5 w-3.5" strokeWidth={1.8} />}
          label="Ingress"
          value={`${formatCount(totalReceived)} received`}
        />
        <TimelineMetric
          icon={<ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.8} />}
          label="High Risk"
          value={`${formatCount(highRiskCount)} flagged`}
        />
        <TimelineMetric
          icon={<CircleDotDashed className="h-3.5 w-3.5" strokeWidth={1.8} />}
          label="Latest"
          value={formatRelativeTimestamp(lastEventAt)}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-subpanel)] border border-[var(--panel-border)] bg-[var(--surface-muted)] px-3.5 py-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
          Viewport: {formatCount(eventIds.length)} visible / {formatCount(bufferedEvents)} buffered
        </p>
        <p className="font-mono text-[11px] text-[var(--text-secondary)]">
          Received: {formatCount(totalReceived)} · Dropped: {formatCount(droppedEvents)}
        </p>
      </div>

      <TimelineViewport eventIds={eventIds} />
    </PanelCard>
  );
}
