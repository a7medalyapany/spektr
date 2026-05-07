import type { PropsWithChildren } from "react";

export function AppFrame({ children }: PropsWithChildren) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top,rgba(139,184,255,0.12),transparent_65%)]" />
        <div className="absolute left-[10%] top-24 h-56 w-56 rounded-full bg-[rgba(90,138,224,0.12)] blur-3xl" />
        <div className="absolute bottom-12 right-[8%] h-64 w-64 rounded-full bg-[rgba(82,160,160,0.1)] blur-3xl" />
      </div>
      <div className="relative z-10 min-h-screen p-3 lg:p-4">{children}</div>
    </div>
  );
}
