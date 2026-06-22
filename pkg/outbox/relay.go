// Package outbox provides transactional outbox pattern implementation.
//
// RelayWorker polls pending events from the outbox and publishes them to NATS JetStream.
// It handles retry logic, dead letter migration, and crash recovery.
package outbox

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

// NATSPublisher defines the interface for publishing to NATS JetStream.
// This abstraction allows for mocking in tests.
type NATSPublisher interface {
	// PublishMsg publishes a message to NATS JetStream.
	PublishMsg(msg *nats.Msg, opts ...nats.PubOpt) (*nats.PubAck, error)
}

// RelayConfig holds configuration for the RelayWorker.
type RelayConfig struct {
	// PollInterval is the interval between polling cycles. Default: 1s.
	PollInterval time.Duration
	// BatchSize is the maximum number of events to fetch per poll. Default: 100.
	BatchSize int
	// MaxRetries is the maximum number of retry attempts. Default: 5.
	MaxRetries int
}

// DefaultRelayConfig returns the default relay configuration.
func DefaultRelayConfig() RelayConfig {
	return RelayConfig{
		PollInterval: time.Second,
		BatchSize:    100,
		MaxRetries:   5,
	}
}

// RelayWorker polls outbox_events and publishes to NATS JetStream.
//
// It ensures reliable event delivery with the following features:
//   - FOR UPDATE SKIP LOCKED for concurrent-safe polling
//   - Exponential backoff with jitter for retries
//   - Dead letter migration for events exceeding max retries
//   - Nats-Msg-Id header for NATS-side deduplication
//   - Crash recovery by re-polling unpublished events on restart
//
// The worker implements at-least-once delivery semantics. Downstream consumers
// must implement idempotent handling using event_id.
type RelayWorker struct {
	db          *sql.DB
	jetstream   NATSPublisher
	config      RelayConfig
	logger      *slog.Logger

	// Lifecycle management
	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{}
	mu     sync.RWMutex
	running bool
}

// NewRelayWorker creates a new RelayWorker.
//
// Parameters:
//   - db: PostgreSQL database connection
//   - jetstream: NATS JetStream context for publishing
//   - config: Relay configuration (use DefaultRelayConfig() for defaults)
//   - logger: Structured logger (optional, defaults to slog.Default())
//
// Returns:
//   - *RelayWorker: Configured relay worker instance
func NewRelayWorker(db *sql.DB, jetstream NATSPublisher, config RelayConfig, logger *slog.Logger) *RelayWorker {
	if logger == nil {
		logger = slog.Default()
	}
	return &RelayWorker{
		db:        db,
		jetstream: jetstream,
		config:    config,
		logger:    logger,
		done:      make(chan struct{}),
	}
}

// Start begins the relay worker polling loop.
// This method blocks until Stop() is called or the context is cancelled.
// It should typically be run in a background goroutine.
//
// Example:
//
//	worker := NewRelayWorker(db, js, DefaultRelayConfig(), logger)
//	go worker.Start(ctx)
func (w *RelayWorker) Start(ctx context.Context) error {
	w.mu.Lock()
	if w.running {
		w.mu.Unlock()
		return fmt.Errorf("relay worker already running")
	}
	w.running = true
	w.ctx, w.cancel = context.WithCancel(ctx)
	w.mu.Unlock()

	w.logger.Info("relay worker started",
		slog.Duration("poll_interval", w.config.PollInterval),
		slog.Int("batch_size", w.config.BatchSize),
	)

	// Poll loop
	ticker := time.NewTicker(w.config.PollInterval)
	defer ticker.Stop()

	// Immediate first poll
	w.pollAndProcess(w.ctx)

	for {
		select {
		case <-w.ctx.Done():
			w.logger.Info("relay worker stopping: context cancelled")
			close(w.done)
			return nil
		case <-ticker.C:
			w.pollAndProcess(w.ctx)
		}
	}
}

// Stop gracefully stops the relay worker.
// It waits for the current polling cycle to complete before returning.
func (w *RelayWorker) Stop() error {
	w.mu.Lock()
	if !w.running {
		w.mu.Unlock()
		return nil
	}
	w.mu.Unlock()

	w.logger.Info("relay worker stopping")
	if w.cancel != nil {
		w.cancel()
	}

	// Wait for worker to finish
	select {
	case <-w.done:
		w.logger.Info("relay worker stopped")
	case <-time.After(30 * time.Second):
		return fmt.Errorf("timeout waiting for relay worker to stop")
	}

	w.mu.Lock()
	w.running = false
	w.mu.Unlock()

	return nil
}

// IsRunning returns whether the relay worker is currently running.
func (w *RelayWorker) IsRunning() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.running
}

