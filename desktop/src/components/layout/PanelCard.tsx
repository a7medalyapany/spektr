import type { PropsWithChildren, ReactNode } from "react";

import { cn } from "../../lib/cn";

interface PanelCardProps extends PropsWithChildren {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function PanelCard({
  eyebrow,
  title,
  description,
  actions,
  className,
  contentClassName,
  children,
}: PanelCardProps) {
  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border border-[var(--panel-border)] bg-[var(--panel-bg)] shadow-[var(--panel-shadow)] [box-shadow:var(--panel-shadow),var(--panel-inner-highlight)] backdrop-blur-xl",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/[0.065] bg-black/[0.12] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-quaternary)]">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-[13px] font-semibold tracking-[0.01em] text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="mt-0.5 max-w-lg text-[11px] leading-4 text-[var(--text-tertiary)]">
            {description}
          </p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className={cn("flex min-h-0 flex-1 flex-col px-2.5 py-2.5", contentClassName)}>
        {children}
      </div>
    </section>
  );
}
