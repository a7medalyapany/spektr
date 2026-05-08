package config

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"

	"github.com/pelletier/go-toml/v2"
)

type AgentType string

const (
	AgentClaudeCode    AgentType = "claude_code"
	AgentClaudeDesktop AgentType = "claude_desktop"
	AgentCursor        AgentType = "cursor"
	AgentWindsurf      AgentType = "windsurf"
	AgentCodex         AgentType = "codex"
)

type MCPServerJSON struct {
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env,omitempty"`
}

type PatchResult struct {
	Agent      AgentType
	ConfigPath string
	BackupPath string
	Patched    int
}

// DetectAgents returns which supported agents have a config file present.
func DetectAgents() []AgentType {
	agents := make([]AgentType, 0, 5)
	for _, agent := range []AgentType{
		AgentClaudeCode,
		AgentClaudeDesktop,
		AgentCursor,
		AgentWindsurf,
		AgentCodex,
	} {
		path := configPath(agent)
		if path == "" {
			continue
		}
		if _, err := os.Stat(path); err == nil {
			agents = append(agents, agent)
		} else if !os.IsNotExist(err) {
			slog.Warn("failed to stat agent config", "agent", agent, "path", path, "err", err)
		}
	}
	return agents
}

// PatchAgent wraps every MCP server in the agent's config with spektr-proxy.
func PatchAgent(agent AgentType, proxyBinPath, socketPath, backupDir string) (PatchResult, error) {
	path := configPath(agent)
	if path == "" {
		return PatchResult{}, fmt.Errorf("unsupported agent: %s", agent)
	}
	if proxyBinPath == "" {
		return PatchResult{}, fmt.Errorf("proxy binary path is required")
	}
	if socketPath == "" {
		return PatchResult{}, fmt.Errorf("socket path is required")
	}
	if backupDir == "" {
		return PatchResult{}, fmt.Errorf("backup dir is required")
	}

	info, err := os.Stat(path)
	if err != nil {
		return PatchResult{}, fmt.Errorf("stat config %s: %w", path, err)
	}

	original, err := os.ReadFile(path)
	if err != nil {
		return PatchResult{}, fmt.Errorf("read config %s: %w", path, err)
	}

	if err := os.MkdirAll(backupDir, 0700); err != nil {
		return PatchResult{}, fmt.Errorf("create backup dir %s: %w", backupDir, err)
	}

	backupPath := filepath.Join(backupDir, backupFileName(agent))
	if err := os.WriteFile(backupPath, original, 0600); err != nil {
		return PatchResult{}, fmt.Errorf("write backup %s: %w", backupPath, err)
	}

	patchedBytes, patched, err := patchConfig(agent, original, proxyBinPath, socketPath)
	if err != nil {
		return PatchResult{}, err
	}
	if patched > 0 {
		if err := atomicWriteFile(path, patchedBytes, info.Mode().Perm()); err != nil {
			return PatchResult{}, fmt.Errorf("write patched config %s: %w", path, err)
		}
	}

	return PatchResult{
		Agent:      agent,
		ConfigPath: path,
		BackupPath: backupPath,
		Patched:    patched,
	}, nil
}

// RestoreAgent writes the backup file back atomically.
func RestoreAgent(agent AgentType, backupPath string) error {
	path := configPath(agent)
	if path == "" {
		return fmt.Errorf("unsupported agent: %s", agent)
	}

	backup, err := os.ReadFile(backupPath)
	if err != nil {
		return fmt.Errorf("read backup %s: %w", backupPath, err)
	}

	perm := os.FileMode(0600)
	if info, err := os.Stat(path); err == nil {
		perm = info.Mode().Perm()
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat config %s: %w", path, err)
	}

	if err := atomicWriteFile(path, backup, perm); err != nil {
		return fmt.Errorf("restore config %s: %w", path, err)
	}
	return nil
}

func patchConfig(agent AgentType, original []byte, proxyBinPath, socketPath string) ([]byte, int, error) {
	if agent == AgentCodex {
		return patchTOMLConfig(original, proxyBinPath, socketPath)
	}
	return patchJSONConfig(original, proxyBinPath, socketPath)
}

func patchJSONConfig(original []byte, proxyBinPath, socketPath string) ([]byte, int, error) {
	var config map[string]json.RawMessage
	if err := json.Unmarshal(original, &config); err != nil {
		return nil, 0, fmt.Errorf("parse json config: %w", err)
	}

	rawServers, ok := config["mcpServers"]
	if !ok {
		return original, 0, nil
	}

	var servers map[string]MCPServerJSON
	if err := json.Unmarshal(rawServers, &servers); err != nil {
		return nil, 0, fmt.Errorf("parse mcpServers: %w", err)
	}

	patched := wrapJSONServers(servers, proxyBinPath, socketPath)
	if patched == 0 {
		return original, 0, nil
	}

	patchedServers, err := json.Marshal(servers)
	if err != nil {
		return nil, 0, fmt.Errorf("marshal mcpServers: %w", err)
	}
	config["mcpServers"] = patchedServers

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return nil, 0, fmt.Errorf("marshal json config: %w", err)
	}
	data = append(data, '\n')
	return data, patched, nil
}

