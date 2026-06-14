// Package events defines the domain-event publishing client for smartdesk-core.
//
// core is the authoritative source of ticket events (ticket.created,
// ticket.status_changed, ticket.assigned, comment.added, ...). The concrete
// transport (e.g. an event bus / outbox) is wired later; CORE-0 ships the
// interface plus a log-only publisher so the rest of the service can depend on
// the contract today and CI/local dev need no external bus.
//
// Event payload shapes are frozen in specs/SmartDesk系统架构设计说明书.md §5.
package events

import (
	"context"
	"log/slog"
	"time"
)

// Event is a domain event emitted by core. ID/OccurredAt are stamped by the
// publisher if left zero so callers stay terse.
type Event struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"` // e.g. "ticket.created"
	OccurredAt time.Time      `json:"occurred_at"`
	TicketID   string         `json:"ticket_id,omitempty"`
	ActorID    string         `json:"actor_id,omitempty"`
	Payload    map[string]any `json:"payload,omitempty"`
}

// Publisher publishes domain events. Implementations must be safe for
// concurrent use.
type Publisher interface {
	Publish(ctx context.Context, e Event) error
}

// LogPublisher is the default publisher: it records events to the structured
// logger instead of a bus. Useful for local dev, tests, and CI.
type LogPublisher struct {
	log *slog.Logger
}

// NewLogPublisher returns a Publisher that logs events.
func NewLogPublisher(log *slog.Logger) *LogPublisher {
	return &LogPublisher{log: log}
}

// Publish records the event to the log.
func (p *LogPublisher) Publish(_ context.Context, e Event) error {
	p.log.Info("domain_event",
		slog.String("event_type", e.Type),
		slog.String("ticket_id", e.TicketID),
		slog.String("actor_id", e.ActorID),
	)
	return nil
}
