import { Braces, PanelRightOpen, ScanSearch, SplitSquareVertical } from "lucide-react";

import { PanelCard } from "../../../components/layout/PanelCard";
import { PanelListItem } from "./PanelList";

export function InspectorPanel() {
  return (
    <PanelCard
      description="Secondary detail surface for payloads, metadata, diffs, and focused inspection tools."
      eyebrow="Inspector"
      title="Event Detail"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <PanelListItem
          hint="Selected timeline rows can project request and response payloads into dedicated subviews."
          icon={<Braces className="h-4 w-4" strokeWidth={1.8} />}
          label="Primary Detail"
          value="Structured payload inspection"
        />
        <PanelListItem
          hint="The inspector is isolated so expensive viewers like CodeMirror stay local to this panel."
          icon={<PanelRightOpen className="h-4 w-4" strokeWidth={1.8} />}
          label="Boundary"
          value="Heavy detail renderers stay contained"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <PanelListItem
            hint="Reserved for schema-aware metadata blocks."
            icon={<ScanSearch className="h-4 w-4" strokeWidth={1.8} />}
            label="Metadata"
            value="Risk, timing, server, tool facets"
          />
          <PanelListItem
            hint="Alternative tabs can be introduced without affecting the timeline container."
            icon={<SplitSquareVertical className="h-4 w-4" strokeWidth={1.8} />}
            label="Expansion"
            value="Raw JSON, parsed view, future diffs"
          />
        </div>
        <div className="min-h-0 flex-1 rounded-[20px] border border-dashed border-white/10 bg-black/10 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
            Placeholder viewport
          </p>
          <p className="mt-3 max-w-sm text-[12px] leading-5 text-[var(--text-secondary)]">
            This area intentionally avoids fake payloads. It exists only to lock the
            inspector’s dimensions and scrolling behavior before real event selection is
            implemented.
          </p>
        </div>
      </div>
    </PanelCard>
  );
}