// pollAndProcess performs one polling cycle: fetch pending events and process them.
func (w *RelayWorker) pollAndProcess(ctx context.Context) {
	events, err := w.pollPendingEvents(ctx)
	if err != nil {
		w.logger.Error("failed to poll pending events",
			slog.String("error", err.Error()),
		)
		return
	}

	if len(events) == 0 {
		return
	}

	w.logger.Debug("processing batch of events",
		slog.Int("count", len(events)),
	)

	for _, event := range events {
		if err := w.processEvent(ctx, &event); err != nil {
			w.logger.Error("failed to process event",
				slog.String("event_id", event.EventID.String()),
				slog.String("error", err.Error()),
			)
		}
	}
}

// pollPendingEvents fetches pending events from the outbox using FOR UPDATE SKIP LOCKED.
//
// This query ensures concurrent-safe polling across multiple relay worker instances:
//   - FOR UPDATE: Locks selected rows
//   - SKIP LOCKED: Skips rows already locked by other transactions
//
// The query selects events with:
//   - status = 'pending'
//   - next_retry_at is NULL OR next_retry_at <= now()
//   - ordered by created_at (FIFO)
func (w *RelayWorker) pollPendingEvents(ctx context.Context) ([]OutboxEvent, error) {
	query := `
		SELECT id, event_id, event_type, topic, payload, headers, created_at,
		       retry_count, max_retries, next_retry_at, published_at, error, status
		FROM outbox_events
		WHERE status = 'pending'
		  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
		ORDER BY created_at ASC
		LIMIT $1
		FOR UPDATE SKIP LOCKED
	`

	rows, err := w.db.QueryContext(ctx, query, w.config.BatchSize)
	if err != nil {
		return nil, fmt.Errorf("failed to query pending events: %w", err)
	}
	defer rows.Close()

	var events []OutboxEvent
	for rows.Next() {
		var event OutboxEvent
		var nextRetryAt, publishedAt sql.NullTime
		var errorMsg sql.NullString

		err := rows.Scan(
			&event.ID,
			&event.EventID,
			&event.EventType,
			&event.Topic,
			&event.Payload,
			&event.Headers,
			&event.CreatedAt,
			&event.RetryCount,
			&event.MaxRetries,
			&nextRetryAt,
			&publishedAt,
			&errorMsg,
			&event.Status,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event row: %w", err)
		}

		if nextRetryAt.Valid {
			event.NextRetryAt = &nextRetryAt.Time
		}
		if publishedAt.Valid {
			event.PublishedAt = &publishedAt.Time
		}
		if errorMsg.Valid {
			event.Error = errorMsg.String
		}

		events = append(events, event)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating event rows: %w", err)
	}

	return events, nil
}

// processEvent processes a single outbox event: publish to NATS and update status.
func (w *RelayWorker) processEvent(ctx context.Context, event *OutboxEvent) error {
	// Publish to NATS
	if err := w.publishToNATS(ctx, event); err != nil {
		// Mark as failed (with retry logic)
		if err := w.markFailed(ctx, event.ID, err); err != nil {
			return fmt.Errorf("failed to mark event as failed: %w", err)
		}
		return fmt.Errorf("failed to publish to NATS: %w", err)
	}

	// Mark as published
	if err := w.markPublished(ctx, event.ID); err != nil {
		return fmt.Errorf("failed to mark event as published: %w", err)
	}

	w.logger.Debug("event published successfully",
		slog.String("event_id", event.EventID.String()),
		slog.String("topic", event.Topic),
	)

	return nil
}

// publishToNATS publishes an event to NATS JetStream with deduplication.
//
// It uses Nats-Msg-Id header for NATS-side deduplication, ensuring that
// duplicate publishes (e.g., after a crash before marking published) are
// handled correctly by NATS.
func (w *RelayWorker) publishToNATS(ctx context.Context, event *OutboxEvent) error {
	// Deserialize headers from JSON
	headers := make(map[string]interface{})
	if len(event.Headers) > 0 {
		if err := json.Unmarshal(event.Headers, &headers); err != nil {
			return fmt.Errorf("failed to unmarshal headers: %w", err)
		}
	}

	// Build DomainEvent envelope
	envelope := DomainEvent{
		EventID:    event.EventID,
		EventType:  event.EventType,
		OccurredAt: event.CreatedAt,
		Version:    1, // Default version
		Payload:    json.RawMessage(event.Payload),
	}

	// Extract optional fields from headers
	if orgID, ok := headers["org_id"].(string); ok {
		envelope.OrgID = orgID
	}
	if ticketIDStr, ok := headers["ticket_id"].(string); ok {
		ticketID, err := uuid.Parse(ticketIDStr)
		if err == nil {
			envelope.TicketID = ticketID
		}
	}
	if actorIDStr, ok := headers["actor_id"].(string); ok {
		actorID, err := uuid.Parse(actorIDStr)
		if err == nil {
			envelope.ActorID = &actorID
		}
	}
	if version, ok := headers["version"].(float64); ok {
		envelope.Version = int(version)
	}

	// Serialize envelope to JSON
	data, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("failed to marshal envelope: %w", err)
	}

	// Create NATS message with deduplication header
	msg := nats.NewMsg(event.Topic)
	msg.Data = data
	msg.Header.Set("Nats-Msg-Id", event.EventID.String())

	// Add custom headers
	for key, value := range headers {
		if strValue, ok := value.(string); ok {
			msg.Header.Set(key, strValue)
		}
	}

	// Publish to JetStream
	ack, err := w.jetstream.PublishMsg(msg, nats.MsgId(event.EventID.String()))
	if err != nil {
		return fmt.Errorf("failed to publish message: %w", err)
	}

	w.logger.Debug("message published to NATS",
		slog.String("event_id", event.EventID.String()),
		slog.String("topic", event.Topic),
		slog.Uint64("stream_seq", ack.Sequence),
	)

	return nil
}

