import { GripVertical } from "lucide-react";
import { Separator } from "react-resizable-panels";

import { cn } from "../../lib/cn";

interface ResizeHandleProps {
  className?: string;
}

export function ResizeHandle({ className }: ResizeHandleProps) {
  return (
    <Separator
      className={cn(
        "group relative flex w-2.5 items-center justify-center outline-none",
        className,
      )}
    >
      <div className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 rounded-full bg-[var(--handle)] transition-colors group-hover:bg-[var(--handle-active)] group-data-[separator=active]:bg-[var(--accent)] group-data-[separator=focus]:bg-[var(--accent)]" />
      <div className="relative rounded-md border border-white/[0.06] bg-black/30 p-0.5 text-[var(--text-quaternary)] opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.2)] backdrop-blur-xl transition-all group-hover:opacity-100 group-hover:text-[var(--text-secondary)] group-data-[separator=active]:opacity-100 group-data-[separator=active]:text-[var(--accent)] group-data-[separator=focus]:opacity-100 group-data-[separator=focus]:text-[var(--accent)]">
        <GripVertical className="h-3 w-3" strokeWidth={1.6} />
      </div>
    </Separator>
  );
}
