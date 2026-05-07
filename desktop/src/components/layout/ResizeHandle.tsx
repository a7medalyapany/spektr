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
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--handle)] transition-none group-hover:bg-[var(--handle-active)]" />
      <div className="relative rounded-full border border-white/10 bg-white/6 p-1 text-[var(--text-tertiary)] backdrop-blur-xl">
        <GripVertical className="h-3.5 w-3.5" strokeWidth={1.6} />
      </div>
    </Separator>
  );
}
