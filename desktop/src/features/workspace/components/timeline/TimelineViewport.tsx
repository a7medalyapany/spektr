import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Orbit, RadioTower } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { cn } from "../../../../lib/cn";
import { useTimelineSelectionNavigation } from "../../hooks/useTimelineSelectionNavigation";
import { TimelineEventRow, TIMELINE_ROW_HEIGHT } from "./TimelineEventRow";

const OVERSCAN_ROWS = 12;
const FOLLOW_LIVE_THRESHOLD_PX = TIMELINE_ROW_HEIGHT * 2;

const COLUMN_LABELS = [
  "Time",
  "Server",
  "Tool",
  "Flow",
  "Latency",
  "Risk",
] as const;

interface TimelineViewportProps {
  eventIds: ReadonlyArray<string>;
}

export function TimelineViewport({ eventIds }: TimelineViewportProps) {
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const followLiveRef = useRef(true);
  const [isFollowingLive, setIsFollowingLive] = useState(true);

  const rowVirtualizer = useVirtualizer({
    count: eventIds.length,
    estimateSize: () => TIMELINE_ROW_HEIGHT,
    getItemKey: (index) => eventIds[index] ?? index,
    getScrollElement: () => scrollElementRef.current,
    overscan: OVERSCAN_ROWS,
  });
  const { onKeyDown, onPointerDownCapture } = useTimelineSelectionNavigation({
    eventIds,
    scrollElementRef,
    rowVirtualizer,
  });

  const syncFollowState = useEffectEvent((nextState: boolean) => {
    followLiveRef.current = nextState;
    setIsFollowingLive((currentState) => {
      if (currentState === nextState) {
        return currentState;
      }

      return nextState;
    });
  });

  const updateFollowState = useEffectEvent(() => {
    const element = scrollElementRef.current;
    if (!element) {
      return;
    }

    const remainingScroll = element.scrollHeight - element.scrollTop - element.clientHeight;
    syncFollowState(remainingScroll <= FOLLOW_LIVE_THRESHOLD_PX);
  });

  useEffect(() => {
    const element = scrollElementRef.current;
    if (!element) {
      return undefined;
    }

    updateFollowState();
    element.addEventListener("scroll", updateFollowState, { passive: true });

    return () => {
      element.removeEventListener("scroll", updateFollowState);
    };
  }, [updateFollowState]);

  useEffect(() => {
    if (eventIds.length === 0) {
      syncFollowState(true);
      return;
    }

    if (!followLiveRef.current) {
      return;
    }

    rowVirtualizer.scrollToIndex(eventIds.length - 1, { align: "end" });
  }, [eventIds.length, rowVirtualizer, syncFollowState]);

  if (eventIds.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col rounded-[22px] border border-[var(--panel-border-strong)] bg-[var(--panel-bg-strong)]">
        <div className="grid grid-cols-[104px_92px_minmax(0,1fr)_64px_76px_78px] gap-3 border-b border-white/[0.07] px-4 py-3">
          {COLUMN_LABELS.map((label) => (
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-quaternary)]"
              key={label}
            >
              {label}
            </p>
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-sm rounded-[20px] border border-dashed border-white/[0.08] bg-[var(--surface-muted)] px-5 py-6 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.08] bg-[var(--surface-subtle)] text-[var(--accent)]">
              <Orbit className="h-4 w-4" strokeWidth={1.8} />
            </div>
            <p className="mt-4 text-[13px] font-medium text-[var(--text-primary)]">
              Waiting for MCP traffic
            </p>
            <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
              The viewport is live and ready. New request and response events will stream into
              this surface as soon as the proxy receives them.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-[var(--panel-border-strong)] bg-[var(--panel-bg-strong)]">
      <div className="grid grid-cols-[104px_92px_minmax(0,1fr)_64px_76px_78px] gap-3 border-b border-white/[0.07] px-4 py-3">
        {COLUMN_LABELS.map((label) => (
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-quaternary)]"
            key={label}
          >
            {label}
          </p>
        ))}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          className="absolute inset-0 overflow-y-auto overflow-x-hidden px-2 py-2 outline-none [scrollbar-gutter:stable] focus-visible:ring-1 focus-visible:ring-[var(--accent-ring)]"
          onKeyDown={onKeyDown}
          onPointerDownCapture={onPointerDownCapture}
          role="listbox"
          ref={scrollElementRef}
          tabIndex={0}
        >
          <div
            className="relative w-full"
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const eventId = eventIds[virtualRow.index];
              if (!eventId) {
                return null;
              }

              return (
                <div
                  className="absolute left-0 top-0 w-full"
                  key={virtualRow.key}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <TimelineEventRow eventId={eventId} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 right-3 flex justify-end">
          <button
            className={cn(
              "pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium text-[var(--text-primary)] shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-colors",
              isFollowingLive
                ? "border-emerald-400/16 bg-emerald-400/12 text-emerald-100"
                : "border-white/10 bg-black/30 hover:border-white/16 hover:bg-white/[0.06]",
            )}
            onClick={() => {
              syncFollowState(true);
              rowVirtualizer.scrollToIndex(eventIds.length - 1, { align: "end" });
            }}
            type="button"
          >
            {isFollowingLive ? (
              <RadioTower className="h-3.5 w-3.5" strokeWidth={1.8} />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.8} />
            )}
            {isFollowingLive ? "Following live" : "Jump to live"}
          </button>
        </div>
      </div>
    </div>
  );
}
