import { Funnel, RotateCcw, Search, Server, ShieldAlert, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";

import { PanelCard } from "../../../components/layout/PanelCard";
import type { EventDirection } from "../../../types/events";
import {
  eventStoreSelectors,
  makeFilterOptionsSelector,
  type FilterOption,
} from "../../../stores/event-selectors";
import { useEventStore } from "../../../stores/event-store";
import { cn } from "../../../lib/cn";

const SEARCH_SHORTCUT = "/";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function useSearchShortcut(inputRef: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target;
      const isEditable =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (event.key === SEARCH_SHORTCUT && !isEditable) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      if (event.key === "Escape" && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [inputRef]);
}

function toggleValue(values: ReadonlyArray<string>, value: string): ReadonlyArray<string> {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function getOptionDotClass(value: string): string {
  switch (value) {
    case "bash":
      return "bg-[var(--server-bash)]";
    case "critical":
      return "bg-[var(--risk-critical)]";
    case "filesystem":
      return "bg-[var(--server-filesystem)]";
    case "github":
      return "bg-[var(--server-github)]";
    case "high":
      return "bg-[var(--risk-high)]";
    case "low":
      return "bg-[var(--risk-low)]";
    case "medium":
      return "bg-[var(--risk-medium)]";
    case "notification":
      return "bg-amber-300";
    case "request":
      return "bg-sky-300";
    case "response":
      return "bg-emerald-300";
    default:
      return "bg-[var(--risk-none)]";
  }
}

function FilterChipGroup({
  icon,
  label,
  options,
  selectedValues,
  onToggle,
  compact = false,
}: {
  icon: ReactNode;
  label: string;
  options: ReadonlyArray<FilterOption>;
  selectedValues: ReadonlyArray<string>;
  onToggle: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <section className="rounded-[var(--radius-subpanel)] border border-white/[0.06] bg-black/[0.16] px-2.5 py-2.5">
      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-quaternary)]">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/[0.045] text-[var(--accent)]">
          {icon}
        </span>
        {label}
      </div>

      {options.length > 0 ? (
        <div className={cn("mt-2", compact ? "grid gap-1" : "grid gap-1.5")}>
          {options.map((option) => {
            const isSelected = selectedValues.includes(option.value);

            return (
              <button
                aria-pressed={isSelected}
                className={cn(
                  compact
                    ? "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-colors outline-none"
                    : "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-colors outline-none",
                  "focus-visible:border-[var(--accent-ring)] focus-visible:ring-1 focus-visible:ring-[var(--accent-ring)]",
                  isSelected
                    ? "border-white/[0.13] bg-white/[0.07] text-[var(--text-primary)]"
                    : "border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-white/[0.045] hover:text-[var(--text-primary)]",
                )}
                key={option.value}
                onClick={() => {
                  onToggle(option.value);
                }}
                type="button"
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", getOptionDotClass(option.value))} />
                <span className="min-w-0 flex-1 truncate">
                  {option.value}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--text-quaternary)]">
                  {formatCount(option.count)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-[11px] leading-4 text-[var(--text-tertiary)]">
          No buffered events yet.
        </p>
      )}
    </section>
  );
}

export function FilterSidebar() {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useSearchShortcut(searchInputRef);

  const sessionSelectorRef = useRef<ReturnType<typeof makeFilterOptionsSelector> | null>(null);
  const serverSelectorRef = useRef<ReturnType<typeof makeFilterOptionsSelector> | null>(null);
  const riskSelectorRef = useRef<ReturnType<typeof makeFilterOptionsSelector> | null>(null);

  if (sessionSelectorRef.current === null) {
    sessionSelectorRef.current = makeFilterOptionsSelector("session");
  }
  if (serverSelectorRef.current === null) {
    serverSelectorRef.current = makeFilterOptionsSelector("server");
  }
  if (riskSelectorRef.current === null) {
    riskSelectorRef.current = makeFilterOptionsSelector("risk");
  }

  const filters = useEventStore(eventStoreSelectors.filters);
  const hasActiveFilters = useEventStore(eventStoreSelectors.hasActiveFilters);
  const actions = useEventStore(eventStoreSelectors.actions);
  const sessionOptions = useEventStore(sessionSelectorRef.current);
  const serverOptions = useEventStore(serverSelectorRef.current);
  const riskOptions = useEventStore(riskSelectorRef.current);
  const stats = useEventStore(eventStoreSelectors.stats);

  const activeFilterCount = useMemo(
    () =>
      filters.sessionIds.length +
      filters.serverNames.length +
      filters.riskLevels.length +
      filters.directions.length +
      filters.categories.length +
      (filters.showPausedOnly ? 1 : 0) +
      (filters.search.trim().length > 0 ? 1 : 0),
    [
      filters.categories.length,
      filters.directions.length,
      filters.riskLevels.length,
      filters.search,
      filters.serverNames.length,
      filters.sessionIds.length,
      filters.showPausedOnly,
    ],
  );
  const directionOptions = useMemo<ReadonlyArray<FilterOption>>(
    () =>
      (["request", "response", "notification"] as const)
        .map((value) => ({ value, count: stats.directionCounts[value] }))
        .filter((option) => option.count > 0),
    [stats.directionCounts],
  );

  return (
    <PanelCard
      actions={
        hasActiveFilters ? (
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.045] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)] transition-colors hover:border-white/[0.16] hover:bg-white/[0.07] hover:text-[var(--text-primary)]"
            onClick={() => {
              actions.filters.resetFilters();
            }}
            type="button"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />
            Clear
          </button>
        ) : null
      }
      contentClassName="gap-2 overflow-y-auto"
      description="Local-first filtering for the buffered timeline. Press / to focus search."
      eyebrow="Workspace"
      title="Filters"
    >
      <div className="rounded-[var(--radius-subpanel)] border border-white/[0.06] bg-black/[0.16] px-2.5 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-quaternary)]">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/[0.045]">
              <Funnel className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={1.8} />
            </span>
            Active Filters
          </div>
          <span className="font-mono text-[11px] text-[var(--text-secondary)]">
            {formatCount(activeFilterCount)}
          </span>
        </div>

        <label className="mt-3 block">
          <span className="sr-only">Search buffered events</span>
          <div className="flex items-center gap-2 rounded-[7px] border border-white/[0.085] bg-white/[0.045] px-2.5 py-2 focus-within:border-[var(--accent-ring)] focus-within:ring-1 focus-within:ring-[var(--accent-ring)]">
            <Search className="h-4 w-4 text-[var(--text-quaternary)]" strokeWidth={1.8} />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              onChange={(event) => {
                actions.filters.patchFilters({ search: event.target.value });
              }}
              placeholder="Search method, tool, server, session"
              ref={searchInputRef}
              type="text"
              value={filters.search}
            />
            <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-quaternary)]">
              /
            </span>
          </div>
        </label>

        <button
          aria-pressed={filters.showPausedOnly}
          className={cn(
            "mt-2 flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-colors outline-none focus-visible:border-[var(--accent-ring)] focus-visible:ring-1 focus-visible:ring-[var(--accent-ring)]",
            filters.showPausedOnly
              ? "border-rose-400/25 bg-rose-400/12 text-rose-100"
              : "border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-white/[0.045] hover:text-[var(--text-primary)]",
          )}
          onClick={() => {
            actions.filters.patchFilters({ showPausedOnly: !filters.showPausedOnly });
          }}
          type="button"
        >
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-300" />
            Paused only
          </span>
          <span className="font-mono text-[10px] text-[var(--text-quaternary)]">
            {filters.showPausedOnly ? "on" : "off"}
          </span>
        </button>
      </div>

      <FilterChipGroup
        icon={<Workflow className="h-3.5 w-3.5" strokeWidth={1.8} />}
        label="Sessions"
        compact
        onToggle={(value) => {
          actions.filters.patchFilters({
            sessionIds: toggleValue(filters.sessionIds, value),
          });
        }}
        options={sessionOptions}
        selectedValues={filters.sessionIds}
      />

      <FilterChipGroup
        icon={<Server className="h-3.5 w-3.5" strokeWidth={1.8} />}
        label="Servers"
        compact
        onToggle={(value) => {
          actions.filters.patchFilters({
            serverNames: toggleValue(filters.serverNames, value),
          });
        }}
        options={serverOptions}
        selectedValues={filters.serverNames}
      />

      <FilterChipGroup
        icon={<ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.8} />}
        label="Risk"
        compact
        onToggle={(value) => {
          actions.filters.patchFilters({
            riskLevels: toggleValue(filters.riskLevels, value) as typeof filters.riskLevels,
          });
        }}
        options={riskOptions}
        selectedValues={filters.riskLevels}
      />

      <FilterChipGroup
        icon={<Funnel className="h-3.5 w-3.5" strokeWidth={1.8} />}
        label="Flow"
        compact
        onToggle={(value) => {
          actions.filters.patchFilters({
            directions: toggleValue(filters.directions, value) as ReadonlyArray<EventDirection>,
          });
        }}
        options={directionOptions}
        selectedValues={filters.directions}
      />

      <div className="mt-auto rounded-[var(--radius-subpanel)] border border-white/[0.06] bg-black/[0.2] px-2.5 py-2.5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-quaternary)]">
          Session Snapshot
        </p>
        <div className="mt-2 space-y-1 text-[11px] leading-4 text-[var(--text-secondary)]">
          <p>
            Buffered <span className="text-[var(--text-primary)]">{formatCount(stats.bufferedEvents)}</span>
          </p>
          <p>
            Servers <span className="text-[var(--text-primary)]">{formatCount(Object.keys(stats.serverCounts).length)}</span>
          </p>
          <p>
            High risk{" "}
            <span className="text-[var(--text-primary)]">
              {formatCount(stats.riskCounts.high + stats.riskCounts.critical)}
            </span>
          </p>
        </div>
      </div>
    </PanelCard>
  );
}
