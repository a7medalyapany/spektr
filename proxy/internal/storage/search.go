package storage

import (
	"context"
	"fmt"

	"github.com/spektr-dev/spektr/pkg/types"
)

func (s *Store) SearchEvents(ctx context.Context, sessionID, query string, limit int) ([]*types.MCPEvent, error) {
	if limit <= 0 {
		limit = 100
	}

	const searchSQL = `
SELECT
    e.id, e.session_id, e.paired_id, e.server_name, e.server_pid, e.transport, e.direction,
    e.message_type, e.category, e.method, e.message_id, e.tool_name, e.params, e.result,
    e.error_code, e.error_message, e.timestamp, e.duration_ms, e.risk_level, e.risk_flags,
    e.paused, e.input_tokens, e.output_tokens, e.cost_usd, e.raw_payload
FROM events e
JOIN events_fts fts ON e.rowid = fts.rowid
WHERE events_fts MATCH ? AND e.session_id = ?
ORDER BY rank
LIMIT ?
`

	rows, err := s.db.QueryContext(ctx, searchSQL, query, sessionID, limit)
	if err != nil {
		return nil, fmt.Errorf("search events: %w", err)
	}
	defer rows.Close()

	var events []*types.MCPEvent
	for rows.Next() {
		event, err := scanEventRows(rows)
		if err != nil {
			return nil, fmt.Errorf("scan search result: %w", err)
		}
		events = append(events, event)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate search results: %w", err)
	}

	return events, nil
}
