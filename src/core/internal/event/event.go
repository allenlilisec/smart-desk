// Package event defines the unified domain-event envelope (system design §5.2)
// and a Publisher abstraction. The bus implementation is decoupled from the
// schema: an in-memory publisher backs tests/MVP; a NATS JetStream publisher can
// be added without touching callers. Per §8 the bus is best-effort — publish
// failures must not block the core write path (degradation rule).
package event

import (
	"sync"
	"time"

	"github.com/allenlilisec/smart-desk/src/core/internal/id"
)

// Event is the unified envelope (§5.2). Subject = smartdesk.<domain>.<event>.
type Event struct {
	EventID    string         `json:"event_id"`   // uuidv7, dedupe key
	EventType  string         `json:"event_type"` // e.g. ticket.created
	OccurredAt time.Time      `json:"occurred_at"`
	OrgID      string         `json:"org_id"`
	TicketID   string         `json:"ticket_id"`
	ActorID    *string        `json:"actor_id"`
	Version    int            `json:"version"`
	Payload    map[string]any `json:"payload"`
}

// Publisher publishes domain events. Implementations must be safe for
// concurrent use and must never panic on a closed/unavailable bus.
type Publisher interface {
	Publish(e Event)
	Healthy() bool
}

// New builds an envelope with a fresh event_id and occurred_at.
func New(eventType, orgID, ticketID string, actorID *string, payload map[string]any, now time.Time) Event {
	return Event{
		EventID:    id.NewV7(),
		EventType:  eventType,
		OccurredAt: now,
		OrgID:      orgID,
		TicketID:   ticketID,
		ActorID:    actorID,
		Version:    1,
		Payload:    payload,
	}
}

// InMemory is a Publisher that retains events for inspection (tests, MVP).
type InMemory struct {
	mu     sync.Mutex
	events []Event
}

// NewInMemory returns an empty in-memory publisher.
func NewInMemory() *InMemory { return &InMemory{} }

// Publish appends the event.
func (p *InMemory) Publish(e Event) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.events = append(p.events, e)
}

// Healthy always reports true for the in-memory bus.
func (p *InMemory) Healthy() bool { return true }

// Events returns a snapshot of published events.
func (p *InMemory) Events() []Event {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]Event, len(p.events))
	copy(out, p.events)
	return out
}

// TypesFor returns the event_types published for a given ticket, in order.
func (p *InMemory) TypesFor(ticketID string) []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	var out []string
	for _, e := range p.events {
		if e.TicketID == ticketID {
			out = append(out, e.EventType)
		}
	}
	return out
}
