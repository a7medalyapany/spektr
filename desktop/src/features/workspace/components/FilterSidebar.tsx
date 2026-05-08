import { Funnel, RotateCcw, Search, Server, ShieldAlert, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";

import { PanelCard } from "../../../components/layout/PanelCard";
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
    <section className="rounded-[18px] border border-[var(--panel-border)] bg-[var(--surface-muted)] px-3 py-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-quaternary)]">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </span>
        {label}
      </div>

      {options.length > 0 ? (
        <div className={cn("mt-3", compact ? "grid gap-1.5" : "flex flex-wrap gap-2")}>
          {options.map((option) => {
            const isSelected = selectedValues.includes(option.value);

            return (
              <button
                aria-pressed={isSelected}
                className={cn(
                  compact
                    ? "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[11px] font-medium transition-colors outline-none"
                    : "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-left text-[11px] font-medium transition-colors outline-none",
                  "focus-visible:border-[var(--accent-ring)] focus-visible:ring-1 focus-visible:ring-[var(--accent-ring)]",
                  isSelected
                    ? "border-[var(--accent-ring)] bg-[var(--surface-selected)] text-[var(--text-primary)]"
                    : "border-white/10 bg-black/20 text-[var(--text-secondary)] hover:border-white/14 hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]",
                )}
                key={option.value}
                onClick={() => {
                  onToggle(option.value);
                }}
                type="button"
              >
                {compact ? (
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      isSelected ? "bg-[var(--accent)]" : "bg-white/20",
                    )}
                  />
                ) : null}
                <span className={cn("truncate", compact ? "flex-1" : "max-w-[148px]")}>
                  {option.value}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">
                  {formatCount(option.count)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-[12px] leading-5 text-[var(--text-secondary)]">
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
      (filters.search.trim().length > 0 ? 1 : 0),
    [filters.riskLevels.length, filters.search, filters.serverNames.length, filters.sessionIds.length],
  );

  return (
    <PanelCard
      actions={
        hasActiveFilters ? (
          <button
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)] transition-colors hover:border-white/16 hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
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
      contentClassName="gap-2.5"
      description="Local-first filtering for the buffered timeline. Press / to focus search."
      eyebrow="Workspace"
      title="Filters"
    >
      <div className="rounded-[18px] border border-[var(--panel-border)] bg-[var(--surface-muted)] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-quaternary)]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-soft)]">
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
          <div className="flex items-center gap-2 rounded-[14px] border border-white/10 bg-black/20 px-3 py-2.5 focus-within:border-[var(--accent-ring)] focus-within:ring-1 focus-within:ring-[var(--accent-ring)]">
            <Search className="h-4 w-4 text-[var(--text-quaternary)]" strokeWidth={1.8} />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              onChange={(event) => {
                actions.filters.patchFilters({ search: event.target.value });
              }}
              placeholder="Search method, tool, server, session"
              ref={searchInputRef}
              type="text"
              value={filters.search}
            />
            <span className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-quaternary)]">
              /
            </span>
          </div>
        </label>
      </div>

      <FilterChipGroup
        icon={<Workflow className="h-3.5 w-3.5" strokeWidth={1.8} />}
        label="Sessions"
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

      <div className="mt-auto rounded-[18px] border border-[var(--panel-border)] bg-black/20 px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-quaternary)]">
          Session Snapshot
        </p>
        <div className="mt-2 space-y-1.5 text-[11px] leading-5 text-[var(--text-secondary)]">
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
