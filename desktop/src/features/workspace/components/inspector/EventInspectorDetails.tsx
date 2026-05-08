import { useQuery } from "@tanstack/react-query";
import { Braces, Clock3, Link2, ScanSearch, ShieldAlert, SplitSquareVertical } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { PanelCard } from "../../../../components/layout/PanelCard";
import { fetchEventDetail } from "../../../../lib/event-details-api";
import type { MCPEventDetail } from "../../../../lib/event-details-api";
import { queryKeys } from "../../../../lib/query-keys";
import { cn } from "../../../../lib/cn";
import { useEventStore } from "../../../../stores/event-store";
import type { MCPEvent } from "../../../../types/events";
import {
  buildParsedPayloadSections,
  formatEventTimestamp,
  formatJsonDocument,
  formatLatency,
  getPrimaryLabel,
  INSPECTOR_RISK_STYLES,
  sanitizeRawPayload,
} from "../../lib/event-inspector";
import { CodeMirrorJsonView } from "./CodeMirrorJsonView";

type PayloadTab = "parsed" | "raw";

interface InspectorMetaItemProps {
  icon: ReactNode;
  label: string;
  value: string;
}

function InspectorMetaItem({ icon, label, value }: InspectorMetaItemProps) {
  return (
    <div className="rounded-[18px] border border-[var(--panel-border)] bg-[var(--surface-muted)] px-3.5 py-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-quaternary)]">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-2 break-all text-[13px] font-medium leading-5 tracking-[0.01em] text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

const InspectorCodeBlock = memo(function InspectorCodeBlock({
  title,
  document,
}: {
  title: string;
  document: string;
}) {
  return (
    <section className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-[20px] border border-[var(--panel-border)] bg-black/20">
      <div className="border-b border-white/[0.07] px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-quaternary)]">
          {title}
        </p>
      </div>
      <CodeMirrorJsonView document={document} />
    </section>
  );
});

function PayloadTabs({
  activeTab,
  onChange,
}: {
  activeTab: PayloadTab;
  onChange: (tab: PayloadTab) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-white/10 bg-black/20 p-1">
      {(["parsed", "raw"] as const).map((tab) => (
        <button
          className={cn(
            "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors",
            activeTab === tab
              ? "bg-[var(--surface-selected)] text-[var(--text-primary)]"
              : "text-[var(--text-tertiary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]",
          )}
          key={tab}
          onClick={() => {
            onChange(tab);
          }}
          type="button"
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function DetailPayloadView({ detail }: { detail: MCPEventDetail }) {
  const [activeTab, setActiveTab] = useState<PayloadTab>("parsed");
  const parsedSections = useMemo(
    () =>
      buildParsedPayloadSections(detail).map((section) => ({
        ...section,
        document: formatJsonDocument(section.value),
      })),
    [detail],
  );
  const rawDocument = useMemo(() => sanitizeRawPayload(detail.rawPayload), [detail.rawPayload]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-quaternary)]">
          Payload View
        </p>
        <PayloadTabs activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === "raw" ? (
        <InspectorCodeBlock document={rawDocument} title="Raw JSON-RPC" />
      ) : parsedSections.length > 0 ? (
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-2">
          {parsedSections.map((section) => (
            <InspectorCodeBlock
              document={section.document}
              key={section.id}
              title={section.label}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[180px] items-center justify-center rounded-[20px] border border-dashed border-white/[0.08] bg-black/10 px-4 text-center">
          <p className="max-w-sm text-[12px] leading-5 text-[var(--text-secondary)]">
            No parsed payload fields were extracted for this event. Switch to the raw view to
            inspect the underlying JSON-RPC frame.
          </p>
        </div>
      )}
    </div>
  );
}

function DetailState({
  detail,
  title,
  description,
  canJumpToPaired,
  onJumpToPaired,
}: {
  detail: MCPEventDetail;
  title: string;
  description: string;
  canJumpToPaired: boolean;
  onJumpToPaired: () => void;
}) {
  const primaryLabel = getPrimaryLabel(detail);

  return (
    <PanelCard
      contentClassName="gap-3"
      description={description}
      eyebrow="Inspector"
      title={title}
    >
      <div className="rounded-[20px] border border-[var(--panel-border)] bg-[var(--surface-muted)] px-4 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "inline-flex min-w-[82px] items-center justify-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
              INSPECTOR_RISK_STYLES[detail.riskLevel],
            )}
          >
            {detail.riskLevel === "none" ? "clean" : detail.riskLevel}
          </span>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            {detail.serverName} · {detail.direction} · {detail.transport}
          </p>
        </div>
        <p className="mt-4 text-[17px] font-semibold tracking-[0.01em] text-[var(--text-primary)]">
          {primaryLabel}
        </p>
        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{detail.method}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <InspectorMetaItem
          icon={<Clock3 className="h-4 w-4" strokeWidth={1.8} />}
          label="Timestamp"
          value={formatEventTimestamp(detail.timestamp)}
        />
        <InspectorMetaItem
          icon={<ShieldAlert className="h-4 w-4" strokeWidth={1.8} />}
          label="Latency"
          value={formatLatency(detail.durationMs)}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InspectorMetaItem
          icon={<ScanSearch className="h-4 w-4" strokeWidth={1.8} />}
          label="Session"
          value={detail.sessionId}
        />
        <InspectorMetaItem
          icon={<SplitSquareVertical className="h-4 w-4" strokeWidth={1.8} />}
          label="Message ID"
          value={detail.messageId === null ? "None" : JSON.stringify(detail.messageId)}
        />
        <InspectorMetaItem
          icon={<Braces className="h-4 w-4" strokeWidth={1.8} />}
          label="Category"
          value={detail.category}
        />
        <InspectorMetaItem
          icon={<Link2 className="h-4 w-4" strokeWidth={1.8} />}
          label="Paired Event"
          value={detail.pairedId ?? "Unpaired"}
        />
      </div>

      {detail.pairedId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[var(--panel-border)] bg-[var(--surface-muted)] px-3.5 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-quaternary)]">
              Request / Response Link
            </p>
            <p className="mt-1 font-mono text-[11px] text-[var(--text-secondary)]">
              {detail.pairedId}
            </p>
          </div>
          <button
            className={cn(
              "rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors",
              canJumpToPaired
                ? "border-[var(--accent-ring)] bg-[var(--surface-selected)] text-[var(--text-primary)] hover:bg-[var(--surface-selected-strong)]"
                : "cursor-not-allowed border-white/10 bg-white/[0.03] text-[var(--text-tertiary)]",
            )}
            disabled={!canJumpToPaired}
            onClick={onJumpToPaired}
            type="button"
          >
            {canJumpToPaired ? "Jump to linked event" : "Linked event not buffered"}
          </button>
        </div>
      ) : null}

      {detail.riskFlags.length > 0 ? (
        <div className="rounded-[20px] border border-[var(--panel-border)] bg-black/20 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-quaternary)]">
            Risk Indicators
          </p>
          <div className="mt-3 grid gap-2">
            {detail.riskFlags.map((flag) => (
              <div
                className="rounded-[16px] border border-[var(--panel-border)] bg-[var(--surface-muted)] px-3 py-2.5"
                key={`${flag.rule}-${flag.description}`}
              >
                <p className="text-[12px] font-medium text-[var(--text-primary)]">
                  {flag.rule} · {flag.level}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
                  {flag.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <DetailPayloadView detail={detail} />
    </PanelCard>
  );
}

function DetailSkeleton({ title }: { title: string }) {
  return (
    <PanelCard
      description="Loading inspector payloads from the daemon REST surface."
      eyebrow="Inspector"
      title={title}
    >
      <div className="grid gap-3">
        <div className="h-28 animate-pulse rounded-[20px] border border-[var(--panel-border)] bg-[var(--surface-muted)]" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="h-20 animate-pulse rounded-[18px] border border-[var(--panel-border)] bg-[var(--surface-muted)]" />
          <div className="h-20 animate-pulse rounded-[18px] border border-[var(--panel-border)] bg-[var(--surface-muted)]" />
        </div>
        <div className="h-72 animate-pulse rounded-[20px] border border-[var(--panel-border)] bg-black/20" />
      </div>
    </PanelCard>
  );
}

function DetailErrorState({ title, message }: { title: string; message: string }) {
  return (
    <PanelCard
      description="Inspector detail fetch failed. Timeline data remains available."
      eyebrow="Inspector"
      title={title}
    >
      <div className="rounded-[20px] border border-rose-400/18 bg-rose-400/10 px-4 py-4">
        <p className="text-[12px] font-medium text-rose-100">Unable to load event detail</p>
        <p className="mt-2 text-[12px] leading-5 text-rose-100/80">{message}</p>
      </div>
    </PanelCard>
  );
}

function LinkedDetailPanel({ event }: { event: MCPEvent }) {
  const selectEvent = useEventStore((state) => state.actions.selection.selectEvent);
  const pairedBuffered = useEventStore((state) =>
    event.pairedId ? state.eventsById.has(event.pairedId) : false,
  );

  const detailQuery = useQuery({
    enabled: Boolean(event.sessionId && event.id),
    queryFn: ({ signal }) => fetchEventDetail(event.sessionId, event.id, signal),
    queryKey: queryKeys.eventDetail(event.sessionId, event.id),
  });

  if (detailQuery.isPending) {
    return <DetailSkeleton title="Event Detail" />;
  }

  if (detailQuery.isError) {
    return <DetailErrorState message={detailQuery.error.message} title="Event Detail" />;
  }

  return (
    <DetailState
      canJumpToPaired={pairedBuffered}
      description="Inspector fetches the full event record, including raw JSON-RPC bytes, while the timeline keeps using the lighter normalized store shape."
      detail={detailQuery.data}
      onJumpToPaired={() => {
        if (event.pairedId) {
          selectEvent(event.pairedId);
        }
      }}
      title="Event Detail"
    />
  );
}

function PairedDetailPanel({ event }: { event: MCPEvent }) {
  const detailQuery = useQuery({
    enabled: Boolean(event.pairedId),
    queryFn: ({ signal }) => fetchEventDetail(event.sessionId, event.pairedId as string, signal),
    queryKey: queryKeys.eventDetail(event.sessionId, event.pairedId ?? "missing"),
  });

  if (!event.pairedId) {
    return null;
  }

  if (detailQuery.isPending) {
    return <DetailSkeleton title="Linked Event" />;
  }

  if (detailQuery.isError) {
    return <DetailErrorState message={detailQuery.error.message} title="Linked Event" />;
  }

  return (
    <DetailState
      canJumpToPaired={false}
      description="A second inspector card lets you compare both sides of the request/response pair without losing the active selection in the timeline."
      detail={detailQuery.data}
      onJumpToPaired={() => {}}
      title="Linked Event"
    />
  );
}

function EmptyInspectorState() {
  return (
    <PanelCard
      description="Focused event details stay isolated here so timeline virtualization and row memoization remain cheap."
      eyebrow="Inspector"
      title="Event Detail"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <InspectorMetaItem
          icon={<Braces className="h-4 w-4" strokeWidth={1.8} />}
          label="Primary Detail"
          value="Select a timeline row"
        />
        <InspectorMetaItem
          icon={<SplitSquareVertical className="h-4 w-4" strokeWidth={1.8} />}
          label="Payload Views"
          value="Parsed structures and raw JSON-RPC"
        />
        <div className="min-h-0 flex-1 rounded-[20px] border border-dashed border-white/[0.08] bg-black/10 p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-quaternary)]">
            Waiting for selection
          </p>
          <p className="mt-3 max-w-sm text-[12px] leading-5 text-[var(--text-secondary)]">
            The inspector fetches full event detail on demand so the live timeline can stay dense,
            virtualized, and cheap while this panel handles heavier JSON rendering.
          </p>
        </div>
      </div>
    </PanelCard>
  );
}

export const EventInspectorDetails = memo(function EventInspectorDetails({
  event,
}: {
  event: MCPEvent | null;
}) {
  if (!event) {
    return <EmptyInspectorState />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
      <LinkedDetailPanel event={event} />
      <PairedDetailPanel event={event} />
    </div>
  );
});
