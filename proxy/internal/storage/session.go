package storage

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/spektr-dev/spektr/pkg/types"
)

func (s *Store) InsertSession(ctx context.Context, sess *types.Session) error {
	if sess == nil {
		return fmt.Errorf("insert session: nil session")
	}

	_, err := execStmtContext(
		ctx,
		s.stmtInsertSession,
		sess.ID,
		sess.AgentType,
		nil,
		unixMillis(sess.StartedAt),
		nullableUnixMillis(sess.EndedAt),
		sess.TotalEvents,
		sess.TotalCostUSD,
		nil,
	)
	if err != nil {
		return fmt.Errorf("insert session %s: %w", sess.ID, err)
	}

	return nil
}

func (s *Store) GetSession(ctx context.Context, id string) (*types.Session, error) {
	const query = `
SELECT id, agent_type, started_at, ended_at, total_events, total_cost
FROM sessions
WHERE id = ?
`

	var sess types.Session
	var startedAt int64
	var endedAt sql.NullInt64

	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&sess.ID,
		&sess.AgentType,
		&startedAt,
		&endedAt,
		&sess.TotalEvents,
		&sess.TotalCostUSD,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, err
		}
		return nil, fmt.Errorf("get session %s: %w", id, err)
	}

	sess.StartedAt = timeFromUnixMillis(startedAt)
	if endedAt.Valid {
		t := timeFromUnixMillis(endedAt.Int64)
		sess.EndedAt = &t
	}

	return &sess, nil
}

func (s *Store) ListSessions(ctx context.Context, limit int) ([]*types.Session, error) {
	if limit <= 0 {
		limit = 100
	}

	const query = `
SELECT id, agent_type, started_at, ended_at, total_events, total_cost
FROM sessions
ORDER BY started_at DESC
LIMIT ?
`

	rows, err := s.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()

	var sessions []*types.Session
	for rows.Next() {
		var sess types.Session
		var startedAt int64
		var endedAt sql.NullInt64

		if err := rows.Scan(
			&sess.ID,
			&sess.AgentType,
			&startedAt,
			&endedAt,
			&sess.TotalEvents,
			&sess.TotalCostUSD,
		); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}

		sess.StartedAt = timeFromUnixMillis(startedAt)
		if endedAt.Valid {
			t := timeFromUnixMillis(endedAt.Int64)
			sess.EndedAt = &t
		}

		sessions = append(sessions, &sess)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sessions: %w", err)
	}

	return sessions, nil
}

func (s *Store) CloseSession(ctx context.Context, id string) error {
	const query = `UPDATE sessions SET ended_at = ? WHERE id = ?`

	if _, err := s.db.ExecContext(ctx, query, time.Now().UTC().UnixMilli(), id); err != nil {
		return fmt.Errorf("close session %s: %w", id, err)
	}

	return nil
}

func (s *Store) DeleteSession(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin delete session %s: %w", id, err)
	}

	result, err := tx.ExecContext(ctx, `DELETE FROM events WHERE session_id = ?`, id)
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("delete events for session %s: %w", id, err)
	}
	if _, err := result.RowsAffected(); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("count deleted events for session %s: %w", id, err)
	}

	result, err = tx.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, id)
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("delete session %s: %w", id, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("count deleted sessions for %s: %w", id, err)
	}
	if rows == 0 {
		_ = tx.Rollback()
		return sql.ErrNoRows
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit delete session %s: %w", id, err)
	}

	return nil
}
