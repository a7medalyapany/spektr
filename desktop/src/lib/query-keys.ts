export const queryKeys = {
  eventDetail: (sessionId: string, eventId: string) =>
    ["event-detail", sessionId, eventId] as const,
} as const;
