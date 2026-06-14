// Package config loads smartdesk-core runtime configuration from the
// environment. All knobs have safe local defaults so the service boots in dev
// without any env wiring; production overrides everything via env.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config is the fully-resolved runtime configuration.
type Config struct {
	Env             string        // dev | staging | prod
	HTTPAddr        string        // listen address, e.g. ":8080"
	LogLevel        string        // debug | info | warn | error
	DatabaseURL     string        // postgres DSN; empty disables DB (readiness degrades)
	ShutdownTimeout time.Duration // graceful shutdown budget

	// ServiceAuth: gateway-issued service JWT validation (aud=core). The
	// public key / JWKS wiring lands with the auth middleware (GW handoff);
	// CORE-0 only carries the config surface so callers can set it now.
	ServiceJWTAudience string

	// Events: where domain events are published. Empty selects the log
	// publisher (no external bus required for local dev / CI).
	EventBusURL string
}

// Load reads configuration from the environment, applying defaults.
func Load() (Config, error) {
	c := Config{
		Env:                getEnv("CORE_ENV", "dev"),
		HTTPAddr:           getEnv("CORE_HTTP_ADDR", ":8080"),
		LogLevel:           getEnv("CORE_LOG_LEVEL", "info"),
		DatabaseURL:        getEnv("CORE_DATABASE_URL", ""),
		ServiceJWTAudience: getEnv("CORE_SERVICE_JWT_AUD", "core"),
		EventBusURL:        getEnv("CORE_EVENT_BUS_URL", ""),
	}

	to, err := getDuration("CORE_SHUTDOWN_TIMEOUT", 15*time.Second)
	if err != nil {
		return Config{}, err
	}
	c.ShutdownTimeout = to
	return c, nil
}

func getEnv(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

func getDuration(key string, def time.Duration) (time.Duration, error) {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def, nil
	}
	// Accept either a Go duration ("15s") or a plain integer in seconds.
	if d, err := time.ParseDuration(v); err == nil {
		return d, nil
	}
	secs, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("config: invalid duration for %s: %q", key, v)
	}
	return time.Duration(secs) * time.Second, nil
}
