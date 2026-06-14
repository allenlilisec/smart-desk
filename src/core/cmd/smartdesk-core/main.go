// Command smartdesk-core is the工单核心服务 HTTP entrypoint.
//
// It is internal-only (§6): in production it sits behind gateway and is not
// reachable from the browser. The MVP boots an in-memory store seeded with
// baseline taxonomy/SLA/users so the提单→处理→关闭 closed loop runs end-to-end.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/allenlilisec/smart-desk/src/core/internal/config"
	"github.com/allenlilisec/smart-desk/src/core/internal/event"
	"github.com/allenlilisec/smart-desk/src/core/internal/httpapi"
	"github.com/allenlilisec/smart-desk/src/core/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg := config.Load()

	now := time.Now
	st := store.New(now())
	pub := event.NewInMemory()
	srv := httpapi.New(st, pub, cfg.OrgID, now)

	httpSrv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		logger.Info("smartdesk-core listening", "addr", cfg.Addr, "org", cfg.OrgID)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(ctx); err != nil {
		logger.Error("graceful shutdown failed", "err", err)
	}
	logger.Info("smartdesk-core stopped")
}
