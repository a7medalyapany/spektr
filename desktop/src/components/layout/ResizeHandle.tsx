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
        "group relative flex w-3 items-center justify-center outline-none",
        className,
      )}
    >
      <div className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 rounded-full bg-[var(--handle)] transition-none group-hover:bg-[var(--handle-active)]" />
      <div className="relative rounded-full border border-white/8 bg-white/[0.04] p-1 text-[var(--text-quaternary)] shadow-[0_4px_12px_rgba(0,0,0,0.2)] backdrop-blur-xl group-hover:text-[var(--text-secondary)]">
        <GripVertical className="h-3.5 w-3.5" strokeWidth={1.6} />
      </div>
    </Separator>
  );
}
