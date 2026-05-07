package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/spektr-dev/spektr/pkg/types"
)

func TestOpenCreatesSchema(t *testing.T) {
	t.Parallel()

	store := openTestStore(t)
	defer store.Close()
}

func TestInsertSessionGetSessionRoundTrip(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	store := openTestStore(t)
	defer store.Close()

	endedAt := time.UnixMilli(1710001234567).UTC()
	want := &types.Session{
		ID:           "sess-1",
		AgentType:    "codex",
		StartedAt:    time.UnixMilli(1710000000000).UTC(),
		EndedAt:      &endedAt,
		TotalEvents:  42,
		TotalCostUSD: 1.25,
	}

	if err := store.InsertSession(ctx, want); err != nil {
		t.Fatalf("InsertSession() error = %v", err)
	}

	got, err := store.GetSession(ctx, want.ID)
	if err != nil {
		t.Fatalf("GetSession() error = %v", err)
	}

	if got.ID != want.ID ||
		got.AgentType != want.AgentType ||
		!got.StartedAt.Equal(want.StartedAt) ||
		got.TotalEvents != want.TotalEvents ||
		got.TotalCostUSD != want.TotalCostUSD {
		t.Fatalf("session mismatch: got %+v want %+v", got, want)
	}

	if got.EndedAt == nil || !got.EndedAt.Equal(*want.EndedAt) {
		t.Fatalf("ended_at mismatch: got %v want %v", got.EndedAt, want.EndedAt)
	}
}

func TestInsertEventGetEventRoundTrip(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	store := openTestStore(t)
	defer store.Close()

	insertTestSession(t, ctx, store, "sess-events")

	messageID := json.RawMessage(`123`)
	want := &types.MCPEvent{
		ID:          "evt-1",
		SessionID:   "sess-events",
		PairedID:    "evt-0",
		ServerName:  "filesystem",
		ServerPID:   9001,
		Transport:   types.TransportStdio,
		Direction:   types.DirectionRequest,
		MessageType: types.MessageTypeRequest,
		Category:    types.CategoryToolCall,
		Method:      "tools/call",
		MessageID:   &messageID,
		ToolName:    "read_file",
		Params:      json.RawMessage(`{"path":"/tmp/demo.txt"}`),
		Result:      json.RawMessage(`{"ok":true}`),
		Timestamp:   time.UnixMilli(1710000001000).UTC(),
		DurationMs:  17,
		RiskLevel:   types.RiskHigh,
		RiskFlags: []types.RiskFlag{
			{Rule: "path-sensitive", Level: types.RiskHigh, Description: "touches sensitive file"},
		},
		Paused: true,
		Cost: &types.CostEstimate{
			InputTokens:  11,
			OutputTokens: 7,
			TotalUSD:     0.42,
		},
		RawPayload: []byte(`{"jsonrpc":"2.0","method":"tools/call"}`),
	}

	if err := store.InsertEvent(ctx, want); err != nil {
		t.Fatalf("InsertEvent() error = %v", err)
	}

	got, err := store.GetEvent(ctx, want.ID)
	if err != nil {
		t.Fatalf("GetEvent() error = %v", err)
	}

	if got.ID != want.ID ||
		got.SessionID != want.SessionID ||
		got.PairedID != want.PairedID ||
		got.ServerName != want.ServerName ||
		got.ServerPID != want.ServerPID ||
		got.Transport != want.Transport ||
		got.Direction != want.Direction ||
		got.MessageType != want.MessageType ||
		got.Category != want.Category ||
		got.Method != want.Method ||
		got.ToolName != want.ToolName ||
		!got.Timestamp.Equal(want.Timestamp) ||
		got.DurationMs != want.DurationMs ||
		got.RiskLevel != want.RiskLevel ||
		got.Paused != want.Paused {
		t.Fatalf("event metadata mismatch: got %+v want %+v", got, want)
	}

	if got.MessageID == nil || string(*got.MessageID) != string(*want.MessageID) {
		t.Fatalf("message_id mismatch: got %v want %s", got.MessageID, string(*want.MessageID))
	}
	if string(got.Params) != string(want.Params) {
		t.Fatalf("params mismatch: got %s want %s", string(got.Params), string(want.Params))
	}
	if len(got.RiskFlags) != len(want.RiskFlags) || got.RiskFlags[0] != want.RiskFlags[0] {
		t.Fatalf("risk flags mismatch: got %+v want %+v", got.RiskFlags, want.RiskFlags)
	}
	if got.Cost == nil || *got.Cost != *want.Cost {
		t.Fatalf("cost mismatch: got %+v want %+v", got.Cost, want.Cost)
	}
	if string(got.RawPayload) != string(want.RawPayload) {
		t.Fatalf("raw payload mismatch: got %s want %s", string(got.RawPayload), string(want.RawPayload))
	}
}

