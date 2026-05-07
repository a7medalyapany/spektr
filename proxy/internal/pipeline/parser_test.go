package pipeline

import (
	"testing"
	"time"

	"github.com/spektr-dev/spektr/pkg/types"
)

func TestParse(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		report    *types.ProxyReport
		wantErr   bool
		assertion func(t *testing.T, event *types.MCPEvent)
	}{
		{
			name: "valid tools call request extracts tool name and args",
			report: &types.ProxyReport{
				ServerName:  "filesystem",
				Direction:   types.DirectionRequest,
				Raw:         []byte(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"write_file","arguments":{"path":"a.txt","content":"hi"}}}`),
				TimestampMS: 1710000000000,
			},
			assertion: func(t *testing.T, event *types.MCPEvent) {
				t.Helper()
				if event.MessageType != types.MessageTypeRequest {
					t.Fatalf("MessageType = %q, want %q", event.MessageType, types.MessageTypeRequest)
				}
				if event.Category != types.CategoryToolCall {
					t.Fatalf("Category = %q, want %q", event.Category, types.CategoryToolCall)
				}
				if event.ToolName != "write_file" {
					t.Fatalf("ToolName = %q, want %q", event.ToolName, "write_file")
				}
				if string(event.ToolArgs) != `{"path":"a.txt","content":"hi"}` {
					t.Fatalf("ToolArgs = %s", event.ToolArgs)
				}
			},
		},
		{
			name: "valid tools list request classifies category",
			report: &types.ProxyReport{
				ServerName:  "filesystem",
				Direction:   types.DirectionRequest,
				Raw:         []byte(`{"jsonrpc":"2.0","id":"abc","method":"tools/list","params":{}}`),
				TimestampMS: 1710000000000,
			},
			assertion: func(t *testing.T, event *types.MCPEvent) {
				t.Helper()
				if event.Category != types.CategoryToolList {
					t.Fatalf("Category = %q, want %q", event.Category, types.CategoryToolList)
				}
			},
		},
		{
			name: "response with result is classified as response",
			report: &types.ProxyReport{
				ServerName:  "filesystem",
				Direction:   types.DirectionResponse,
				Raw:         []byte(`{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}`),
				TimestampMS: 1710000000000,
			},
			assertion: func(t *testing.T, event *types.MCPEvent) {
				t.Helper()
				if event.MessageType != types.MessageTypeResponse {
					t.Fatalf("MessageType = %q, want %q", event.MessageType, types.MessageTypeResponse)
				}
				if string(event.Result) != `{"tools":[]}` {
					t.Fatalf("Result = %s", event.Result)
				}
			},
		},
		{
			name: "notification without id is classified as notification",
			report: &types.ProxyReport{
				ServerName:  "filesystem",
				Direction:   types.DirectionNotification,
				Raw:         []byte(`{"jsonrpc":"2.0","method":"notifications/progress","params":{"value":1}}`),
				TimestampMS: 1710000000000,
			},
			assertion: func(t *testing.T, event *types.MCPEvent) {
				t.Helper()
				if event.MessageType != types.MessageTypeNotification {
					t.Fatalf("MessageType = %q, want %q", event.MessageType, types.MessageTypeNotification)
				}
			},
		},
		{
			name: "error response is classified as error",
			report: &types.ProxyReport{
				ServerName:  "filesystem",
				Direction:   types.DirectionResponse,
				Raw:         []byte(`{"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"boom","data":{"detail":"x"}}}`),
				TimestampMS: 1710000000000,
			},
			assertion: func(t *testing.T, event *types.MCPEvent) {
				t.Helper()
				if event.MessageType != types.MessageTypeError {
					t.Fatalf("MessageType = %q, want %q", event.MessageType, types.MessageTypeError)
				}
				if event.Error == nil {
					t.Fatal("Error = nil, want populated MCPError")
				}
				if event.Error.Code != -32603 {
					t.Fatalf("Error.Code = %d, want %d", event.Error.Code, -32603)
				}
			},
		},
		{
			name: "invalid json returns error",
			report: &types.ProxyReport{
				ServerName:  "filesystem",
				Direction:   types.DirectionRequest,
				Raw:         []byte(`{"jsonrpc":"2.0"`),
				TimestampMS: 1710000000000,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			event, err := Parse(tt.report)
			if tt.wantErr {
				if err == nil {
					t.Fatal("Parse() error = nil, want non-nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("Parse() error = %v", err)
			}
			if event == nil {
				t.Fatal("Parse() returned nil event")
			}

			if event.ServerName != tt.report.ServerName {
				t.Fatalf("ServerName = %q, want %q", event.ServerName, tt.report.ServerName)
			}
			if event.Transport != types.TransportStdio {
				t.Fatalf("Transport = %q, want %q", event.Transport, types.TransportStdio)
			}
			if event.Direction != tt.report.Direction {
				t.Fatalf("Direction = %q, want %q", event.Direction, tt.report.Direction)
			}
			wantTimestamp := time.UnixMilli(tt.report.TimestampMS)
			if !event.Timestamp.Equal(wantTimestamp) {
				t.Fatalf("Timestamp = %v, want %v", event.Timestamp, wantTimestamp)
			}
			if event.RiskLevel != types.RiskNone {
				t.Fatalf("RiskLevel = %q, want %q", event.RiskLevel, types.RiskNone)
			}
			if len(event.RiskFlags) != 0 {
				t.Fatalf("RiskFlags len = %d, want 0", len(event.RiskFlags))
			}
			if string(event.RawPayload) != string(tt.report.Raw) {
				t.Fatalf("RawPayload = %s, want %s", event.RawPayload, tt.report.Raw)
			}

			if tt.assertion != nil {
				tt.assertion(t, event)
			}
		})
	}
}
