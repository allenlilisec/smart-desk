// Package httpapi wires the smartdesk-core HTTP surface.
//
// CORE-0 ships the operational endpoints only — /healthz (liveness),
// /readyz (readiness incl. DB dependency) and /metrics — plus the router and
// graceful-shutdown plumbing. Domain routes (/v1/tickets, ...) are mounted by
// CORE-A/B handlers on top of this router as they land.
package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync/atomic"
	"time"
)

// Pinger is the readiness dependency contract (satisfied by *db.DB).
type Pinger interface {
	Ping(ctx context.Context) error
}

// Server holds the router and its dependencies.
type Server struct {
	log     *slog.Logger
	db      Pinger // may be nil in DB-less dev mode
	version string

	reqCount atomic.Int64
}

// New builds the HTTP handler. db may be nil (readiness reports degraded).
func New(log *slog.Logger, db Pinger, version string) http.Handler {
	s := &Server{log: log, db: db, version: version}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /readyz", s.handleReadyz)
	mux.HandleFunc("GET /metrics", s.handleMetrics)

	return s.withMiddleware(mux)
}

// withMiddleware adds request counting + access logging around the mux.
func (s *Server) withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.reqCount.Add(1)
		start := time.Now()
		next.ServeHTTP(w, r)
		s.log.Debug("http_request",
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Duration("took", time.Since(start)),
		)
	})
}

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": s.version})
}

func (s *Server) handleReadyz(w http.ResponseWriter, r *http.Request) {
	deps := map[string]string{}
	ready := true

	if s.db == nil {
		deps["database"] = "disabled"
	} else {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := s.db.Ping(ctx); err != nil {
			deps["database"] = "down"
			ready = false
		} else {
			deps["database"] = "ok"
		}
	}

	code := http.StatusOK
	status := "ready"
	if !ready {
		code = http.StatusServiceUnavailable
		status = "not_ready"
	}
	writeJSON(w, code, map[string]any{"status": status, "deps": deps})
}

func (s *Server) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	w.WriteHeader(http.StatusOK)
	// Minimal Prometheus exposition; richer metrics land with domain handlers.
	_, _ = w.Write([]byte(
		"# HELP smartdesk_core_http_requests_total Total HTTP requests handled.\n" +
			"# TYPE smartdesk_core_http_requests_total counter\n" +
			"smartdesk_core_http_requests_total " +
			itoa(s.reqCount.Load()) + "\n"))
}

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(body)
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