func TestListEventsServerFilter(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	store := openTestStore(t)
	defer store.Close()

	insertTestSession(t, ctx, store, "sess-filter")

	events := []*types.MCPEvent{
		testEvent("evt-a", "sess-filter", "filesystem", "read_file", time.UnixMilli(1710000000000).UTC()),
		testEvent("evt-b", "sess-filter", "github", "create_issue", time.UnixMilli(1710000001000).UTC()),
		testEvent("evt-c", "sess-filter", "filesystem", "write_file", time.UnixMilli(1710000002000).UTC()),
	}

	for _, event := range events {
		if err := store.InsertEvent(ctx, event); err != nil {
			t.Fatalf("InsertEvent(%s) error = %v", event.ID, err)
		}
	}

	got, err := store.ListEvents(ctx, ListEventsOpts{
		SessionID: "sess-filter",
		Server:    "filesystem",
		Limit:     10,
	})
	if err != nil {
		t.Fatalf("ListEvents() error = %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("ListEvents() len = %d, want 2", len(got))
	}
	for _, event := range got {
		if event.ServerName != "filesystem" {
			t.Fatalf("unexpected server_name %q", event.ServerName)
		}
	}
}

func TestBatchInsert500Under100ms(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	store := openTestStore(t)
	defer store.Close()

	insertTestSession(t, ctx, store, "sess-batch")

	events := make([]*types.MCPEvent, 0, 500)
	base := time.UnixMilli(1710000000000).UTC()
	for i := 0; i < 500; i++ {
		events = append(events, testEvent(
			fmt.Sprintf("evt-batch-%03d", i),
			"sess-batch",
			"filesystem",
			"read_file",
			base.Add(time.Duration(i)*time.Millisecond),
		))
	}

	start := time.Now()
	if err := store.BatchInsert(ctx, events); err != nil {
		t.Fatalf("BatchInsert() error = %v", err)
	}
	if elapsed := time.Since(start); elapsed >= 100*time.Millisecond {
		t.Fatalf("BatchInsert() took %s, want < 100ms", elapsed)
	}
}

func TestSearchEventsByToolName(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	store := openTestStore(t)
	defer store.Close()

	insertTestSession(t, ctx, store, "sess-search")

	if err := store.InsertEvent(ctx, testEvent("evt-search-1", "sess-search", "filesystem", "read_file", time.UnixMilli(1710000000000).UTC())); err != nil {
		t.Fatalf("InsertEvent(read_file) error = %v", err)
	}
	if err := store.InsertEvent(ctx, testEvent("evt-search-2", "sess-search", "filesystem", "write_file", time.UnixMilli(1710000001000).UTC())); err != nil {
		t.Fatalf("InsertEvent(write_file) error = %v", err)
	}

	got, err := store.SearchEvents(ctx, "sess-search", "write_file", 10)
	if err != nil {
		t.Fatalf("SearchEvents() error = %v", err)
	}

	if len(got) == 0 {
		t.Fatalf("SearchEvents() returned no rows")
	}
	if got[0].ToolName != "write_file" {
		t.Fatalf("SearchEvents() first tool_name = %q, want write_file", got[0].ToolName)
	}
}

func openTestStore(t *testing.T) *Store {
	t.Helper()

	path := filepath.Join(t.TempDir(), "spektr-test.sqlite")
	store, err := Open(path)
	if err != nil {
		t.Fatalf("Open(%q) error = %v", path, err)
	}
	return store
}

func insertTestSession(t *testing.T, ctx context.Context, store *Store, id string) {
	t.Helper()

	if err := store.InsertSession(ctx, &types.Session{
		ID:        id,
		AgentType: "codex",
		StartedAt: time.UnixMilli(1710000000000).UTC(),
	}); err != nil {
		t.Fatalf("InsertSession(%s) error = %v", id, err)
	}
}

func testEvent(id, sessionID, server, toolName string, ts time.Time) *types.MCPEvent {
	return &types.MCPEvent{
		ID:          id,
		SessionID:   sessionID,
		ServerName:  server,
		ServerPID:   100,
		Transport:   types.TransportStdio,
		Direction:   types.DirectionRequest,
		MessageType: types.MessageTypeRequest,
		Category:    types.CategoryToolCall,
		Method:      "tools/call",
		ToolName:    toolName,
		Params:      json.RawMessage(`{"path":"/tmp/example.txt"}`),
		Result:      json.RawMessage(`{"ok":true}`),
		Timestamp:   ts,
		RiskLevel:   types.RiskLow,
		RiskFlags:   []types.RiskFlag{},
		RawPayload:  []byte(`{"jsonrpc":"2.0"}`),
	}
}
