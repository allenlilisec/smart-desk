// Package domain holds the smartdesk-core domain model and pure business rules
// (state machine, SLA). It has no I/O dependencies so it is trivially testable.
//
// Shapes mirror openapi/core.yaml; field names are the wire contract.
package domain

import (
	"errors"
	"time"
)

// TicketStatus is the八态 lifecycle (core.yaml TicketStatus).
type TicketStatus string

const (
	StatusNew         TicketStatus = "new"
	StatusAccepted    TicketStatus = "accepted"
	StatusInProgress  TicketStatus = "in_progress"
	StatusPendingUser TicketStatus = "pending_user"
	StatusResolved    TicketStatus = "resolved"
	StatusClosed      TicketStatus = "closed"
	StatusSuspended   TicketStatus = "suspended"
	StatusCancelled   TicketStatus = "cancelled"
)

// Terminal reports whether the status is a终态 (closed/cancelled, OQ-8).
func (s TicketStatus) Terminal() bool {
	return s == StatusClosed || s == StatusCancelled
}

// Priority levels (core.yaml Priority).
type Priority string

const (
	P1 Priority = "P1"
	P2 Priority = "P2"
	P3 Priority = "P3"
	P4 Priority = "P4"
)

// Valid reports whether p is a known priority.
func (p Priority) Valid() bool {
	switch p {
	case P1, P2, P3, P4:
		return true
	}
	return false
}

// ReopenWindow is the window after closing during which a requester may reopen
// (OQ-13: 7 days).
const ReopenWindow = 7 * 24 * time.Hour

// Domain-level sentinel errors mapped to HTTP status by the api layer.
var (
	ErrNotFound          = errors.New("not found")
	ErrIllegalTransition = errors.New("illegal transition")
	ErrUnprocessable     = errors.New("unprocessable")
	ErrForbidden         = errors.New("forbidden")
)

// Ticket is the authoritative工单 record (core.yaml Ticket).
type Ticket struct {
	ID          string       `json:"id"`
	OrgID       string       `json:"org_id"`
	Number      string       `json:"number"`
	Title       string       `json:"title"`
	Description string       `json:"description,omitempty"`
	RequesterID string       `json:"requester_id,omitempty"`
	AssigneeID  *string      `json:"assignee_id"`
	GroupID     *string      `json:"group_id"`
	CategoryID  *string      `json:"category_id"`
	Priority    Priority     `json:"priority"`
	Status      TicketStatus `json:"status"`
	Source      string       `json:"source"`
	ReopenCount int          `json:"reopen_count"`
	CsatScore   *int         `json:"csat_score"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`

	// ClosedAt is internal bookkeeping for the reopen window; not serialized.
	ClosedAt *time.Time `json:"-"`
}

// Comment is a public reply or internal note (core.yaml Comment).
type Comment struct {
	ID         string    `json:"id"`
	TicketID   string    `json:"ticket_id"`
	AuthorID   string    `json:"author_id"`
	Body       string    `json:"body"`
	Visibility string    `json:"visibility"` // public | internal
	Mentions   []string  `json:"mentions,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// Assignment records a分派/改派/转派/升级 (core.yaml Assignment).
type Assignment struct {
	ID        string    `json:"id"`
	TicketID  string    `json:"ticket_id"`
	Kind      string    `json:"kind"` // manual | auto | reassign | escalate
	ToUserID  *string   `json:"to_user_id"`
	ToGroupID *string   `json:"to_group_id"`
	Reason    string    `json:"reason,omitempty"`
	ActorID   string    `json:"actor_id"`
	CreatedAt time.Time `json:"created_at"`
}

// TimelineEntry is an append-only audit record (core.yaml TimelineEntry, §3).
type TimelineEntry struct {
	ID        string         `json:"id"`
	TicketID  string         `json:"ticket_id"`
	EventType string         `json:"event_type"`
	ActorID   *string        `json:"actor_id"`
	Payload   map[string]any `json:"payload"`
	CreatedAt time.Time      `json:"created_at"`
}

// Category is a taxonomy node (core.yaml Category).
type Category struct {
	ID       string  `json:"id"`
	ParentID *string `json:"parent_id"`
	Code     string  `json:"code,omitempty"`
	Name     string  `json:"name"`
	Active   bool    `json:"active"`
	Sort     int     `json:"sort"`
}

// User is RBAC master data (core.yaml User).
type User struct {
	ID          string   `json:"id"`
	Username    string   `json:"username"`
	Email       string   `json:"email,omitempty"`
	DisplayName string   `json:"display_name"`
	Status      string   `json:"status"` // active | disabled
	Roles       []string `json:"roles"`
}
