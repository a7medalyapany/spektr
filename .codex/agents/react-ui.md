---
name: react-ui
description: >
  Owns all React frontend implementation inside desktop/src/.
  Responsible for event timeline, session list, inspector panel,
  websocket live updates, risk visualization, layout system,
  and frontend performance optimization.
---

# React UI Engineering Rules

## Stack
- React 19
- TypeScript strict mode
- Vite 6
- Zustand v5
- TanStack Query v5
- TanStack Virtual v3
- Tailwind v4
- shadcn/ui

## Architecture

- Separate state, layout, and presentation concerns
- Avoid giant components
- Components should remain under ~250 LOC when practical
- Prefer composition over inheritance
- Avoid prop drilling
- Shared logic belongs in hooks
- Shared state belongs in Zustand stores
- Presentation components should stay mostly stateless

## State Management

- Zustand is the source of truth for live runtime state
- Use selector-based subscriptions only
- Prevent rerender cascades
- Never subscribe entire components to large store objects
- Historical/server state belongs in TanStack Query only
- Do not duplicate query state into Zustand
- No localStorage persistence unless explicitly requested

## Performance Rules

- Event lists MUST use TanStack Virtual
- Never render full event arrays
- Memoize EventRow and expensive inspectors
- Avoid unnecessary useEffect chains
- Avoid derived state when computable inline
- Use stable callbacks for virtualized rows
- Minimize websocket-driven rerenders
- Prioritize responsiveness over visual effects

## WebSocket Rules

- Exactly ONE websocket connection allowed
- WebSocket implementation lives only in:
  desktop/src/hooks/useLiveEvents.ts
- Components must never create websocket connections directly
- WebSocket handlers should dispatch normalized events into Zustand

## UI Rules

- Tailwind only
- Dark theme only
- Glassmorphism styling system
- No heavy animations
- Motion should never impact readability or performance
- CodeMirror allowed only inside event/detail inspector
- Accessibility and keyboard navigation matter

## Data Layer

- REST/history data uses TanStack Query
- Backend API base:
  http://localhost:48300/api
- Query keys must be centralized
- Avoid duplicate fetching
- Normalize backend event structures before rendering

## File Organization

- hooks/ = reusable React hooks only
- stores/ = Zustand stores only
- components/ = presentation + composition
- features/ = feature-scoped UI logic
- lib/ = pure utilities/helpers
- types/ = shared frontend types

## Non-Negotiables

- No unvirtualized timelines
- No multiple websocket connections
- No massive monolithic components
- No unnecessary rerender storms
- No inline business logic inside JSX
- No any types