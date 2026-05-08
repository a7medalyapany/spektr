package stream

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/spektr-dev/spektr/pkg/types"
)

func TestNewEventDetailResponseIncludesRawPayload(t *testing.T) {
	messageID := json.RawMessage(`7`)
	event := &types.MCPEvent{
		ID:          "event-1",
		SessionID:   "session-1",
		PairedID:    "event-2",
		ServerName:  "filesystem",
		ServerPID:   77,
		Transport:   types.TransportStdio,
		Direction:   types.DirectionRequest,
		MessageType: types.MessageTypeRequest,
		Category:    types.CategoryToolCall,
		Method:      "tools/call",
		MessageID:   &messageID,
		Params:      json.RawMessage(`{"name":"read_file"}`),
		ToolName:    "read_file",
		ToolArgs:    json.RawMessage(`{"path":"/tmp/demo.txt"}`),
		Timestamp:   time.UnixMilli(1_746_400_000_000).UTC(),
		DurationMs:  12,
		RiskLevel:   types.RiskLow,
		RiskFlags: []types.RiskFlag{
			{Rule: "path_access", Level: types.RiskLow, Description: "reads a file"},
		},
		Paused:     true,
		Cost:       &types.CostEstimate{InputTokens: 1, OutputTokens: 2, TotalUSD: 0.03},
		RawPayload: []byte(`{"jsonrpc":"2.0","id":7,"method":"tools/call"}`),
	}

	got := newEventDetailResponse(event)

	if got.RawPayload != string(event.RawPayload) {
		t.Fatalf("RawPayload = %q, want %q", got.RawPayload, event.RawPayload)
	}
	if got.ToolName != event.ToolName {
		t.Fatalf("ToolName = %q, want %q", got.ToolName, event.ToolName)
	}
	if got.Timestamp != "2025-05-04T23:06:40.000Z" {
		t.Fatalf("Timestamp = %q", got.Timestamp)
	}
}
