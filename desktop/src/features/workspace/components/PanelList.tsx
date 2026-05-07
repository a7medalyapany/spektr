import type { ReactNode } from "react";

import { cn } from "../../../lib/cn";

interface PanelListItemProps {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}

export function PanelListItem({
  label,
  value,
  hint,
  icon,
  className,
}: PanelListItemProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--panel-border)] bg-white/[0.03] px-3 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {icon ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-[var(--accent-soft)] text-[var(--accent)]">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
            {label}
          </p>
          <p className="mt-1 text-[13px] font-medium text-[var(--text-primary)]">
            {value}
          </p>
          {hint ? (
            <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
              {hint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
