package main

import (
	"encoding/json"
	"log/slog"
	"os"
)

type DaemonConfig struct {
	WSPort     int    `json:"ws_port"`
	SocketPath string `json:"socket_path"`
	DBPath     string `json:"db_path"`
	LogLevel   string `json:"log_level"`
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)))

	var cfg DaemonConfig
	if err := json.NewDecoder(os.Stdin).Decode(&cfg); err != nil {
		slog.Error("failed to read config", "err", err)
		os.Exit(1)
	}

	slog.Info("spektr daemon starting", "ws_port", cfg.WSPort)
	// TODO Phase 1: start socket server, pipeline, WebSocket server
	select {}
}
