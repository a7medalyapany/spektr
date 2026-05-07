import type { MCPEvent } from "../types/events";
import { parseLiveEventMessage } from "../types/events";

const DEFAULT_LIVE_EVENTS_URL = "ws://localhost:48300/api/events/live";
const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;
const RECONNECT_JITTER_RATIO = 0.2;

export interface LiveEventsClientConfig {
  url?: string;
}

export interface LiveEventsClientState {
  readonly status: "idle" | "connecting" | "connected" | "disconnected" | "error";
  readonly reconnectAttempt: number;
  readonly connected: boolean;
  readonly lastError: string | null;
  readonly url: string;
}

export interface LiveEventsClientListener {
  onEvent?: (event: MCPEvent) => void;
  onStateChange?: (state: LiveEventsClientState) => void;
}

export interface LiveEventsClient {
  retain(config?: LiveEventsClientConfig): void;
  release(): void;
  subscribe(listener: LiveEventsClientListener): () => void;
  getState(): LiveEventsClientState;
}

class SharedLiveEventsClient implements LiveEventsClient {
  private socket: WebSocket | null = null;
  private reconnectTimerId: number | null = null;
  private releaseTimerId: number | null = null;
  private listeners = new Set<LiveEventsClientListener>();
  private retainCount = 0;
  private closeIntent: "none" | "reset" | "release" = "none";
  private url = DEFAULT_LIVE_EVENTS_URL;
  private reconnectAttempt = 0;
  private state: LiveEventsClientState = {
    status: "idle",
    reconnectAttempt: 0,
    connected: false,
    lastError: null,
    url: DEFAULT_LIVE_EVENTS_URL,
  };

  retain(config?: LiveEventsClientConfig): void {
    this.clearReleaseTimer();
    this.retainCount += 1;

    const nextUrl = config?.url ?? DEFAULT_LIVE_EVENTS_URL;
    const urlChanged = nextUrl !== this.url;
    this.url = nextUrl;

    if (urlChanged) {
      this.state = {
        ...this.state,
        url: this.url,
      };
      this.emitState();
      this.resetConnection("live event endpoint changed");
    }

    if (!this.socket && this.reconnectTimerId === null) {
      this.connect();
    }
  }

  release(): void {
    this.retainCount = Math.max(0, this.retainCount - 1);
    if (this.retainCount > 0) {
      return;
    }

    this.releaseTimerId = window.setTimeout(() => {
      if (this.retainCount === 0) {
        this.shutdown();
      }
    }, 0);
  }

  subscribe(listener: LiveEventsClientListener): () => void {
    this.listeners.add(listener);
    listener.onStateChange?.(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): LiveEventsClientState {
    return this.state;
  }

  private connect(): void {
    if (this.retainCount === 0 || this.socket) {
      return;
    }

    this.clearReconnectTimer();
    this.closeIntent = "none";
    this.updateState({
      status: "connecting",
      reconnectAttempt: this.reconnectAttempt,
      connected: false,
      lastError: null,
    });

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }

      this.reconnectAttempt = 0;
      this.updateState({
        status: "connected",
        reconnectAttempt: 0,
        connected: true,
        lastError: null,
      });
    });

    socket.addEventListener("message", (message) => {
      if (this.socket !== socket) {
        return;
      }

      try {
        if (typeof message.data !== "string") {
          throw new Error("live event websocket message was not text");
        }

        const event = parseLiveEventMessage(message.data);
        for (const listener of this.listeners) {
          listener.onEvent?.(event);
        }
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : "failed to parse live event websocket message";
        this.updateState({
          status: "error",
          reconnectAttempt: this.reconnectAttempt,
          connected: false,
          lastError: messageText,
        });
      }
    });

    socket.addEventListener("error", () => {
      if (this.socket !== socket) {
        return;
      }

      this.updateState({
        status: "error",
        reconnectAttempt: this.reconnectAttempt,
        connected: false,
        lastError: "live event websocket error",
      });
    });

    socket.addEventListener("close", (event) => {
      if (this.socket === socket) {
        this.socket = null;
      }

      const reason = this.describeCloseEvent(event);
      const closeIntent = this.closeIntent;
      this.closeIntent = "none";

      if (closeIntent !== "release") {
        this.updateState({
          status: "disconnected",
          reconnectAttempt: this.reconnectAttempt,
          connected: false,
          lastError: reason,
        });
      }

      if (this.retainCount > 0) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimerId !== null || this.retainCount === 0) {
      return;
    }

    const nextAttempt = this.reconnectAttempt + 1;
    this.reconnectAttempt = nextAttempt;
    const delay = computeReconnectDelay(nextAttempt);

    this.updateState({
      status: "connecting",
      reconnectAttempt: nextAttempt,
      connected: false,
      lastError: this.state.lastError,
    });

    this.reconnectTimerId = window.setTimeout(() => {
      this.reconnectTimerId = null;
      this.connect();
    }, delay);
  }

  private resetConnection(reason: string): void {
    this.clearReconnectTimer();
    if (!this.socket) {
      this.updateState({
        status: "disconnected",
        reconnectAttempt: this.reconnectAttempt,
        connected: false,
        lastError: reason,
      });
      if (this.retainCount > 0) {
        this.connect();
      }
      return;
    }

    this.closeIntent = "reset";
    const socket = this.socket;
    this.socket = null;
    socket.close(1000, reason);
  }

  private shutdown(): void {
    this.clearReleaseTimer();
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;

    if (this.socket) {
      this.closeIntent = "release";
      const socket = this.socket;
      this.socket = null;
      socket.close(1000, "live events disabled");
    }

    this.updateState({
      status: "idle",
      reconnectAttempt: 0,
      connected: false,
      lastError: null,
    });
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimerId !== null) {
      window.clearTimeout(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }
  }

  private clearReleaseTimer(): void {
    if (this.releaseTimerId !== null) {
      window.clearTimeout(this.releaseTimerId);
      this.releaseTimerId = null;
    }
  }

  private updateState(
    patch: Omit<LiveEventsClientState, "url"> | Partial<LiveEventsClientState>,
  ): void {
    this.state = {
      ...this.state,
      ...patch,
      url: this.url,
    };
    this.emitState();
  }

  private emitState(): void {
    for (const listener of this.listeners) {
      listener.onStateChange?.(this.state);
    }
  }

  private describeCloseEvent(event: CloseEvent): string {
    if (event.reason.trim().length > 0) {
      return event.reason;
    }

    if (event.wasClean) {
      return `live event websocket closed (${event.code})`;
    }

    return `live event websocket closed unexpectedly (${event.code})`;
  }
}

function computeReconnectDelay(attempt: number): number {
  const exponentialDelay = Math.min(
    MAX_RECONNECT_DELAY_MS,
    BASE_RECONNECT_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  );
  const jitter = exponentialDelay * RECONNECT_JITTER_RATIO * Math.random();
  return Math.round(exponentialDelay + jitter);
}

export const liveEventsClient: LiveEventsClient = new SharedLiveEventsClient();
