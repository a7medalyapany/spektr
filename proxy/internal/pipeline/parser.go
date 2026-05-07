package pipeline

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/spektr-dev/spektr/pkg/types"
)

type baseMessage struct {
	JSONRPC string           `json:"jsonrpc"`
	ID      *json.RawMessage `json:"id"`
	Method  string           `json:"method"`
	Params  json.RawMessage  `json:"params"`
	Result  json.RawMessage  `json:"result"`
	Error   json.RawMessage  `json:"error"`
}

type toolCallParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

func Parse(report *types.ProxyReport) (*types.MCPEvent, error) {
	if report == nil {
		return nil, fmt.Errorf("parse proxy report: nil report")
	}

	var base baseMessage
	if err := json.Unmarshal(report.Raw, &base); err != nil {
		return nil, fmt.Errorf("unmarshal proxy report raw payload: %w", err)
	}

	event := &types.MCPEvent{
		ServerName: report.ServerName,
		Transport:  types.TransportStdio,
		Direction:  report.Direction,
		Timestamp:  time.UnixMilli(report.TimestampMS),
		Method:     base.Method,
		MessageID:  base.ID,
		Params:     base.Params,
		Result:     base.Result,
		Category:   classifyMethod(base.Method),
		RiskLevel:  types.RiskNone,
		RiskFlags:  []types.RiskFlag{},
		RawPayload: append([]byte(nil), report.Raw...),
	}

	switch {
	case base.Method != "" && base.ID != nil:
		event.MessageType = types.MessageTypeRequest
	case base.Method != "" && base.ID == nil:
		event.MessageType = types.MessageTypeNotification
	case base.Result != nil:
		event.MessageType = types.MessageTypeResponse
	case base.Error != nil:
		event.MessageType = types.MessageTypeError
	}

	if base.Error != nil {
		var messageError types.MCPError
		if err := json.Unmarshal(base.Error, &messageError); err != nil {
			return nil, fmt.Errorf("unmarshal MCP error payload: %w", err)
		}
		event.Error = &messageError
	}

	if event.MessageType == types.MessageTypeRequest && base.Method == "tools/call" {
		var params toolCallParams
		if err := json.Unmarshal(base.Params, &params); err != nil {
			return nil, fmt.Errorf("unmarshal tools/call params: %w", err)
		}
		event.ToolName = params.Name
		event.ToolArgs = params.Arguments
	}

	return event, nil
}

func classifyMethod(method string) types.MethodCategory {
	switch {
	case method == "tools/call":
		return types.CategoryToolCall
	case method == "tools/list":
		return types.CategoryToolList
	case method == "resources/read":
		return types.CategoryResourceRead
	case method == "resources/list":
		return types.CategoryResourceList
	case method == "prompts/get":
		return types.CategoryPromptGet
	case strings.HasPrefix(method, "sampling/"):
		return types.CategorySampling
	default:
		return types.CategoryLifecycle
	}
}
