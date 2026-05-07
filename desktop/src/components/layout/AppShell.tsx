import { Group, Panel } from "react-resizable-panels";

import { InspectorPanel } from "../../features/workspace/components/InspectorPanel";
import { SidebarPanel } from "../../features/workspace/components/SidebarPanel";
import { TimelinePanel } from "../../features/workspace/components/TimelinePanel";
import { AppFrame } from "./AppFrame";
import { ResizeHandle } from "./ResizeHandle";

function MobileShell() {
  return (
    <div className="flex min-h-[calc(100vh-1.5rem)] flex-col gap-3 lg:hidden">
      <div className="h-[28vh] min-h-52">
        <SidebarPanel />
      </div>
      <div className="h-[34vh] min-h-64">
        <TimelinePanel />
      </div>
      <div className="min-h-72 flex-1">
        <InspectorPanel />
      </div>
    </div>
  );
}

function DesktopShell() {
  return (
    <div className="hidden min-h-[calc(100vh-2rem)] lg:block">
      <Group
        className="h-[calc(100vh-2rem)] rounded-[28px] border border-white/8 bg-white/[0.03] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm"
        id="spektr-app-shell"
        orientation="horizontal"
      >
        <Panel defaultSize={22} id="sidebar" maxSize={30} minSize={18}>
          <SidebarPanel />
        </Panel>
        <ResizeHandle />
        <Panel defaultSize={46} id="timeline" minSize={34}>
          <TimelinePanel />
        </Panel>
        <ResizeHandle />
        <Panel defaultSize={32} id="inspector" maxSize={40} minSize={24}>
          <InspectorPanel />
        </Panel>
      </Group>
    </div>
  );
}

export function AppShell() {
  return (
    <AppFrame>
      <DesktopShell />
      <MobileShell />
    </AppFrame>
  );
}
