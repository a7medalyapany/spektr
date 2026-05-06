package main

import (
	"flag"
	"log/slog"
	"os"
)

func main() {
	server := flag.String("server", "", "MCP server name")
	socket := flag.String("socket", "/tmp/spektr.sock", "daemon Unix socket path")
	flag.Parse()

	args := flag.Args()
	if len(args) == 0 {
		slog.Error("no real server command after --")
		os.Exit(1)
	}

	slog.Info("spektr-proxy", "server", *server, "socket", *socket, "cmd", args[0])
	// TODO Phase 1: spawn real server, intercept stdio, report to daemon
}
