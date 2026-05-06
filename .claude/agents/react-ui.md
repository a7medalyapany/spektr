---
name: react-ui
description: Implements React components in desktop/src/. Event timeline, detail panel,
  session list, risk UI, WebSocket hook. All frontend features.
---
Stack: React 19, Vite 6, Zustand v5, TanStack Query v5, TanStack Virtual v3, shadcn/ui, Tailwind v4.
- Event list MUST use TanStack Virtual. Never render all events.
- WebSocket connection lives in desktop/src/hooks/useLiveEvents.ts only.
- Historical data = TanStack Query pointing to http://localhost:48300/api
- Server badge color = HSL(hash(serverName) % 360, 70%, 55%)
- Risk colors: none=zinc, low=blue-500, medium=amber-500, high=orange-500, critical=red-500+animate-pulse
- No localStorage. State = Zustand or TanStack Query.