func wrapJSONServers(servers map[string]MCPServerJSON, proxyBinPath, socketPath string) int {
	patched := 0
	for name, server := range servers {
		if server.Command == proxyBinPath {
			continue
		}
		args := proxyArgs(name, socketPath, server.Command, server.Args)
		servers[name] = MCPServerJSON{
			Command: proxyBinPath,
			Args:    args,
			Env:     server.Env,
		}
		patched++
	}
	return patched
}

func patchTOMLConfig(original []byte, proxyBinPath, socketPath string) ([]byte, int, error) {
	var config map[string]interface{}
	if err := toml.Unmarshal(original, &config); err != nil {
		return nil, 0, fmt.Errorf("parse toml config: %w", err)
	}

	rawServers, ok := config["mcp_servers"]
	if !ok {
		return original, 0, nil
	}

	servers, ok := rawServers.(map[string]interface{})
	if !ok {
		return nil, 0, fmt.Errorf("parse mcp_servers: expected table, got %T", rawServers)
	}

	patched := 0
	for name, rawServer := range servers {
		server, ok := rawServer.(map[string]interface{})
		if !ok {
			return nil, 0, fmt.Errorf("parse mcp_servers.%s: expected table, got %T", name, rawServer)
		}

		command, _ := server["command"].(string)
		if command == proxyBinPath {
			continue
		}

		args, err := tomlStringSlice(server["args"])
		if err != nil {
			return nil, 0, fmt.Errorf("parse mcp_servers.%s.args: %w", name, err)
		}

		server["command"] = proxyBinPath
		server["args"] = proxyArgs(name, socketPath, command, args)
		patched++
	}
	if patched == 0 {
		return original, 0, nil
	}

	data, err := toml.Marshal(config)
	if err != nil {
		return nil, 0, fmt.Errorf("marshal toml config: %w", err)
	}
	return data, patched, nil
}

func tomlStringSlice(raw interface{}) ([]string, error) {
	if raw == nil {
		return nil, nil
	}

	switch values := raw.(type) {
	case []string:
		return values, nil
	case []interface{}:
		args := make([]string, 0, len(values))
		for _, value := range values {
			arg, ok := value.(string)
			if !ok {
				return nil, fmt.Errorf("expected string arg, got %T", value)
			}
			args = append(args, arg)
		}
		return args, nil
	default:
		return nil, fmt.Errorf("expected string array, got %T", raw)
	}
}

func proxyArgs(serverName, socketPath, command string, args []string) []string {
	wrapped := make([]string, 0, 6+len(args))
	wrapped = append(wrapped, "--server", serverName, "--socket", socketPath, "--", command)
	wrapped = append(wrapped, args...)
	return wrapped
}

func configPath(agent AgentType) string {
	home := homeDir()

	switch agent {
	case AgentClaudeCode:
		if home == "" {
			return ""
		}
		return filepath.Join(home, ".claude.json")
	case AgentClaudeDesktop:
		switch runtime.GOOS {
		case "darwin":
			if home == "" {
				return ""
			}
			return filepath.Join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
		case "linux":
			if home == "" {
				return ""
			}
			return filepath.Join(home, ".config", "Claude", "claude_desktop_config.json")
		case "windows":
			appData := os.Getenv("APPDATA")
			if appData == "" {
				return ""
			}
			return filepath.Join(appData, "Claude", "claude_desktop_config.json")
		default:
			return ""
		}
	case AgentCursor:
		if home == "" {
			return ""
		}
		return filepath.Join(home, ".cursor", "mcp.json")
	case AgentWindsurf:
		if home == "" {
			return ""
		}
		return filepath.Join(home, ".codeium", "windsurf", "mcp_config.json")
	case AgentCodex:
		if home == "" {
			return ""
		}
		return filepath.Join(home, ".codex", "config.toml")
	default:
		return ""
	}
}

func homeDir() string {
	if home := os.Getenv("HOME"); home != "" {
		return home
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return home
}

func backupFileName(agent AgentType) string {
	switch agent {
	case AgentCodex:
		return "codex.toml.bak"
	case AgentClaudeCode:
		return "claude_code.json.bak"
	case AgentClaudeDesktop:
		return "claude_desktop.json.bak"
	case AgentCursor:
		return "cursor.json.bak"
	case AgentWindsurf:
		return "windsurf.json.bak"
	default:
		return string(agent) + ".bak"
	}
}

func atomicWriteFile(path string, data []byte, perm os.FileMode) error {
	tmp := path + ".spektr.tmp"
	if err := os.WriteFile(tmp, data, perm); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
