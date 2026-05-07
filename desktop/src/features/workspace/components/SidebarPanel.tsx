import { AppWindowMac, FolderTree, MonitorSmartphone, Shield } from "lucide-react";

import { PanelCard } from "../../../components/layout/PanelCard";
import { PanelListItem } from "./PanelList";

export function SidebarPanel() {
  return (
    <PanelCard
      description="Persistent navigation for sessions, agent targets, and workspace-wide controls."
      eyebrow="Workspace"
      title="Sidebar"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <PanelListItem
          hint="Entry point for session switching and global filters once stores and routing are added."
          icon={<AppWindowMac className="h-4 w-4" strokeWidth={1.8} />}
          label="Primary Role"
          value="Global navigation rail"
        />
        <PanelListItem
          hint="This panel stays compact to preserve horizontal space for the timeline."
          icon={<FolderTree className="h-4 w-4" strokeWidth={1.8} />}
          label="Structure"
          value="Pinned sections, recent sessions, server groups"
        />
        <PanelListItem
          hint="Future agent state can surface here without leaking into timeline rendering."
          icon={<Shield className="h-4 w-4" strokeWidth={1.8} />}
          label="Reserved For"
          value="Risk filters, transport status, project scope"
        />
        <div className="mt-auto rounded-2xl border border-dashed border-white/10 bg-black/10 px-3 py-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
            <MonitorSmartphone className="h-3.5 w-3.5" strokeWidth={1.8} />
            Responsive note
          </div>
          <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
            On narrower widths this panel moves to the top of the stack, but on desktop
            it remains independently resizable.
          </p>
        </div>
      </div>
    </PanelCard>
  );
}
