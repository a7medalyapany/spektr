package pipeline

import (
	"sync"

	"github.com/google/uuid"

	"github.com/spektr-dev/spektr/pkg/types"
)

type Enricher struct {
	sessionID string
	inFlight  sync.Map
}

func NewEnricher(sessionID string) *Enricher {
	return &Enricher{sessionID: sessionID}
}

func (e *Enricher) Enrich(event *types.MCPEvent) *types.MCPEvent {
	if event == nil {
		return nil
	}

	id, _ := uuid.NewV7()
	event.ID = id.String()
	event.SessionID = e.sessionID

	if event.MessageID == nil {
		return event
	}

	key := event.ServerName + ":" + string(*event.MessageID)

	if event.MessageType == types.MessageTypeRequest {
		e.inFlight.Store(key, event)
		return event
	}

	if event.MessageType == types.MessageTypeResponse {
		req, ok := e.inFlight.LoadAndDelete(key)
		if ok {
			reqEvent := req.(*types.MCPEvent)
			event.PairedID = reqEvent.ID
			reqEvent.PairedID = event.ID
			event.DurationMs = event.Timestamp.Sub(reqEvent.Timestamp).Milliseconds()
		}
	}

	return event
}
