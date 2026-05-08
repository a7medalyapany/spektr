import type { PropsWithChildren } from "react";

export function AppFrame({ children }: PropsWithChildren) {
  return (
    <div className="relative min-h-screen overflow-x-hidden overflow-y-auto bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-52 bg-[radial-gradient(circle_at_top,rgba(124,144,176,0.12),transparent_66%)]" />
        <div className="absolute inset-x-[10%] top-5 h-px bg-white/[0.045]" />
        <div className="absolute left-[8%] top-16 h-52 w-52 rounded-full bg-[rgba(91,116,150,0.08)] blur-3xl" />
        <div className="absolute bottom-12 right-[8%] h-64 w-64 rounded-full bg-[rgba(53,82,82,0.055)] blur-3xl" />
      </div>
      <div className="relative z-10 min-h-screen p-2 lg:p-3">{children}</div>
    </div>
  );
}
