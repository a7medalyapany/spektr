export const queryKeys = {
  sessions: {
    list: () => ["sessions", "list"] as const,
  },
  eventDetail: (sessionId: string, eventId: string) =>
    ["event-detail", sessionId, eventId] as const,
} as const;
