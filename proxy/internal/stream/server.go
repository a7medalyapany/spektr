package stream

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"github.com/spektr-dev/spektr/internal/storage"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 54 * time.Second
	maxMessageSize = 512
)

type envelope struct {
	Data  any    `json:"data"`
	Error string `json:"error,omitempty"`
}

type Server struct {
	store    *storage.Store
	hub      *Hub
	upgrader websocket.Upgrader
}

func NewServer(store *storage.Store, hub *Hub) *Server {
	return &Server{
		store: store,
		hub:   hub,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return isAllowedOrigin(r.Header.Get("Origin"))
			},
		},
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/sessions", s.handleListSessions)
	mux.HandleFunc("GET /api/sessions/{id}", s.handleGetSession)
	mux.HandleFunc("GET /api/sessions/{id}/events", s.handleListEvents)
	mux.HandleFunc("GET /api/sessions/{id}/events/{eid}", s.handleGetEvent)
	mux.HandleFunc("GET /api/events/live", s.handleWebSocket)
	mux.HandleFunc("POST /api/events/{id}/approve", s.handleApprove)
	mux.HandleFunc("POST /api/events/{id}/deny", s.handleDeny)
	mux.HandleFunc("DELETE /api/sessions/{id}", s.handleDeleteSession)
	return s.cors(mux)
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(envelope{Data: data}); err != nil {
		slog.Debug("failed to write JSON response", "err", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(envelope{Data: nil, Error: msg}); err != nil {
		slog.Debug("failed to write error response", "err", err)
	}
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	limit := parseInt(r.URL.Query().Get("limit"), 100)
	sessions, err := s.store.ListSessions(r.Context(), limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}
	writeJSON(w, http.StatusOK, sessions)
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	session, err := s.store.GetSession(r.Context(), r.PathValue("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get session")
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *Server) handleListEvents(w http.ResponseWriter, r *http.Request) {
	events, err := s.store.ListEvents(r.Context(), storage.ListEventsOpts{
		SessionID: r.PathValue("id"),
		Server:    r.URL.Query().Get("server"),
		RiskLevel: r.URL.Query().Get("risk"),
		Category:  r.URL.Query().Get("category"),
		Limit:     parseInt(r.URL.Query().Get("limit"), 100),
		Offset:    parseInt(r.URL.Query().Get("offset"), 0),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list events")
		return
	}
	writeJSON(w, http.StatusOK, events)
}

func (s *Server) handleGetEvent(w http.ResponseWriter, r *http.Request) {
	event, err := s.store.GetEvent(r.Context(), r.PathValue("eid"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get event")
		return
	}
	if event.SessionID != r.PathValue("id") {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	writeJSON(w, http.StatusOK, newEventDetailResponse(event))
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Debug("websocket upgrade failed", "err", err)
		return
	}

	client := &Client{
		hub:  s.hub,
		conn: conn,
		send: make(chan []byte, 256),
	}
	client.hub.register <- client

	go client.writePump()
	client.readPump()
}

func (s *Server) handleApprove(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusNotImplemented, "approve is not implemented in Phase 1")
}

func (s *Server) handleDeny(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusNotImplemented, "deny is not implemented in Phase 1")
}

func (s *Server) handleDeleteSession(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteSession(r.Context(), r.PathValue("id")); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": r.PathValue("id")})
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		if err := c.conn.Close(); err != nil {
			slog.Debug("failed to close websocket connection", "err", err)
		}
	}()

	c.conn.SetReadLimit(maxMessageSize)
	if err := c.conn.SetReadDeadline(time.Now().Add(pongWait)); err != nil {
		slog.Debug("failed to set websocket read deadline", "err", err)
	}
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			break
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		if err := c.conn.Close(); err != nil {
			slog.Debug("failed to close websocket connection", "err", err)
		}
	}()

	for {
		select {
		case message, ok := <-c.send:
			if err := c.conn.SetWriteDeadline(time.Now().Add(writeWait)); err != nil {
				slog.Debug("failed to set websocket write deadline", "err", err)
				return
			}
			if !ok {
				if err := c.conn.WriteMessage(websocket.CloseMessage, []byte{}); err != nil {
					slog.Debug("failed to write websocket close message", "err", err)
				}
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			if err := c.conn.SetWriteDeadline(time.Now().Add(writeWait)); err != nil {
				slog.Debug("failed to set websocket ping deadline", "err", err)
				return
			}
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func isAllowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	if origin == "http://localhost:1420" || origin == "tauri://localhost" {
		return true
	}

	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}

	host := parsed.Hostname()
	return host == "localhost" || host == "127.0.0.1"
}

func parseInt(v string, fallback int) int {
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil {
		return fallback
	}
	return n
}
