// Package logging provides a single structured logger (slog) for the service.
// JSON output is used everywhere so logs are machine-parsable in any
// environment.
package logging

import (
	"log/slog"
	"os"
	"strings"
)

// New returns a JSON slog.Logger at the given level ("debug"/"info"/"warn"/"error").
func New(level string) *slog.Logger {
	h := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: parseLevel(level)})
	return slog.New(h)
}

func parseLevel(level string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
