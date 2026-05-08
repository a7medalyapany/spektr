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
        "flex h-full min-h-0 flex-col rounded-[22px] border border-[var(--panel-border)] bg-[var(--panel-bg)] shadow-[var(--panel-shadow)] [box-shadow:var(--panel-shadow),var(--panel-inner-highlight)] backdrop-blur-2xl",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-quaternary)]">
            {eyebrow}
          </p>
          <h2 className="mt-1.5 text-[14px] font-semibold tracking-[0.01em] text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="mt-1 max-w-lg text-[12px] leading-5 text-[var(--text-secondary)]">
            {description}
          </p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className={cn("flex min-h-0 flex-1 flex-col px-3.5 py-3.5", contentClassName)}>
        {children}
      </div>
    </section>
  );
}
