package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newTestHandler(db Pinger) http.Handler {
	return New(slog.New(slog.NewTextHandler(io.Discard, nil)), db, "test")
}

func TestHealthz(t *testing.T) {
	srv := httptest.NewServer(newTestHandler(nil))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("healthz: got %d, want 200", resp.StatusCode)
	}
	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ok" {
		t.Fatalf("healthz status = %q, want ok", body["status"])
	}
}

type stubPinger struct{ err error }

func (s stubPinger) Ping(context.Context) error { return s.err }

func TestReadyz(t *testing.T) {
	cases := []struct {
		name string
		db   Pinger
		want int
	}{
		{"no_db_degraded_ok", nil, http.StatusOK},
		{"db_ok", stubPinger{nil}, http.StatusOK},
		{"db_down", stubPinger{errors.New("boom")}, http.StatusServiceUnavailable},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(newTestHandler(tc.db))
			defer srv.Close()
			resp, err := http.Get(srv.URL + "/readyz")
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tc.want {
				t.Fatalf("readyz: got %d, want %d", resp.StatusCode, tc.want)
			}
		})
	}
}

func TestMetrics(t *testing.T) {
	srv := httptest.NewServer(newTestHandler(nil))
	defer srv.Close()
	// drive a request so the counter is non-zero
	_, _ = http.Get(srv.URL + "/healthz")

	resp, err := http.Get(srv.URL + "/metrics")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("metrics: got %d, want 200", resp.StatusCode)
	}
	if len(b) == 0 {
		t.Fatal("metrics: empty body")
	}
}
