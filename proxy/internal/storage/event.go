package storage

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/spektr-dev/spektr/pkg/types"
)

type ListEventsOpts struct {
	SessionID string
	Server    string
	RiskLevel string
	Category  string
	Limit     int
	Offset    int
}

const eventBatchInsertChunkSize = 500

func (s *Store) InsertEvent(ctx context.Context, e *types.MCPEvent) error {
	if e == nil {
		return fmt.Errorf("insert event: nil event")
	}

	args, err := eventInsertArgs(e)
	if err != nil {
		return fmt.Errorf("build insert args for event %s: %w", e.ID, err)
	}

	if _, err := execStmtContext(ctx, s.stmtInsertEvent, args...); err != nil {
		return fmt.Errorf("insert event %s: %w", e.ID, err)
	}
	if err := syncEventsFTS(ctx, s.db, []string{e.ID}); err != nil {
		return fmt.Errorf("sync fts for event %s: %w", e.ID, err)
	}

	return nil
}

func (s *Store) BatchInsert(ctx context.Context, events []*types.MCPEvent) error {
	if len(events) == 0 {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin batch insert: %w", err)
	}

	for start := 0; start < len(events); start += eventBatchInsertChunkSize {
		end := min(start+eventBatchInsertChunkSize, len(events))
		if err := batchInsertChunk(ctx, tx, events[start:end]); err != nil {
			_ = tx.Rollback()
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit batch insert: %w", err)
	}

	return nil
}

func batchInsertChunk(ctx context.Context, tx *sql.Tx, events []*types.MCPEvent) error {
	query := strings.Builder{}
	query.Grow(len(insertEventSQL) + 512*len(events))
	query.WriteString(`
INSERT INTO events (
    id, session_id, paired_id, server_name, server_pid, transport, direction, message_type,
    category, method, message_id, tool_name, params, result, error_code, error_message,
    timestamp, duration_ms, risk_level, risk_flags, paused, input_tokens, output_tokens,
    cost_usd, raw_payload
) VALUES `)

	for i, event := range events {
		if i > 0 {
			query.WriteByte(',')
		}
		valuesSQL, err := eventInsertValuesSQL(event)
		if err != nil {
			return fmt.Errorf("build insert args for event %s: %w", event.ID, err)
		}
		query.WriteString(valuesSQL)
	}

	if _, err := tx.ExecContext(ctx, query.String()); err != nil {
		return fmt.Errorf("insert batch chunk (%d events): %w", len(events), err)
	}
	ids := make([]string, 0, len(events))
	for _, event := range events {
		ids = append(ids, event.ID)
	}
	if err := syncEventsFTS(ctx, tx, ids); err != nil {
		return fmt.Errorf("sync fts batch chunk (%d events): %w", len(events), err)
	}

	return nil
}

func eventInsertValuesSQL(e *types.MCPEvent) (string, error) {
	if e == nil {
		return "", fmt.Errorf("nil event")
	}

	riskFlags, err := json.Marshal(e.RiskFlags)
	if err != nil {
		return "", fmt.Errorf("marshal risk flags: %w", err)
	}

	var b strings.Builder
	b.Grow(512)
	b.WriteByte('(')
	writeSQLValue(&b, e.ID)
	b.WriteByte(',')
	writeSQLValue(&b, e.SessionID)
	b.WriteByte(',')
	writeSQLValue(&b, emptyStringAsNil(e.PairedID))
	b.WriteByte(',')
	writeSQLValue(&b, e.ServerName)
	b.WriteByte(',')
	b.WriteString(strconv.Itoa(e.ServerPID))
	b.WriteByte(',')
	writeSQLValue(&b, string(e.Transport))
	b.WriteByte(',')
	writeSQLValue(&b, string(e.Direction))
	b.WriteByte(',')
	writeSQLValue(&b, string(e.MessageType))
	b.WriteByte(',')
	writeSQLValue(&b, string(e.Category))
	b.WriteByte(',')
	writeSQLValue(&b, e.Method)
	b.WriteByte(',')
	writeRawMessageSQLValue(&b, e.MessageID)
	b.WriteByte(',')
	writeSQLValue(&b, emptyStringAsNil(e.ToolName))
	b.WriteByte(',')
	writeBlobSQLValue(&b, []byte(e.Params))
	b.WriteByte(',')
	writeBlobSQLValue(&b, []byte(e.Result))
	b.WriteByte(',')
	if e.Error != nil {
		b.WriteString(strconv.Itoa(e.Error.Code))
	} else {
		b.WriteString("NULL")
	}
	b.WriteByte(',')
	if e.Error != nil {
		writeSQLValue(&b, e.Error.Message)
	} else {
		b.WriteString("NULL")
	}
	b.WriteByte(',')
	b.WriteString(strconv.FormatInt(unixMillis(e.Timestamp), 10))
	b.WriteByte(',')
	b.WriteString(strconv.FormatInt(e.DurationMs, 10))
	b.WriteByte(',')
	writeSQLValue(&b, string(e.RiskLevel))
	b.WriteByte(',')
	writeBlobSQLValue(&b, riskFlags)
	b.WriteByte(',')
	b.WriteString(strconv.Itoa(boolToInt(e.Paused)))
	b.WriteByte(',')
	if e.Cost != nil {
		b.WriteString(strconv.Itoa(e.Cost.InputTokens))
	} else {
		b.WriteByte('0')
	}
	b.WriteByte(',')
	if e.Cost != nil {
		b.WriteString(strconv.Itoa(e.Cost.OutputTokens))
	} else {
		b.WriteByte('0')
	}
	b.WriteByte(',')
	if e.Cost != nil {
		b.WriteString(strconv.FormatFloat(e.Cost.TotalUSD, 'f', -1, 64))
	} else {
		b.WriteByte('0')
	}
	b.WriteByte(',')
	writeBlobSQLValue(&b, e.RawPayload)
	b.WriteByte(')')

	return b.String(), nil
}

func writeSQLValue(b *strings.Builder, value any) {
	switch v := value.(type) {
	case nil:
		b.WriteString("NULL")
	case string:
		b.WriteByte('\'')
		b.WriteString(strings.ReplaceAll(v, "'", "''"))
		b.WriteByte('\'')
	default:
		b.WriteString(fmt.Sprint(v))
	}
}

func writeRawMessageSQLValue(b *strings.Builder, msg *json.RawMessage) {
	if msg == nil {
		b.WriteString("NULL")
		return
	}

	writeSQLValue(b, string(*msg))
}

func writeBlobSQLValue(b *strings.Builder, blob []byte) {
	if blob == nil {
		b.WriteString("NULL")
		return
	}

	b.WriteString("X'")
	dst := make([]byte, hex.EncodedLen(len(blob)))
	hex.Encode(dst, blob)
	b.Write(dst)
	b.WriteByte('\'')
}

func emptyStringAsNil(v string) any {
	if v == "" {
		return nil
	}
	return v
}

type execContexter interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func syncEventsFTS(ctx context.Context, execer execContexter, ids []string) error {
	if len(ids) == 0 {
		return nil
	}

	query := strings.Builder{}
	query.Grow(256 + len(ids)*40)
	query.WriteString(`
INSERT INTO events_fts(rowid, id, tool_name, params_text, result_text)
SELECT
    rowid,
    id,
    COALESCE(tool_name, ''),
    COALESCE(CAST(params AS TEXT), ''),
    COALESCE(CAST(result AS TEXT), '')
FROM events
WHERE id IN (`)
	for i, id := range ids {
		if i > 0 {
			query.WriteByte(',')
		}
		writeSQLValue(&query, id)
	}
	query.WriteString(")")

	if _, err := execer.ExecContext(ctx, query.String()); err != nil {
		return fmt.Errorf("sync events fts: %w", err)
	}

	return nil
}

func (s *Store) GetEvent(ctx context.Context, id string) (*types.MCPEvent, error) {
	const query = `
SELECT
    id, session_id, paired_id, server_name, server_pid, transport, direction, message_type,
    category, method, message_id, tool_name, params, result, error_code, error_message,
    timestamp, duration_ms, risk_level, risk_flags, paused, input_tokens, output_tokens,
    cost_usd, raw_payload
FROM events
WHERE id = ?
`

	event, err := scanEventRow(s.db.QueryRowContext(ctx, query, id))
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, err
		}
		return nil, fmt.Errorf("get event %s: %w", id, err)
	}

	return event, nil
}

