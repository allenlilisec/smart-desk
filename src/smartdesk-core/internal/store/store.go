package store

import (
	"time"

	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/domain"
)

// Store is the persistence boundary for smartdesk-core. Both the in-memory
// implementation (*Memory, dev/CI/tests) and the Postgres adapter (*Postgres,
// production) satisfy it, so the HTTP layer is storage-agnostic.
//
// Method semantics are defined once by *Memory; *Postgres mirrors them against
// migrations/0001_init.sql. All methods must be safe for concurrent use.
type Store interface {
	// config / SLA
	Policy() domain.SlaPolicy
	SetPolicy(p domain.SlaPolicy) domain.SlaPolicy
	Categories() []domain.Category
	AddCategory(c domain.Category) domain.Category
	Users(page, pageSize int) ([]domain.User, int)
	AddUser(u domain.User) domain.User
	SetUserRoles(userID string, roles []string) (domain.User, bool)

	// idempotency
	Idempotent(key string) (string, bool)
	RememberIdempotent(key, ticketID string)

	// tickets
	NextNumber(now time.Time) string
	PutTicket(t *domain.Ticket, s *domain.SlaState)
	Ticket(ticketID string) (*domain.Ticket, bool)
	Sla(ticketID string) (*domain.SlaState, bool)
	ListTickets(f TicketFilter) ([]domain.Ticket, int)

	// comments / assignments / timeline
	AddComment(c domain.Comment) domain.Comment
	Comments(ticketID string, includeInternal bool, page, pageSize int) ([]domain.Comment, int)
	AddAssignment(a domain.Assignment) domain.Assignment
	AddTimeline(e domain.TimelineEntry)
	Timeline(ticketID string, page, pageSize int) ([]domain.TimelineEntry, int)
}

// Compile-time assertions that both adapters satisfy Store.
var (
	_ Store = (*Memory)(nil)
	_ Store = (*Postgres)(nil)
)
