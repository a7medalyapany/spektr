package types

import (
	"encoding/json"
	"time"
)

type MCPEvent struct {
	// Identity
	ID        string `json:"id"` // UUID v7 (time-ordered)
	SessionID string `json:"session_id"`
	PairedID  string `json:"paired_id"` // matching request/response UUID

	// Source
	ServerName string    `json:"server_name"` // "filesystem", "github", "bash"...
	ServerPID  int       `json:"server_pid"`  // PID of the real MCP server
	Transport  Transport `json:"transport"`   // stdio | http

	// MCP Message
	Direction   Direction        `json:"direction"`    // request | response | notification
	MessageType MessageType      `json:"message_type"` // request | response | notification | error
	Category    MethodCategory   `json:"category"`     // tool_call | resource_read | lifecycle...
	Method      string           `json:"method"`       // raw JSON-RPC method string
	MessageID   *json.RawMessage `json:"message_id"`   // JSON-RPC id (null for notifications)
	Params      json.RawMessage  `json:"params"`       // request params
	Result      json.RawMessage  `json:"result"`       // response result
	Error       *MCPError        `json:"error"`        // error if type=error

	// Tool call specific (populated for tools/call events only)
	ToolName string          `json:"tool_name,omitempty"`
	ToolArgs json.RawMessage `json:"tool_args,omitempty"`

	// Timing
	Timestamp  time.Time `json:"timestamp"`
	DurationMs int64     `json:"duration_ms"` // only for responses

	// Risk
	RiskLevel RiskLevel  `json:"risk_level"` // none | low | medium | high | critical
	RiskFlags []RiskFlag `json:"risk_flags"`
	Paused    bool       `json:"paused"` // true = blocked pending user approval

	// Cost
	Cost *CostEstimate `json:"cost,omitempty"`

	// Raw
	RawPayload []byte `json:"-"` // original JSON-RPC bytes (not sent to UI, stored in DB)
}

type MCPError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

type CostEstimate struct {
	InputTokens  int     `json:"input_tokens"`
	OutputTokens int     `json:"output_tokens"`
	TotalUSD     float64 `json:"total_usd"`
}

type RiskFlag struct {
	Rule        string    `json:"rule"`
	Level       RiskLevel `json:"level"`
	Description string    `json:"description"`
}

type Session struct {
	ID           string     `json:"id"`
	AgentType    string     `json:"agent_type"`
	StartedAt    time.Time  `json:"started_at"`
	EndedAt      *time.Time `json:"ended_at,omitempty"`
	TotalEvents  int        `json:"total_events"`
	TotalCostUSD float64    `json:"total_cost_usd"`
}

// ProxyReport is what spektr-proxy sends to the daemon via Unix socket.
type ProxyReport struct {
	// ServerName is the MCP server that produced the report.
	ServerName string `json:"server_name"`
	// Direction is the message direction for the report.
	Direction Direction `json:"direction"`
	// Raw is the raw JSON-RPC line forwarded by spektr-proxy.
	Raw []byte `json:"raw"`
	// TimestampMS is the event timestamp in Unix milliseconds.
	TimestampMS int64 `json:"timestamp_ms"`
}

// DaemonConfig is the JSON the Tauri shell sends to the daemon via stdin on startup.
type DaemonConfig struct {
	// ProxyBinPath is the absolute path to the spektr-proxy binary.
	ProxyBinPath string `json:"proxy_bin_path"`
	// ProxyPort is the local port spektr-proxy binds for forwarding.
	ProxyPort int `json:"proxy_port"`
	// WSPort is the WebSocket port used by the daemon.
	WSPort int `json:"ws_port"`
	// SocketPath is the Unix socket path used for proxy reports.
	SocketPath string `json:"socket_path"`
	// DBPath is the SQLite database path used by the daemon.
	DBPath string `json:"db_path"`
	// LogLevel is the daemon log verbosity.
	LogLevel string `json:"log_level"`
}

// Enums
type Direction string
type Transport string
type MessageType string
type MethodCategory string
type RiskLevel string

const (
	DirectionRequest      Direction = "request"
	DirectionResponse     Direction = "response"
	DirectionNotification Direction = "notification"

	TransportStdio Transport = "stdio"
	TransportHTTP  Transport = "http"

	MessageTypeRequest      MessageType = "request"
	MessageTypeResponse     MessageType = "response"
	MessageTypeNotification MessageType = "notification"
	MessageTypeError        MessageType = "error"

	CategoryToolCall     MethodCategory = "tool_call"
	CategoryResourceRead MethodCategory = "resource_read"
	CategoryResourceList MethodCategory = "resource_list"
	CategoryToolList     MethodCategory = "tool_list"
	CategoryPromptGet    MethodCategory = "prompt_get"
	CategorySampling     MethodCategory = "sampling"
	CategoryLifecycle    MethodCategory = "lifecycle"

	RiskNone     RiskLevel = "none"
	RiskLow      RiskLevel = "low"
	RiskMedium   RiskLevel = "medium"
	RiskHigh     RiskLevel = "high"
	RiskCritical RiskLevel = "critical"
)