func (s *Store) ListEvents(ctx context.Context, opts ListEventsOpts) ([]*types.MCPEvent, error) {
	if opts.Limit <= 0 {
		opts.Limit = 100
	}
	if opts.Offset < 0 {
		opts.Offset = 0
	}

	query := strings.Builder{}
	query.WriteString(`
SELECT
    id, session_id, paired_id, server_name, server_pid, transport, direction, message_type,
    category, method, message_id, tool_name, params, result, error_code, error_message,
    timestamp, duration_ms, risk_level, risk_flags, paused, input_tokens, output_tokens,
    cost_usd, raw_payload
FROM events
WHERE 1=1
`)

	args := make([]any, 0, 6)
	if opts.SessionID != "" {
		query.WriteString(" AND session_id = ?")
		args = append(args, opts.SessionID)
	}
	if opts.Server != "" {
		query.WriteString(" AND server_name = ?")
		args = append(args, opts.Server)
	}
	if opts.RiskLevel != "" {
		query.WriteString(" AND risk_level = ?")
		args = append(args, opts.RiskLevel)
	}
	if opts.Category != "" {
		query.WriteString(" AND category = ?")
		args = append(args, opts.Category)
	}
	query.WriteString(" ORDER BY timestamp DESC LIMIT ? OFFSET ?")
	args = append(args, opts.Limit, opts.Offset)

	rows, err := s.db.QueryContext(ctx, query.String(), args...)
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}
	defer rows.Close()

	var events []*types.MCPEvent
	for rows.Next() {
		event, err := scanEventRows(rows)
		if err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		events = append(events, event)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate events: %w", err)
	}

	return events, nil
}

