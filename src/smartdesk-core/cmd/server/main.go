// Command server is the smartdesk-core entrypoint.
//
// Boot sequence: load config -> logger -> (optional) DB connect + migrate ->
// HTTP server with /healthz /readyz /metrics -> serve until SIGINT/SIGTERM,
// then graceful shutdown.
package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/config"
	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/db"
	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/events"
	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/httpapi"
	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/logging"
	"github.com/allenlilisec/smart-desk/smartdesk-core/migrations"
)

// version is overridable at build time: -ldflags "-X main.version=..."
var version = "dev"

func main() {
	if err := run(); err != nil {
		// run() already logged via slog; this is the last-resort exit.
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log := logging.New(cfg.LogLevel)
	log.Info("starting smartdesk-core",
		"version", version, "env", cfg.Env, "addr", cfg.HTTPAddr)

	// DB is optional in dev: with no DSN the service still boots and readiness
	// reports the database as disabled (degraded), so local/CI runs need no PG.
	var database *db.DB
	if cfg.DatabaseURL != "" {
		database, err = db.Open(cfg.DatabaseURL)
		if err != nil {
			log.Error("db open failed", "err", err)
			return err
		}
		defer func() { _ = database.Close() }()

		mctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		applied, mErr := database.Migrate(mctx, migrations.FS, migrations.Dir)
		cancel()
		if mErr != nil {
			log.Error("migrations failed", "err", mErr)
			return mErr
		}
		log.Info("migrations applied", "count", len(applied), "files", applied)
	} else {
		log.Warn("CORE_DATABASE_URL not set; running without DB (readiness degraded)")
	}

	// Event publisher: log-only until the bus is wired (CORE-0 contract).
	publisher := events.NewLogPublisher(log)
	_ = publisher // consumed by domain handlers (CORE-A/B) as they land

	var readyDep httpapi.Pinger
	if database != nil {
		readyDep = database
	}
	handler := httpapi.New(log, readyDep, version)

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("http server listening", "addr", cfg.HTTPAddr)
		if e := srv.ListenAndServe(); e != nil && !errors.Is(e, http.ErrServerClosed) {
			errCh <- e
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	select {
	case e := <-errCh:
		log.Error("http server error", "err", e)
		return e
	case <-ctx.Done():
		log.Info("shutdown signal received")
	}

	shutCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if e := srv.Shutdown(shutCtx); e != nil {
		log.Error("graceful shutdown failed", "err", e)
		return e
	}
	log.Info("shutdown complete")
	return nil
}
