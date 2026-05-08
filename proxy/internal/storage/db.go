package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/url"
	"time"

	_ "modernc.org/sqlite"
)

const insertSessionSQL = `
INSERT INTO sessions (
    id, agent_type, agent_pid, started_at, ended_at, total_events, total_cost, metadata
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`

const insertEventSQL = `
INSERT INTO events (
    id, session_id, paired_id, server_name, server_pid, transport, direction, message_type,
    category, method, message_id, tool_name, params, result, error_code, error_message,
    timestamp, duration_ms, risk_level, risk_flags, paused, input_tokens, output_tokens,
    cost_usd, raw_payload
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

type Store struct {
	db *sql.DB

	stmtInsertEvent   *sql.Stmt
	stmtInsertSession *sql.Stmt
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", sqliteDSN(path))
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}

	if err := applyPragmas(db); err != nil {
		_ = db.Close()
		return nil, err
	}

	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(0)

	if err := runMigrations(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("run migrations: %w", err)
	}

	stmtInsertEvent, err := db.Prepare(insertEventSQL)
	if err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("prepare insert event statement: %w", err)
	}

	stmtInsertSession, err := db.Prepare(insertSessionSQL)
	if err != nil {
		_ = stmtInsertEvent.Close()
		_ = db.Close()
		return nil, fmt.Errorf("prepare insert session statement: %w", err)
	}

	return &Store{
		db:                db,
		stmtInsertEvent:   stmtInsertEvent,
		stmtInsertSession: stmtInsertSession,
	}, nil
}

func (s *Store) Close() error {
	if s == nil {
		return nil
	}

	var firstErr error
	if s.stmtInsertEvent != nil {
		if err := s.stmtInsertEvent.Close(); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("close insert event statement: %w", err)
		}
	}
	if s.stmtInsertSession != nil {
		if err := s.stmtInsertSession.Close(); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("close insert session statement: %w", err)
		}
	}
	if s.db != nil {
		if err := s.db.Close(); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("close database: %w", err)
		}
	}

	return firstErr
}

func applyPragmas(db *sql.DB) error {
	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA busy_timeout=5000",
		"PRAGMA foreign_keys=ON",
	}

	for _, pragma := range pragmas {
		if _, err := db.Exec(pragma); err != nil {
			return fmt.Errorf("apply %q: %w", pragma, err)
		}
	}

	return nil
}

func sqliteDSN(path string) string {
	query := url.Values{}
	query.Add("_txlock", "immediate")
	query.Add("_pragma", "journal_mode=WAL")
	query.Add("_pragma", "synchronous=NORMAL")
	query.Add("_pragma", "busy_timeout=5000")
	query.Add("_pragma", "foreign_keys=ON")

	return (&url.URL{
		Scheme:   "file",
		Path:     path,
		RawQuery: query.Encode(),
	}).String()
}

func unixMillis(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.UnixMilli()
}

func timeFromUnixMillis(ms int64) time.Time {
	if ms == 0 {
		return time.Time{}
	}
	return time.UnixMilli(ms).UTC()
}

func nullableUnixMillis(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UnixMilli()
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

func rawMessageValue(msg *json.RawMessage) any {
	if msg == nil {
		return nil
	}
	return string(*msg)
}

func execStmtContext(ctx context.Context, stmt *sql.Stmt, args ...any) (sql.Result, error) {
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
	}
	return stmt.ExecContext(ctx, args...)
}
