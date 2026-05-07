import { AlignJustify, Clock3, Rows3, Waypoints } from "lucide-react";

import { PanelCard } from "../../../components/layout/PanelCard";
import { PanelListItem } from "./PanelList";

const TIMELINE_SECTIONS = [
  {
    label: "Event stream viewport",
    value: "Reserved for virtualized rows",
    hint: "The center panel is intentionally the largest surface because live traffic density will dominate the UI.",
    icon: <Rows3 className="h-4 w-4" strokeWidth={1.8} />,
  },
  {
    label: "Header utilities",
    value: "Search, method filters, session scope",
    hint: "Toolbar space exists now so controls can be added later without changing the container contract.",
    icon: <AlignJustify className="h-4 w-4" strokeWidth={1.8} />,
  },
  {
    label: "Temporal context",
    value: "Chronological by default",
    hint: "Event grouping, correlation, and jump-to-response actions can layer in without replacing the shell.",
    icon: <Clock3 className="h-4 w-4" strokeWidth={1.8} />,
  },
];

export function TimelinePanel() {
  return (
    <PanelCard
      description="Primary analysis surface for MCP traffic. This stays neutral until live data and virtualization land."
      eyebrow="Timeline"
      title="Event Timeline"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <div className="rounded-[20px] border border-[var(--panel-border-strong)] bg-[var(--panel-bg-strong)] p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              <Waypoints className="h-3.5 w-3.5" strokeWidth={1.8} />
              Core viewport
            </div>
            <div className="mt-4 grid gap-2">
              {Array.from({ length: 7 }, (_, index) => (
                <div
                  className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3"
                  key={index}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-medium text-[var(--text-primary)]">
                        Placeholder event row
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                        Final implementation will mount virtualized timeline entries here.
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                      row {index + 1}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-3">
            {TIMELINE_SECTIONS.map((section) => (
              <PanelListItem key={section.label} {...section} />
            ))}
          </div>
        </div>
      </div>
    </PanelCard>
  );
}
