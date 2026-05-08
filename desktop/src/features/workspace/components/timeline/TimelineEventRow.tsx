import { memo, useRef } from "react";

import { cn } from "../../../../lib/cn";
import {
  makeEventByIdSelector,
  makeIsEventSelectedSelector,
} from "../../../../stores/event-selectors";
import { useEventStore } from "../../../../stores/event-store";
import type { EventDirection, RiskLevel } from "../../../../types/events";

export const TIMELINE_ROW_HEIGHT_DESKTOP = 40;
export const TIMELINE_ROW_HEIGHT_COMPACT = 72;

const DIRECTION_STYLES: Record<EventDirection, string> = {
  notification: "border-amber-400/14 bg-amber-400/10 text-amber-100",
  request: "border-sky-400/14 bg-sky-400/10 text-sky-100",
  response: "border-emerald-400/14 bg-emerald-400/10 text-emerald-100",
};

const DIRECTION_LABELS: Record<EventDirection, string> = {
  notification: "note",
  request: "req",
  response: "res",
};

const RISK_STYLES: Record<RiskLevel, string> = {
  critical: "border-rose-400/18 bg-rose-400/14 text-rose-100",
  high: "border-orange-400/18 bg-orange-400/12 text-orange-100",
  low: "border-sky-400/16 bg-sky-400/10 text-sky-100",
  medium: "border-amber-400/18 bg-amber-400/12 text-amber-100",
  none: "border-white/[0.08] bg-white/[0.035] text-[var(--text-tertiary)]",
};

const RISK_EDGE_STYLES: Record<RiskLevel, string> = {
  critical: "border-l-rose-400",
  high: "border-l-orange-400",
  low: "border-l-sky-500",
  medium: "border-l-amber-500",
  none: "border-l-slate-600",
};

const SERVER_STYLES: Record<string, string> = {
  bash: "bg-[rgba(216,112,80,0.16)] text-[#d87050]",
  filesystem: "bg-[rgba(30,168,150,0.16)] text-[#1ea896]",
  github: "bg-[rgba(155,125,224,0.16)] text-[#9b7de0]",
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

function formatCost(totalUsd: number | null | undefined): string {
  if (!totalUsd || totalUsd <= 0) {
    return "--";
  }

  if (totalUsd < 0.01) {
    return `$${totalUsd.toFixed(4)}`;
  }

  return `$${totalUsd.toFixed(2)}`;
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
  compact?: boolean;
}

export const TimelineEventRow = memo(function TimelineEventRow({
  eventId,
  compact = false,
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
        compact
          ? "group relative h-[72px] w-full border-0 border-l-[3px] border-t border-t-white/[0.04] bg-transparent px-2.5 py-2 text-left transition-colors outline-none"
          : "group relative h-[40px] w-full border-0 border-l-[3px] border-t border-t-white/[0.04] bg-transparent px-2.5 text-left transition-colors outline-none",
        RISK_EDGE_STYLES[event.riskLevel],
        "hover:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-[var(--accent-ring)]",
        isSelected && "bg-white/[0.055] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]",
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
      <div
        className={
          compact
            ? "grid h-full grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2"
            : "grid h-full grid-cols-[86px_90px_minmax(0,1fr)_54px_62px_72px_64px] items-center gap-2"
        }
      >
        {compact ? (
          <>
            <div className="min-w-0 space-y-1">
              <div className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">
                {formatTimestamp(event.timestamp)}
              </div>
              <div className="min-w-0">
                <span
                  className={cn(
                    "inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    getServerBadgeStyle(event.serverName),
                  )}
                >
                  <span className="truncate">{event.serverName}</span>
                </span>
                <p className="mt-0.5 truncate font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--text-quaternary)]">
                  {event.transport}
                </p>
              </div>
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
                <p className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
                  {toolLabel}
                </p>
              </div>
              <p className="truncate text-[9px] text-[var(--text-tertiary)]">{methodLabel}</p>
              {event.paused ? (
                <span className="mt-1 inline-flex shrink-0 rounded-full bg-rose-400/18 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-rose-200">
                  Paused
                </span>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col items-end gap-1 text-right">
              <div className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">
                {formatLatency(event.durationMs)}
              </div>
              <span
                className={cn(
                  "inline-flex min-w-[64px] items-center justify-center rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em]",
                  DIRECTION_STYLES[event.direction],
                )}
              >
                {DIRECTION_LABELS[event.direction]}
              </span>
              <span
                className={cn(
                  "inline-flex min-w-[64px] items-center justify-center rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em]",
                  RISK_STYLES[event.riskLevel],
                )}
              >
                {formatRiskLabel(event.riskLevel)}
              </span>
              <div className="font-mono text-[10px] tabular-nums text-[var(--text-quaternary)]">
                {formatCost(event.cost?.totalUsd)}
              </div>
            </div>
          </>
        ) : (
          <>
        <div className="min-w-0 font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">
          {formatTimestamp(event.timestamp)}
        </div>

        <div className="min-w-0">
          <span
            className={cn(
              "inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
              getServerBadgeStyle(event.serverName),
            )}
          >
            <span className="truncate">{event.serverName}</span>
          </span>
          <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-quaternary)]">
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
            {event.paused ? (
              <span className="shrink-0 rounded-full bg-rose-400/18 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-rose-200">
                Paused
              </span>
            ) : null}
          </div>
          <p className="truncate text-[10px] text-[var(--text-tertiary)]">{methodLabel}</p>
        </div>

        <div className="min-w-0">
          <span
            className={cn(
              "inline-flex min-w-[44px] items-center justify-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]",
              DIRECTION_STYLES[event.direction],
            )}
          >
            {DIRECTION_LABELS[event.direction]}
          </span>
        </div>

        <div className="min-w-0 text-right font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">
          {formatLatency(event.durationMs)}
        </div>

        <div className="min-w-0">
          <span
            className={cn(
              "inline-flex min-w-[64px] items-center justify-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]",
              RISK_STYLES[event.riskLevel],
            )}
          >
            {formatRiskLabel(event.riskLevel)}
          </span>
        </div>

        <div className="min-w-0 text-right font-mono text-[10px] tabular-nums text-[var(--text-quaternary)]">
          {formatCost(event.cost?.totalUsd)}
        </div>
          </>
        )}
      </div>
    </button>
  );
});
