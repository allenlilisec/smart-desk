// Package outbox provides transactional outbox pattern implementation.
//
// The outbox pattern ensures event publishing is reliable by:
// 1. Writing events to an outbox table within the same transaction as business logic
// 2. A relay worker polls the outbox and publishes to NATS
// 3. Failed events are retried with exponential backoff
// 4. Events exceeding max retries are moved to dead letter queue
package outbox

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// DomainEvent represents a domain event to be published.
// This matches the schema defined in insight.yaml.
type DomainEvent struct {
	EventID   uuid.UUID   `json:"event_id"`
	EventType string      `json:"event_type"`
	OccurredAt time.Time  `json:"occurred_at"`
	OrgID     string      `json:"org_id"`
	TicketID  uuid.UUID   `json:"ticket_id"`
	ActorID   *uuid.UUID  `json:"actor_id,omitempty"`
	Version   int         `json:"version"`
	Payload   interface{} `json:"payload"`
}

// Topic returns the NATS topic for this event.
// Format: smartdesk.<event_type> (e.g., smartdesk.ticket.created)
func (e *DomainEvent) Topic() string {
	return "smartdesk." + e.EventType
}

// MarshalPayload serializes the payload to JSON.
func (e *DomainEvent) MarshalPayload() ([]byte, error) {
	return json.Marshal(e.Payload)
}

// OutboxEvent represents a persisted outbox event record.
type OutboxEvent struct {
	ID           uuid.UUID       `db:"id"`
	EventID      uuid.UUID       `db:"event_id"`
	EventType    string          `db:"event_type"`
	Topic        string          `db:"topic"`
	Payload      json.RawMessage `db:"payload"`
	Headers      json.RawMessage `db:"headers"`
	CreatedAt    time.Time       `db:"created_at"`
	RetryCount   int             `db:"retry_count"`
	MaxRetries   int             `db:"max_retries"`
	NextRetryAt  *time.Time      `db:"next_retry_at"`
	PublishedAt  *time.Time      `db:"published_at"`
	Error        string          `db:"error"`
	Status       string          `db:"status"`
}

// OutboxWriter defines the interface for writing events to the outbox.
// Implementations must ensure the write occurs within the provided transaction.
type OutboxWriter interface {
	// WriteEvent writes an event to the outbox within the given transaction.
	// The event will only be persisted if the transaction commits successfully.
	// If the transaction rolls back, the event write is also rolled back.
	WriteEvent(ctx context.Context, tx *sql.Tx, event *DomainEvent) error
}

// SQLWriter implements OutboxWriter using PostgreSQL.
type SQLWriter struct {
	// No fields needed - uses the provided transaction
}

// NewSQLWriter creates a new SQLWriter.
func NewSQLWriter() *SQLWriter {
	return &SQLWriter{}
}

// WriteEvent implements OutboxWriter.
// Writes the event to outbox_events table within the provided transaction.
func (w *SQLWriter) WriteEvent(ctx context.Context, tx *sql.Tx, event *DomainEvent) error {
	payload, err := event.MarshalPayload()
	if err != nil {
		return err
	}

	headers := map[string]interface{}{}
	headers["org_id"] = event.OrgID
	headers["ticket_id"] = event.TicketID.String()
	if event.ActorID != nil {
		headers["actor_id"] = event.ActorID.String()
	}
	headers["version"] = event.Version

	headersJSON, err := json.Marshal(headers)
	if err != nil {
		return err
	}

	query := `
		INSERT INTO outbox_events (
			event_id, event_type, topic, payload, headers,
			created_at, retry_count, max_retries, status
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
	`

	_, err = tx.ExecContext(ctx, query,
		event.EventID,
		event.EventType,
		event.Topic(),
		payload,
		headersJSON,
		event.OccurredAt,
		0,     // retry_count
		5,     // max_retries
	)

	return err
}

// EventStatus represents the status of an outbox event.
type EventStatus string

const (
	StatusPending    EventStatus = "pending"
	StatusPublished  EventStatus = "published"
	StatusFailed     EventStatus = "failed"
	StatusDeadLetter EventStatus = "dead_letter"
)

// IsValid checks if the status is valid.
func (s EventStatus) IsValid() bool {
	switch s {
	case StatusPending, StatusPublished, StatusFailed, StatusDeadLetter:
		return true
	}
	return false
}
