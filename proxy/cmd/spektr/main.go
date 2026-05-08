package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"

	"github.com/spektr-dev/spektr/internal/config"
	"github.com/spektr-dev/spektr/internal/pipeline"
	"github.com/spektr-dev/spektr/internal/storage"
	"github.com/spektr-dev/spektr/internal/stream"
	"github.com/spektr-dev/spektr/pkg/types"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)))

	baseCtx := context.Background()
	ctx, stop := signal.NotifyContext(baseCtx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	var cfg types.DaemonConfig
	if err := json.NewDecoder(os.Stdin).Decode(&cfg); err != nil {
		slog.Error("failed to read config", "err", err)
		os.Exit(1)
	}

	store, err := storage.Open(cfg.DBPath)
	if err != nil {
		slog.Error("failed to open sqlite store", "err", err)
		os.Exit(1)
	}
	defer func() {
		if err := store.Close(); err != nil {
			slog.Error("failed to close store", "err", err)
		}
	}()

	sessionUUID, err := uuid.NewV7()
	if err != nil {
		slog.Error("failed to generate session id", "err", err)
		os.Exit(1)
	}
	sessionID := sessionUUID.String()
	backupDir := backupDirForSession(sessionID)

	if err := store.InsertSession(baseCtx, &types.Session{
		ID:        sessionID,
		AgentType: "unknown",
		StartedAt: time.Now().UTC(),
	}); err != nil {
		slog.Error("failed to insert session", "err", err)
		os.Exit(1)
	}

	if cfg.ProxyBinPath == "" {
		slog.Warn("proxy binary path not configured; skipping agent config patching")
	} else if backupDir == "" {
		slog.Warn("home directory not available; skipping agent config patching")
	} else if err := os.MkdirAll(backupDir, 0700); err != nil {
		slog.Warn("failed to create backup dir", "err", err)
	} else {
		agents := config.DetectAgents()
		for _, agent := range agents {
			result, err := config.PatchAgent(agent, cfg.ProxyBinPath, cfg.SocketPath, backupDir)
			if err != nil {
				slog.Warn("failed to patch agent config", "agent", agent, "err", err)
				continue
			}
			slog.Info("patched agent config", "agent", agent, "servers", result.Patched)
		}
	}

	enricher := pipeline.NewEnricher(sessionID)
	hub := stream.NewHub()
	go hub.Run()

	writeCtx, writeCancel := context.WithCancel(baseCtx)
	writeCh := make(chan *types.MCPEvent, 10000)
	var writerWG sync.WaitGroup
	writerWG.Add(1)
	go func() {
		defer writerWG.Done()
		runWriter(writeCtx, store, writeCh)
	}()

	if cfg.SocketPath != "" {
		if err := os.Remove(cfg.SocketPath); err != nil && !os.IsNotExist(err) {
			slog.Error("failed to remove stale socket", "err", err, "socket_path", cfg.SocketPath)
			os.Exit(1)
		}
	}

	socketListener, err := net.Listen("unix", cfg.SocketPath)
	if err != nil {
		slog.Error("failed to listen on unix socket", "err", err, "socket_path", cfg.SocketPath)
		os.Exit(1)
	}
	defer func() {
		if err := socketListener.Close(); err != nil {
			slog.Error("failed to close unix socket listener", "err", err)
		}
		if err := os.Remove(cfg.SocketPath); err != nil && !os.IsNotExist(err) {
			slog.Error("failed to remove unix socket", "err", err, "socket_path", cfg.SocketPath)
		}
	}()

	go acceptProxyReports(ctx, socketListener, enricher, hub, writeCh)

	server := stream.NewServer(store, hub)
	httpServer := &http.Server{
		Addr:    fmt.Sprintf("127.0.0.1:%d", cfg.WSPort),
		Handler: server.Routes(),
	}
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("http server failed", "err", err)
		}
	}()

	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{
		"event":   "ready",
		"ws_port": cfg.WSPort,
	}); err != nil {
		slog.Error("failed to write ready signal", "err", err)
		os.Exit(1)
	}

	<-ctx.Done()

	if backupDir != "" {
		for _, agent := range config.DetectAgents() {
			backupPath := backupPathForAgent(backupDir, agent)
			if _, err := os.Stat(backupPath); os.IsNotExist(err) {
				continue
			} else if err != nil {
				slog.Error("failed to stat agent config backup", "agent", agent, "err", err)
				continue
			}
			if err := config.RestoreAgent(agent, backupPath); err != nil {
				slog.Error("failed to restore agent config", "agent", agent, "err", err)
			}
		}
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(baseCtx, 5*time.Second)
	defer shutdownCancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		slog.Error("failed to shut down http server", "err", err)
	}
	if err := socketListener.Close(); err != nil {
		slog.Debug("failed to close unix socket listener", "err", err)
	}
	if err := store.CloseSession(baseCtx, sessionID); err != nil {
		slog.Error("failed to close session", "err", err, "session_id", sessionID)
	}

	writeCancel()
	writerWG.Wait()
}

