CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    agent_type    TEXT NOT NULL,
    agent_pid     INTEGER,
    started_at    INTEGER NOT NULL,
    ended_at      INTEGER,
    total_events  INTEGER DEFAULT 0,
    total_cost    REAL    DEFAULT 0.0,
    metadata      JSON
);

CREATE TABLE IF NOT EXISTS events (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions(id),
    paired_id     TEXT,
    server_name   TEXT NOT NULL,
    server_pid    INTEGER,
    transport     TEXT NOT NULL,
    direction     TEXT NOT NULL,
    message_type  TEXT NOT NULL,
    category      TEXT NOT NULL,
    method        TEXT NOT NULL,
    message_id    TEXT,
    tool_name     TEXT,
    params        BLOB,
    result        BLOB,
    error_code    INTEGER,
    error_message TEXT,
    timestamp     INTEGER NOT NULL,
    duration_ms   INTEGER,
    risk_level    TEXT NOT NULL DEFAULT 'none',
    risk_flags    JSON DEFAULT '[]',
    paused        INTEGER DEFAULT 0,
    input_tokens  INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd      REAL    DEFAULT 0.0,
    raw_payload   BLOB
);

CREATE INDEX IF NOT EXISTS idx_events_session  ON events(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_server   ON events(server_name);
CREATE INDEX IF NOT EXISTS idx_events_risk     ON events(risk_level) WHERE risk_level != 'none';
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);

CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
    id UNINDEXED,
    tool_name,
    params_text,
    result_text,
    content='events',
    content_rowid='rowid'
);

CREATE VIEW IF NOT EXISTS session_stats AS
SELECT
    session_id,
    COUNT(*)                                      AS total_events,
    COUNT(*) FILTER (WHERE direction='request')   AS total_requests,
    SUM(cost_usd)                                 AS total_cost_usd,
    SUM(input_tokens)                             AS total_input_tokens,
    SUM(output_tokens)                            AS total_output_tokens,
    COUNT(*) FILTER (WHERE risk_level='critical') AS critical_events,
    COUNT(*) FILTER (WHERE risk_level='high')     AS high_events,
    MAX(timestamp) - MIN(timestamp)               AS duration_ms
FROM events
GROUP BY session_id;

CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
    INSERT INTO events_fts(rowid, id, tool_name, params_text, result_text)
    VALUES (
        new.rowid,
        new.id,
        COALESCE(new.tool_name, ''),
        COALESCE(CAST(new.params AS TEXT), ''),
        COALESCE(CAST(new.result AS TEXT), '')
    );
END;

CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
    INSERT INTO events_fts(events_fts, rowid, id, tool_name, params_text, result_text)
    VALUES ('delete', old.rowid, old.id, old.tool_name, CAST(old.params AS TEXT), CAST(old.result AS TEXT));
END;

CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
    INSERT INTO events_fts(events_fts, rowid, id, tool_name, params_text, result_text)
    VALUES ('delete', old.rowid, old.id, old.tool_name, CAST(old.params AS TEXT), CAST(old.result AS TEXT));
    INSERT INTO events_fts(rowid, id, tool_name, params_text, result_text)
    VALUES (
        new.rowid,
        new.id,
        COALESCE(new.tool_name, ''),
        COALESCE(CAST(new.params AS TEXT), ''),
        COALESCE(CAST(new.result AS TEXT), '')
    );
END;
