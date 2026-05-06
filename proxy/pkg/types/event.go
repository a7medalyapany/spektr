package types

import (
	"encoding/json"
	"time"
)

type Direction      string
type Transport      string
type MessageType    string
type MethodCategory string
type RiskLevel      string

const (
	DirectionRequest      Direction = "request"
	DirectionResponse     Direction = "response"
	DirectionNotification Direction = "notification"

	TransportStdio Transport = "stdio"
	TransportHTTP  Transport = "http"

	RiskNone     RiskLevel = "none"
	RiskLow      RiskLevel = "low"
	RiskMedium   RiskLevel = "medium"
	RiskHigh     RiskLevel = "high"
	RiskCritical RiskLevel = "critical"

	CategoryToolCall     MethodCategory = "tool_call"
	CategoryResourceRead MethodCategory = "resource_read"
	CategoryResourceList MethodCategory = "resource_list"
	CategoryToolList     MethodCategory = "tool_list"
	CategoryPromptGet    MethodCategory = "prompt_get"
	CategorySampling     MethodCategory = "sampling"
	CategoryLifecycle    MethodCategory = "lifecycle"
)

// MCPEvent is the canonical type for every intercepted MCP message.
type MCPEvent struct {
	ID        string    `json:"id"`
	SessionID string    `json:"session_id"`
	PairedID  string    `json:"paired_id"`

	ServerName string    `json:"server_name"`
	Transport  Transport `json:"transport"`

	Direction   Direction        `json:"direction"`
	Category    MethodCategory   `json:"category"`
	Method      string           `json:"method"`
	MessageID   *json.RawMessage `json:"message_id,omitempty"`
	Params      json.RawMessage  `json:"params,omitempty"`
	Result      json.RawMessage  `json:"result,omitempty"`
	Error       *MCPError        `json:"error,omitempty"`

	ToolName string          `json:"tool_name,omitempty"`
	ToolArgs json.RawMessage `json:"tool_args,omitempty"`

	Timestamp  time.Time `json:"timestamp"`
	DurationMs int64     `json:"duration_ms"`

	RiskLevel RiskLevel  `json:"risk_level"`
	RiskFlags []RiskFlag `json:"risk_flags"`
	Paused    bool       `json:"paused"`

	Cost *CostEstimate `json:"cost,omitempty"`
}

type MCPError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

type RiskFlag struct {
	Rule        string    `json:"rule"`
	Level       RiskLevel `json:"level"`
	Description string    `json:"description"`
}

type CostEstimate struct {
	InputTokens  int     `json:"input_tokens"`
	OutputTokens int     `json:"output_tokens"`
	TotalUSD     float64 `json:"total_usd"`
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
	ServerName  string    `json:"server_name"`
	Direction   Direction `json:"direction"`
	Raw         []byte    `json:"raw"`
	TimestampMS int64     `json:"ts"`
}

// DaemonConfig is the JSON the Tauri shell sends to the daemon via stdin on startup.
type DaemonConfig struct {
	WSPort     int    `json:"ws_port"`
	SocketPath string `json:"socket_path"`
	DBPath     string `json:"db_path"`
	LogLevel   string `json:"log_level"`
}
