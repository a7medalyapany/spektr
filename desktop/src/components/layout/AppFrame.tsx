import type { PropsWithChildren } from "react";

export function AppFrame({ children }: PropsWithChildren) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(138,180,255,0.1),transparent_68%)]" />
        <div className="absolute inset-x-[12%] top-6 h-px bg-white/[0.06]" />
        <div className="absolute left-[12%] top-20 h-44 w-44 rounded-full bg-[rgba(90,138,224,0.08)] blur-3xl" />
        <div className="absolute bottom-16 right-[10%] h-52 w-52 rounded-full bg-[rgba(82,160,160,0.06)] blur-3xl" />
      </div>
      <div className="relative z-10 min-h-screen p-3 lg:p-4">{children}</div>
    </div>
  );
}
