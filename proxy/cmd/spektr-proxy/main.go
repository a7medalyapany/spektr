package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/spektr-dev/spektr/internal/interceptor"
	"github.com/spektr-dev/spektr/pkg/types"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)))

	server := flag.String("server", "", "MCP server name")
	socket := flag.String("socket", "/tmp/spektr.sock", "daemon Unix socket path")
	flag.Parse()

	args := flag.Args()
	if len(args) == 0 {
		slog.Error("no real server command after --")
		os.Exit(1)
	}

	client := interceptor.NewSocketClient(*socket)
	if err := client.Connect(); err != nil {
		slog.Warn("daemon not available, running in passthrough mode", "err", err)
	}

	cmd := exec.Command(args[0], args[1:]...)

	serverIn, err := cmd.StdinPipe()
	if err != nil {
		slog.Error("failed to open real server stdin", "err", fmt.Errorf("stdin pipe: %w", err))
		os.Exit(1)
	}

	serverOut, err := cmd.StdoutPipe()
	if err != nil {
		slog.Error("failed to open real server stdout", "err", fmt.Errorf("stdout pipe: %w", err))
		os.Exit(1)
	}

	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		slog.Error("failed to start real server", "err", fmt.Errorf("start %q: %w", args[0], err))
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		defer cancel()

		scanner := bufio.NewScanner(os.Stdin)
		for scanner.Scan() {
			line := scanner.Bytes()
			client.ReportAsync(&types.ProxyReport{
				ServerName:  *server,
				Direction:   types.DirectionRequest,
				Raw:         append([]byte(nil), line...),
				TimestampMS: time.Now().UnixMilli(),
			})
			_, _ = serverIn.Write(append(line, '\n'))
		}
	}()

	go func() {
		defer wg.Done()
		defer cancel()

		scanner := bufio.NewScanner(serverOut)
		for scanner.Scan() {
			line := scanner.Bytes()
			client.ReportAsync(&types.ProxyReport{
				ServerName:  *server,
				Direction:   types.DirectionResponse,
				Raw:         append([]byte(nil), line...),
				TimestampMS: time.Now().UnixMilli(),
			})
			_, _ = os.Stdout.Write(append(line, '\n'))
		}
	}()

	go func() {
		<-ctx.Done()
		if cmd.Process != nil {
			_ = cmd.Process.Signal(os.Interrupt)
		}
	}()

	wg.Wait()

	if err := cmd.Wait(); err != nil {
		slog.Debug("real server exited with error", "err", err)
	}

	if err := client.Close(); err != nil {
		slog.Debug("failed to close proxy socket client", "err", err)
	}
}
