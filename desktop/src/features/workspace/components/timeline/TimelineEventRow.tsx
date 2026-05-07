import { memo, useRef } from "react";

import { cn } from "../../../../lib/cn";
import { makeEventByIdSelector } from "../../../../stores/event-selectors";
import { useEventStore } from "../../../../stores/event-store";
import type { EventDirection, RiskLevel } from "../../../../types/events";

export const TIMELINE_ROW_HEIGHT = 58;

const DIRECTION_STYLES: Record<EventDirection, string> = {
  notification: "border-amber-400/16 bg-amber-400/12 text-amber-100",
  request: "border-sky-400/16 bg-sky-400/12 text-sky-100",
  response: "border-emerald-400/16 bg-emerald-400/12 text-emerald-100",
};

const DIRECTION_LABELS: Record<EventDirection, string> = {
  notification: "note",
  request: "req",
  response: "res",
};

const RISK_STYLES: Record<RiskLevel, string> = {
  critical: "border-rose-400/18 bg-rose-400/14 text-rose-100",
  high: "border-orange-400/18 bg-orange-400/14 text-orange-100",
  low: "border-emerald-400/18 bg-emerald-400/14 text-emerald-100",
  medium: "border-amber-400/18 bg-amber-400/14 text-amber-100",
  none: "border-white/10 bg-white/[0.04] text-[var(--text-secondary)]",
};

function formatTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  const seconds = String(parsed.getSeconds()).padStart(2, "0");
  const milliseconds = String(parsed.getMilliseconds()).padStart(3, "0");

  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function formatLatency(durationMs: number): string {
  if (durationMs <= 0) {
    return "--";
  }

  if (durationMs < 1) {
    return "<1ms";
  }

  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`;
  }

  return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`;
}

function formatRiskLabel(riskLevel: RiskLevel): string {
  return riskLevel === "none" ? "clean" : riskLevel;
}

function getToolLabel(toolName: string | null, method: string): string {
  if (toolName && toolName.trim().length > 0) {
    return toolName;
  }

  return method;
}

interface TimelineEventRowProps {
  eventId: string;
}

export const TimelineEventRow = memo(function TimelineEventRow({
  eventId,
}: TimelineEventRowProps) {
  const eventSelectorRef = useRef<ReturnType<typeof makeEventByIdSelector> | null>(null);
  if (eventSelectorRef.current === null) {
    eventSelectorRef.current = makeEventByIdSelector(eventId);
  }

  const event = useEventStore(eventSelectorRef.current);
  const isSelected = useEventStore((state) => state.selectedEventId === eventId);
  const selectEvent = useEventStore((state) => state.actions.selection.selectEvent);

  if (!event) {
    return null;
  }

  const toolLabel = getToolLabel(event.toolName, event.method);
  const methodLabel = event.toolName ? event.method : event.category.replace(/_/g, "/");

  return (
    <button
      aria-pressed={isSelected}
      className={cn(
        "group h-[58px] w-full rounded-[18px] border px-3 text-left transition-colors outline-none",
        "border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.02))]",
        "hover:border-white/[0.12] hover:bg-white/[0.055] focus-visible:border-[var(--accent)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]",
        isSelected &&
          "border-[rgba(139,184,255,0.34)] bg-[linear-gradient(180deg,rgba(139,184,255,0.14),rgba(139,184,255,0.06))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
      )}
      onClick={() => {
        selectEvent(eventId);
      }}
      type="button"
    >
      <div className="grid h-full grid-cols-[96px_88px_minmax(0,1fr)_64px_76px_78px] items-center gap-3">
        <div className="min-w-0 font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
          {formatTimestamp(event.timestamp)}
        </div>

        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium tracking-[0.01em] text-[var(--text-primary)]">
            {event.serverName}
          </p>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
            {event.transport}
          </p>
        </div>

        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-[var(--text-primary)]">
            {toolLabel}
          </p>
          <p className="truncate text-[11px] text-[var(--text-secondary)]">{methodLabel}</p>
        </div>

        <div className="min-w-0">
          <span
            className={cn(
              "inline-flex min-w-[52px] items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
              DIRECTION_STYLES[event.direction],
            )}
          >
            {DIRECTION_LABELS[event.direction]}
          </span>
        </div>

        <div className="min-w-0 font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
          {formatLatency(event.durationMs)}
        </div>

        <div className="min-w-0">
          <span
            className={cn(
              "inline-flex min-w-[70px] items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
              RISK_STYLES[event.riskLevel],
            )}
          >
            {formatRiskLabel(event.riskLevel)}
          </span>
        </div>
      </div>
    </button>
  );
});