func backupDirForSession(sessionID string) string {
	home := os.Getenv("HOME")
	if home == "" {
		var err error
		home, err = os.UserHomeDir()
		if err != nil {
			return ""
		}
	}
	return filepath.Join(home, ".spektr", "backups", sessionID)
}

func backupPathForAgent(backupDir string, agent config.AgentType) string {
	backupName := string(agent) + ".json.bak"
	if agent == config.AgentCodex {
		backupName = "codex.toml.bak"
	}
	return filepath.Join(backupDir, backupName)
}

func acceptProxyReports(
	ctx context.Context,
	listener net.Listener,
	enricher *pipeline.Enricher,
	hub *stream.Hub,
	writeCh chan<- *types.MCPEvent,
) {
	for {
		conn, err := listener.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				return
			default:
			}
			slog.Debug("failed to accept proxy connection", "err", err)
			continue
		}

		go handleProxyConnection(ctx, conn, enricher, hub, writeCh)
	}
}

func handleProxyConnection(
	ctx context.Context,
	conn net.Conn,
	enricher *pipeline.Enricher,
	hub *stream.Hub,
	writeCh chan<- *types.MCPEvent,
) {
	defer func() {
		if err := conn.Close(); err != nil {
			slog.Debug("failed to close proxy connection", "err", err)
		}
	}()

	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return
		default:
		}

		line := append([]byte(nil), scanner.Bytes()...)

		var report types.ProxyReport
		if err := json.Unmarshal(line, &report); err != nil {
			slog.Debug("failed to decode proxy report", "err", err)
			continue
		}

		event, err := pipeline.Parse(&report)
		if err != nil {
			slog.Debug("failed to parse proxy report", "err", err, "server_name", report.ServerName)
			continue
		}
		event = enricher.Enrich(event)

		select {
		case writeCh <- event:
		default:
			slog.Debug("dropping event because write channel is full", "event_id", event.ID)
		}

		payload, err := json.Marshal(event)
		if err != nil {
			slog.Debug("failed to marshal event for broadcast", "err", err, "event_id", event.ID)
			continue
		}
		hub.Broadcast(payload)
	}

	if err := scanner.Err(); err != nil {
		slog.Debug("proxy connection scanner failed", "err", err)
	}
}

func runWriter(ctx context.Context, store *storage.Store, writeCh <-chan *types.MCPEvent) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	batch := make([]*types.MCPEvent, 0, 200)
	flush := func(flushCtx context.Context) {
		if len(batch) == 0 {
			return
		}
		if err := store.BatchInsert(flushCtx, batch); err != nil {
			slog.Error("failed to batch insert events", "err", err, "count", len(batch))
		}
		batch = batch[:0]
	}

	for {
		select {
		case event := <-writeCh:
			if event == nil {
				continue
			}
			batch = append(batch, event)
			if len(batch) >= 200 {
				flush(ctx)
			}
		case <-ticker.C:
			flush(ctx)
		case <-ctx.Done():
			for {
				select {
				case event := <-writeCh:
					if event != nil {
						batch = append(batch, event)
					}
				default:
					drainCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
					flush(drainCtx)
					cancel()
					return
				}
			}
		}
	}
}
