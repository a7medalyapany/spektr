package config

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestPatchAgentClaudeCodeWrapsAndRestores(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	configPath := filepath.Join(home, ".claude.json")
	original := []byte(`{
  "authToken": "keep-me",
  "history": [{"prompt": "do not drop"}],
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "env": {"NODE_ENV": "test"}
    }
  }
}
`)
	if err := os.WriteFile(configPath, original, 0600); err != nil {
		t.Fatalf("write claude config: %v", err)
	}

	proxyBinPath := filepath.Join(home, "bin", "spektr-proxy")
	socketPath := filepath.Join(home, "spektr.sock")
	backupDir := filepath.Join(home, "backups")

	result, err := PatchAgent(AgentClaudeCode, proxyBinPath, socketPath, backupDir)
	if err != nil {
		t.Fatalf("PatchAgent() error = %v", err)
	}
	if result.Agent != AgentClaudeCode {
		t.Fatalf("result.Agent = %q, want %q", result.Agent, AgentClaudeCode)
	}
	if result.ConfigPath != configPath {
		t.Fatalf("result.ConfigPath = %q, want %q", result.ConfigPath, configPath)
	}
	if result.BackupPath != filepath.Join(backupDir, "claude_code.json.bak") {
		t.Fatalf("result.BackupPath = %q", result.BackupPath)
	}
	if result.Patched != 1 {
		t.Fatalf("result.Patched = %d, want 1", result.Patched)
	}

	patchedBytes, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read patched config: %v", err)
	}

	var patched map[string]json.RawMessage
	if err := json.Unmarshal(patchedBytes, &patched); err != nil {
		t.Fatalf("unmarshal patched config: %v", err)
	}
	if _, ok := patched["authToken"]; !ok {
		t.Fatal("patched config dropped authToken")
	}
	if _, ok := patched["history"]; !ok {
		t.Fatal("patched config dropped history")
	}

	var servers map[string]MCPServerJSON
	if err := json.Unmarshal(patched["mcpServers"], &servers); err != nil {
		t.Fatalf("unmarshal patched mcpServers: %v", err)
	}
	server := servers["filesystem"]
	if server.Command != proxyBinPath {
		t.Fatalf("server.Command = %q, want %q", server.Command, proxyBinPath)
	}

	wantArgs := []string{
		"--server",
		"filesystem",
		"--socket",
		socketPath,
		"--",
		"npx",
		"-y",
		"@modelcontextprotocol/server-filesystem",
		"/tmp",
	}
	if !reflect.DeepEqual(server.Args, wantArgs) {
		t.Fatalf("server.Args = %#v, want %#v", server.Args, wantArgs)
	}
	if server.Env["NODE_ENV"] != "test" {
		t.Fatalf("server.Env[NODE_ENV] = %q, want test", server.Env["NODE_ENV"])
	}

	backupBytes, err := os.ReadFile(result.BackupPath)
	if err != nil {
		t.Fatalf("read backup: %v", err)
	}
	if !bytes.Equal(backupBytes, original) {
		t.Fatal("backup bytes do not match original config")
	}

	if err := RestoreAgent(AgentClaudeCode, result.BackupPath); err != nil {
		t.Fatalf("RestoreAgent() error = %v", err)
	}
	restoredBytes, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read restored config: %v", err)
	}
	if !bytes.Equal(restoredBytes, original) {
		t.Fatal("restored config bytes do not match original config")
	}
}
