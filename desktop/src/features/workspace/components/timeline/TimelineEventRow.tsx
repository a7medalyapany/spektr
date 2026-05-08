import { memo, useRef } from "react";

import { cn } from "../../../../lib/cn";
import {
  makeEventByIdSelector,
  makeIsEventSelectedSelector,
} from "../../../../stores/event-selectors";
import { useEventStore } from "../../../../stores/event-store";
import type { EventDirection, RiskLevel } from "../../../../types/events";

export const TIMELINE_ROW_HEIGHT = 62;

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

const RISK_BAR_STYLES: Record<RiskLevel, string> = {
  critical: "bg-rose-400",
  high: "bg-orange-400",
  low: "bg-emerald-400",
  medium: "bg-amber-400",
  none: "bg-slate-500/70",
};

const SERVER_STYLES: Record<string, string> = {
  bash: "border-orange-400/18 bg-orange-400/12 text-orange-100",
  filesystem: "border-teal-400/18 bg-teal-400/12 text-teal-100",
  github: "border-violet-400/18 bg-violet-400/12 text-violet-100",
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

function getServerBadgeStyle(serverName: string): string {
  return (
    SERVER_STYLES[serverName.toLowerCase()] ??
    "border-white/10 bg-white/[0.05] text-[var(--text-secondary)]"
  );
}

interface TimelineEventRowProps {
  eventId: string;
}

export const TimelineEventRow = memo(function TimelineEventRow({
  eventId,
}: TimelineEventRowProps) {
  const eventSelectorRef = useRef<ReturnType<typeof makeEventByIdSelector> | null>(null);
  const isSelectedSelectorRef = useRef<ReturnType<typeof makeIsEventSelectedSelector> | null>(null);
  if (eventSelectorRef.current === null) {
    eventSelectorRef.current = makeEventByIdSelector(eventId);
  }
  if (isSelectedSelectorRef.current === null) {
    isSelectedSelectorRef.current = makeIsEventSelectedSelector(eventId);
  }

  const event = useEventStore(eventSelectorRef.current);
  const isSelected = useEventStore(isSelectedSelectorRef.current);
  const selectEvent = useEventStore((state) => state.actions.selection.selectEvent);

  if (!event) {
    return null;
  }

  const toolLabel = getToolLabel(event.toolName, event.method);
  const methodLabel = event.toolName ? event.method : event.category.replace(/_/g, "/");

  return (
    <button
      aria-selected={isSelected}
      className={cn(
        "group relative h-[62px] w-full rounded-[16px] border px-3.5 text-left transition-colors outline-none",
        "border-white/[0.05] bg-[linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0.016))]",
        "hover:border-white/[0.1] hover:bg-[var(--surface-subtle)] focus-visible:border-[var(--accent-ring)] focus-visible:ring-1 focus-visible:ring-[var(--accent-ring)]",
        isSelected &&
          "border-[var(--accent-ring)] bg-[linear-gradient(180deg,rgba(138,180,255,0.16),rgba(138,180,255,0.07))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
      )}
      onClick={() => {
        selectEvent(eventId);
      }}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      role="option"
      tabIndex={-1}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-2 left-1 w-0.5 rounded-full transition-opacity",
          RISK_BAR_STYLES[event.riskLevel],
          isSelected ? "opacity-100" : "opacity-80 group-hover:opacity-100",
        )}
      />
      <div className="grid h-full grid-cols-[104px_92px_minmax(0,1fr)_64px_76px_78px] items-center gap-3">
        <div className="min-w-0 font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
          {formatTimestamp(event.timestamp)}
        </div>

        <div className="min-w-0">
          <span
            className={cn(
              "inline-flex max-w-full items-center rounded-full border px-2 py-1 text-[10px] font-semibold",
              getServerBadgeStyle(event.serverName),
            )}
          >
            <span className="truncate">{event.serverName}</span>
          </span>
          <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-quaternary)]">
            {event.transport}
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "text-[12px]",
                event.direction === "request"
                  ? "text-sky-300"
                  : event.direction === "response"
                    ? "text-emerald-300"
                    : "text-amber-300",
              )}
            >
              {event.direction === "request" ? "→" : event.direction === "response" ? "←" : "•"}
            </span>
            <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">
              {toolLabel}
            </p>
          </div>
          <p className="truncate text-[11px] text-[var(--text-secondary)]">{methodLabel}</p>
        </div>

        <div className="min-w-0">
          <span
            className={cn(
              "inline-flex min-w-[52px] items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
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
              "inline-flex min-w-[70px] items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
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
