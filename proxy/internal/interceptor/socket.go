package interceptor

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"sync"
	"time"

	"github.com/spektr-dev/spektr/pkg/types"
)

type SocketClient struct {
	socketPath string
	conn       net.Conn
	mu         sync.Mutex
}

func NewSocketClient(socketPath string) *SocketClient {
	return &SocketClient{socketPath: socketPath}
}

func (c *SocketClient) Connect() error {
	var lastErr error
	for attempt := range 3 {
		conn, err := net.Dial("unix", c.socketPath)
		if err == nil {
			c.mu.Lock()
			c.conn = conn
			c.mu.Unlock()
			return nil
		}

		lastErr = err
		if attempt < 2 {
			time.Sleep(100 * time.Millisecond)
		}
	}

	return fmt.Errorf("connect to unix socket %q: %w", c.socketPath, lastErr)
}

func (c *SocketClient) ReportAsync(report *types.ProxyReport) {
	data, err := json.Marshal(report)
	if err != nil {
		slog.Debug("failed to marshal proxy report", "err", err)
		return
	}
	data = append(data, '\n')

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return
	}

	if err := c.conn.SetWriteDeadline(time.Now().Add(1 * time.Millisecond)); err != nil {
		slog.Debug("failed to set proxy socket write deadline", "err", err)
		return
	}
	if _, err := c.conn.Write(data); err != nil {
		slog.Debug("failed to write proxy report", "err", err)
		return
	}
}

func (c *SocketClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return nil
	}

	conn := c.conn
	c.conn = nil
	if err := conn.Close(); err != nil {
		return fmt.Errorf("close unix socket connection: %w", err)
	}

	return nil
}
