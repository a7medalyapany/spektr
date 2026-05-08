package stream

import (
	"encoding/json"

	"github.com/spektr-dev/spektr/pkg/types"
)

type eventDetailResponse struct {
	ID          string               `json:"id"`
	SessionID   string               `json:"session_id"`
	PairedID    string               `json:"paired_id,omitempty"`
	ServerName  string               `json:"server_name"`
	ServerPID   int                  `json:"server_pid"`
	Transport   types.Transport      `json:"transport"`
	Direction   types.Direction      `json:"direction"`
	MessageType types.MessageType    `json:"message_type"`
	Category    types.MethodCategory `json:"category"`
	Method      string               `json:"method"`
	MessageID   json.RawMessage      `json:"message_id,omitempty"`
	Params      json.RawMessage      `json:"params,omitempty"`
	Result      json.RawMessage      `json:"result,omitempty"`
	Error       *types.MCPError      `json:"error,omitempty"`
	ToolName    string               `json:"tool_name,omitempty"`
	ToolArgs    json.RawMessage      `json:"tool_args,omitempty"`
	Timestamp   string               `json:"timestamp"`
	DurationMs  int64                `json:"duration_ms"`
	RiskLevel   types.RiskLevel      `json:"risk_level"`
	RiskFlags   []types.RiskFlag     `json:"risk_flags"`
	Paused      bool                 `json:"paused"`
	Cost        *types.CostEstimate  `json:"cost,omitempty"`
	RawPayload  string               `json:"raw_payload,omitempty"`
}

func newEventDetailResponse(event *types.MCPEvent) eventDetailResponse {
	response := eventDetailResponse{
		ID:          event.ID,
		SessionID:   event.SessionID,
		PairedID:    event.PairedID,
		ServerName:  event.ServerName,
		ServerPID:   event.ServerPID,
		Transport:   event.Transport,
		Direction:   event.Direction,
		MessageType: event.MessageType,
		Category:    event.Category,
		Method:      event.Method,
		Timestamp:   event.Timestamp.UTC().Format("2006-01-02T15:04:05.000Z07:00"),
		DurationMs:  event.DurationMs,
		RiskLevel:   event.RiskLevel,
		RiskFlags:   event.RiskFlags,
		Paused:      event.Paused,
		Cost:        event.Cost,
		RawPayload:  string(event.RawPayload),
	}

	if event.MessageID != nil {
		response.MessageID = append(json.RawMessage(nil), (*event.MessageID)...)
	}
	if len(event.Params) > 0 {
		response.Params = append(json.RawMessage(nil), event.Params...)
	}
	if len(event.Result) > 0 {
		response.Result = append(json.RawMessage(nil), event.Result...)
	}
	if event.Error != nil {
		response.Error = event.Error
	}
	if event.ToolName != "" {
		response.ToolName = event.ToolName
	}
	if len(event.ToolArgs) > 0 {
		response.ToolArgs = append(json.RawMessage(nil), event.ToolArgs...)
	}

	return response
}