// markPublished marks an event as successfully published.
func (w *RelayWorker) markPublished(ctx context.Context, eventID uuid.UUID) error {
	query := `
		UPDATE outbox_events
		SET status = 'published',
		    published_at = NOW()
		WHERE id = $1
	`

	result, err := w.db.ExecContext(ctx, query, eventID)
	if err != nil {
		return fmt.Errorf("failed to update event status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("event not found: %s", eventID)
	}

	return nil
}

// markFailed updates an event after a failed publish attempt.
// It increments retry_count, sets next_retry_at with exponential backoff,
// and migrates to dead letter if max retries exceeded.
func (w *RelayWorker) markFailed(ctx context.Context, eventID uuid.UUID, publishErr error) error {
	// Get current retry count and max retries
	var retryCount, maxRetries int
	query := `SELECT retry_count, max_retries FROM outbox_events WHERE id = $1`
	if err := w.db.QueryRowContext(ctx, query, eventID).Scan(&retryCount, &maxRetries); err != nil {
		return fmt.Errorf("failed to get event retry info: %w", err)
	}

	newRetryCount := retryCount + 1

	// Check if exceeded max retries
	if newRetryCount >= maxRetries {
		// Migrate to dead letter
		if err := w.migrateToDeadLetter(ctx, eventID, newRetryCount, publishErr); err != nil {
			return fmt.Errorf("failed to migrate to dead letter: %w", err)
		}

		w.logger.Warn("event moved to dead letter after max retries exceeded",
			slog.String("event_id", eventID.String()),
			slog.Int("retry_count", newRetryCount),
			slog.String("error", publishErr.Error()),
		)

		return nil
	}

	// Calculate next retry time with exponential backoff
	nextRetryAt := NextRetryAt(time.Now(), retryCount)

	// Update event with retry info
	updateQuery := `
		UPDATE outbox_events
		SET retry_count = $1,
		    next_retry_at = $2,
		    error = $3
		WHERE id = $4
	`

	_, err := w.db.ExecContext(ctx, updateQuery, newRetryCount, nextRetryAt, publishErr.Error(), eventID)
	if err != nil {
		return fmt.Errorf("failed to update event retry info: %w", err)
	}

	w.logger.Debug("event marked as failed, will retry",
		slog.String("event_id", eventID.String()),
		slog.Int("retry_count", newRetryCount),
		slog.Time("next_retry_at", nextRetryAt),
	)

	return nil
}

// migrateToDeadLetter moves a failed event to the dead letter table.
func (w *RelayWorker) migrateToDeadLetter(ctx context.Context, eventID uuid.UUID, retryCount int, lastErr error) error {
	// Begin transaction
	tx, err := w.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Get event details
	var event OutboxEvent
	query := `
		SELECT id, event_id, event_type, topic, payload, headers, created_at,
		       retry_count, error
		FROM outbox_events
		WHERE id = $1
	`
	var errorMsg sql.NullString
	err = tx.QueryRowContext(ctx, query, eventID).Scan(
		&event.ID,
		&event.EventID,
		&event.EventType,
		&event.Topic,
		&event.Payload,
		&event.Headers,
		&event.CreatedAt,
		&event.RetryCount,
		&errorMsg,
	)
	if err != nil {
		return fmt.Errorf("failed to get event for dead letter migration: %w", err)
	}
	if errorMsg.Valid {
		event.Error = errorMsg.String
	}

	// Insert into dead letter table
	insertQuery := `
		INSERT INTO outbox_dead_letter (
			original_id, event_id, event_type, topic, payload, headers,
			created_at, failed_at, retry_count, last_error
		) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)
	`

	_, err = tx.ExecContext(ctx, insertQuery,
		event.ID,
		event.EventID,
		event.EventType,
		event.Topic,
		event.Payload,
		event.Headers,
		event.CreatedAt,
		retryCount,
		lastErr.Error(),
	)
	if err != nil {
		return fmt.Errorf("failed to insert dead letter record: %w", err)
	}

	// Update original event status to dead_letter
	updateQuery := `
		UPDATE outbox_events
		SET status = 'dead_letter',
		    error = $1
		WHERE id = $2
	`

	_, err = tx.ExecContext(ctx, updateQuery, lastErr.Error(), eventID)
	if err != nil {
		return fmt.Errorf("failed to update event status to dead_letter: %w", err)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit dead letter migration: %w", err)
	}

	return nil
}