func eventInsertArgs(e *types.MCPEvent) ([]any, error) {
	if e == nil {
		return nil, fmt.Errorf("nil event")
	}

	riskFlags, err := json.Marshal(e.RiskFlags)
	if err != nil {
		return nil, fmt.Errorf("marshal risk flags: %w", err)
	}

	var errorCode any
	var errorMessage any
	if e.Error != nil {
		errorCode = e.Error.Code
		errorMessage = e.Error.Message
	}

	inputTokens := 0
	outputTokens := 0
	costUSD := 0.0
	if e.Cost != nil {
		inputTokens = e.Cost.InputTokens
		outputTokens = e.Cost.OutputTokens
		costUSD = e.Cost.TotalUSD
	}

	return []any{
		e.ID,
		e.SessionID,
		nullIfEmpty(e.PairedID),
		e.ServerName,
		e.ServerPID,
		string(e.Transport),
		string(e.Direction),
		string(e.MessageType),
		string(e.Category),
		e.Method,
		rawMessageValue(e.MessageID),
		nullIfEmpty(e.ToolName),
		[]byte(e.Params),
		[]byte(e.Result),
		errorCode,
		errorMessage,
		unixMillis(e.Timestamp),
		e.DurationMs,
		string(e.RiskLevel),
		riskFlags,
		boolToInt(e.Paused),
		inputTokens,
		outputTokens,
		costUSD,
		e.RawPayload,
	}, nil
}

func nullIfEmpty(v string) any {
	if v == "" {
		return nil
	}
	return v
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanEventRow(row rowScanner) (*types.MCPEvent, error) {
	return scanEventFrom(row)
}

func scanEventRows(rows *sql.Rows) (*types.MCPEvent, error) {
	return scanEventFrom(rows)
}

func scanEventFrom(scanner rowScanner) (*types.MCPEvent, error) {
	var event types.MCPEvent
	var pairedID sql.NullString
	var messageID sql.NullString
	var toolName sql.NullString
	var params []byte
	var result []byte
	var errorCode sql.NullInt64
	var errorMessage sql.NullString
	var timestamp int64
	var riskFlags []byte
	var paused int
	var inputTokens int
	var outputTokens int
	var costUSD float64
	var rawPayload []byte

	if err := scanner.Scan(
		&event.ID,
		&event.SessionID,
		&pairedID,
		&event.ServerName,
		&event.ServerPID,
		&event.Transport,
		&event.Direction,
		&event.MessageType,
		&event.Category,
		&event.Method,
		&messageID,
		&toolName,
		&params,
		&result,
		&errorCode,
		&errorMessage,
		&timestamp,
		&event.DurationMs,
		&event.RiskLevel,
		&riskFlags,
		&paused,
		&inputTokens,
		&outputTokens,
		&costUSD,
		&rawPayload,
	); err != nil {
		return nil, err
	}

	if pairedID.Valid {
		event.PairedID = pairedID.String
	}
	if messageID.Valid {
		raw := json.RawMessage(messageID.String)
		event.MessageID = &raw
	}
	if toolName.Valid {
		event.ToolName = toolName.String
	}
	event.Params = cloneJSON(params)
	event.Result = cloneJSON(result)
	event.Timestamp = timeFromUnixMillis(timestamp)
	event.Paused = paused != 0
	event.RawPayload = append([]byte(nil), rawPayload...)

	if len(riskFlags) > 0 {
		if err := json.Unmarshal(riskFlags, &event.RiskFlags); err != nil {
			return nil, fmt.Errorf("unmarshal risk flags for event %s: %w", event.ID, err)
		}
	}

	if errorCode.Valid || errorMessage.Valid {
		event.Error = &types.MCPError{
			Code:    int(errorCode.Int64),
			Message: errorMessage.String,
		}
	}

	if inputTokens != 0 || outputTokens != 0 || costUSD != 0 {
		event.Cost = &types.CostEstimate{
			InputTokens:  inputTokens,
			OutputTokens: outputTokens,
			TotalUSD:     costUSD,
		}
	}

	return &event, nil
}

func cloneJSON(v []byte) json.RawMessage {
	if len(v) == 0 {
		return nil
	}
	return append(json.RawMessage(nil), v...)
}
