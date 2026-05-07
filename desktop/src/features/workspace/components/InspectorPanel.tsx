import { memo } from "react";
import type { ReactNode } from "react";
import {
  Braces,
  Clock3,
  PanelRightOpen,
  ScanSearch,
  ShieldAlert,
  SplitSquareVertical,
} from "lucide-react";

import { PanelCard } from "../../../components/layout/PanelCard";
import { eventStoreSelectors } from "../../../stores/event-selectors";
import { useEventStore } from "../../../stores/event-store";
import type { JsonValue, MCPEvent } from "../../../types/events";
import { cn } from "../../../lib/cn";

type InspectorValue = JsonValue | MCPEvent["error"];

const RISK_STYLES = {
  critical: "border-rose-400/18 bg-rose-400/14 text-rose-100",
  high: "border-orange-400/18 bg-orange-400/14 text-orange-100",
  low: "border-emerald-400/18 bg-emerald-400/14 text-emerald-100",
  medium: "border-amber-400/18 bg-amber-400/14 text-amber-100",
  none: "border-white/10 bg-white/[0.04] text-[var(--text-secondary)]",
} as const;

function formatTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return parsed.toLocaleString("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    second: "2-digit",
  });
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

function formatJson(value: InspectorValue | null): string {
  if (value === null) {
    return "null";
  }

  return JSON.stringify(value, null, 2);
}

function getPrimaryLabel(event: MCPEvent): string {
  if (event.toolName && event.toolName.trim().length > 0) {
    return event.toolName;
  }

  return event.method;
}

interface InspectorMetaItemProps {
  icon: ReactNode;
  label: string;
  value: string;
}

function InspectorMetaItem({ icon, label, value }: InspectorMetaItemProps) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
        <span className="text-[var(--accent)]">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-[13px] font-medium tracking-[0.01em] text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

interface JsonBlockProps {
  label: string;
  value: InspectorValue | null;
}

const JsonBlock = memo(function JsonBlock({ label, value }: JsonBlockProps) {
  if (value === null) {
    return null;
  }

  return (
    <section className="min-h-0 rounded-[20px] border border-white/8 bg-black/20">
      <div className="border-b border-white/8 px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
          {label}
        </p>
      </div>
      <pre className="max-h-[240px] overflow-auto px-4 py-3 font-mono text-[11px] leading-5 text-[var(--text-secondary)]">
        {formatJson(value)}
      </pre>
    </section>
  );
});

function EmptyInspectorState() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <InspectorMetaItem
        icon={<Braces className="h-4 w-4" strokeWidth={1.8} />}
        label="Primary Detail"
        value="Select a timeline row"
      />
      <InspectorMetaItem
        icon={<PanelRightOpen className="h-4 w-4" strokeWidth={1.8} />}
        label="Boundary"
        value="Heavy viewers stay isolated here"
      />
      <div className="grid gap-3 md:grid-cols-2">
        <InspectorMetaItem
          icon={<ScanSearch className="h-4 w-4" strokeWidth={1.8} />}
          label="Metadata"
          value="Server, risk, timing, tool facets"
        />
        <InspectorMetaItem
          icon={<SplitSquareVertical className="h-4 w-4" strokeWidth={1.8} />}
          label="Expansion"
          value="Ready for raw JSON and diffs"
        />
      </div>
      <div className="min-h-0 flex-1 rounded-[20px] border border-dashed border-white/10 bg-black/10 p-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
          Waiting for selection
        </p>
        <p className="mt-3 max-w-sm text-[12px] leading-5 text-[var(--text-secondary)]">
          The inspector binds directly to the centralized timeline selection state. Selecting a row
          projects its metadata and payloads here without forcing the timeline container to rerender.
        </p>
      </div>
    </div>
  );
}

function SelectedInspectorState({ event }: { event: MCPEvent }) {
  const primaryLabel = getPrimaryLabel(event);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "inline-flex min-w-[82px] items-center justify-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
              RISK_STYLES[event.riskLevel],
            )}
          >
            {event.riskLevel === "none" ? "clean" : event.riskLevel}
          </span>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
            {event.serverName} · {event.direction} · {event.transport}
          </p>
        </div>
        <p className="mt-4 text-[16px] font-medium tracking-[0.01em] text-[var(--text-primary)]">
          {primaryLabel}
        </p>
        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{event.method}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <InspectorMetaItem
          icon={<Clock3 className="h-4 w-4" strokeWidth={1.8} />}
          label="Timestamp"
          value={formatTimestamp(event.timestamp)}
        />
        <InspectorMetaItem
          icon={<ShieldAlert className="h-4 w-4" strokeWidth={1.8} />}
          label="Latency"
          value={formatLatency(event.durationMs)}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <InspectorMetaItem
          icon={<ScanSearch className="h-4 w-4" strokeWidth={1.8} />}
          label="Session"
          value={event.sessionId}
        />
        <InspectorMetaItem
          icon={<SplitSquareVertical className="h-4 w-4" strokeWidth={1.8} />}
          label="Paired Event"
          value={event.pairedId ?? "Unpaired"}
        />
      </div>

      <div className="grid min-h-0 gap-3">
        <JsonBlock label="Params" value={event.params} />
        <JsonBlock label="Tool Args" value={event.toolArgs} />
        <JsonBlock label="Result" value={event.result} />
        <JsonBlock label="Error" value={event.error} />
      </div>
    </div>
  );
}

export function InspectorPanel() {
  const selectedEvent = useEventStore(eventStoreSelectors.selectedEvent);

  return (
    <PanelCard
      description="Focused event details stay isolated here so timeline virtualization and row memoization remain cheap."
      eyebrow="Inspector"
      title="Event Detail"
    >
      {selectedEvent ? <SelectedInspectorState event={selectedEvent} /> : <EmptyInspectorState />}
    </PanelCard>
  );
}
