// Package config loads smartdesk-core runtime configuration from the environment
// with safe defaults so the service runs out-of-the-box for local/integration.
package config

import (
	"os"
	"strconv"
)

// Config is the resolved service configuration.
type Config struct {
	Addr        string // HTTP listen address
	OrgID       string // default org for multi-tenant placeholder (OQ-7)
	DatabaseURL string // postgres DSN; empty selects the in-memory store
}

// Load reads configuration from the environment.
func Load() Config {
	return Config{
		Addr:        envStr("CORE_HTTP_ADDR", ":8081"),
		OrgID:       envStr("CORE_ORG_ID", "default"),
		DatabaseURL: envStr("CORE_DATABASE_URL", ""),
	}
}

func envStr(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

// envInt is reserved for future numeric settings (e.g. timeouts).
func envInt(key string, def int) int { //nolint:unused
	if v, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
