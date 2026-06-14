// Package store is the persistence boundary for smartdesk-core.
//
// The MVP ships an in-memory implementation so the full state-machine closed
// loop runs and is tested without a live database; migrations/0001_init.sql is
// the authoritative Postgres schema the production adapter will target. All
// methods are safe for concurrent use.
package store

import (
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/allenlilisec/smart-desk/src/core/internal/domain"
	"github.com/allenlilisec/smart-desk/src/core/internal/id"
)

// Memory is the in-memory authoritative store.
type Memory struct {
	mu sync.RWMutex

	tickets     map[string]*domain.Ticket
	comments    map[string][]domain.Comment       // ticketID -> comments
	assignments map[string][]domain.Assignment    // ticketID -> assignments
	timeline    map[string][]domain.TimelineEntry // ticketID -> entries
	sla         map[string]*domain.SlaState       // ticketID -> sla
	idem        map[string]string                 // idempotency-key -> ticketID
	categories  []domain.Category
	policy      domain.SlaPolicy
	users       map[string]*domain.User

	seq  int
	year int
}

// TicketFilter narrows GET /tickets.
type TicketFilter struct {
	Status      string
	Priority    string
	AssigneeID  string
	RequesterID string
	GroupID     string
	CategoryID  string
	Query       string
	Sort        string
	Page        int
	PageSize    int
}

// New returns a store seeded with baseline taxonomy, SLA policy, and users
// (CORE-C config seeds).
func New(now time.Time) *Memory {
	m := &Memory{
		tickets:     map[string]*domain.Ticket{},
		comments:    map[string][]domain.Comment{},
		assignments: map[string][]domain.Assignment{},
		timeline:    map[string][]domain.TimelineEntry{},
		sla:         map[string]*domain.SlaState{},
		idem:        map[string]string{},
		users:       map[string]*domain.User{},
		year:        now.Year(),
	}
	m.seed()
	return m
}

func (m *Memory) seed() {
	m.policy = domain.BaselineSlaPolicy(id.New())

	// Minimal taxonomy tree (OQ-4): two roots, one child.
	itTech := domain.Category{ID: id.New(), Code: "it", Name: "IT支持", Active: true, Sort: 1}
	account := domain.Category{ID: id.New(), Code: "account", Name: "账号与权限", Active: true, Sort: 2}
	vpn := domain.Category{ID: id.New(), ParentID: &itTech.ID, Code: "it.vpn", Name: "VPN/网络", Active: true, Sort: 1}
	m.categories = []domain.Category{itTech, account, vpn}

	// Role directory seed (US-7.3 AC3).
	for _, u := range []domain.User{
		{Username: "alice", DisplayName: "Alice（坐席）", Status: "active", Roles: []string{"agent"}},
		{Username: "lead", DisplayName: "Lead（组长）", Status: "active", Roles: []string{"agent", "lead"}},
		{Username: "bob", DisplayName: "Bob（报单人）", Status: "active", Roles: []string{"requester"}},
		{Username: "admin", DisplayName: "Admin", Status: "active", Roles: []string{"admin", "manager"}},
	} {
		u.ID = id.New()
		cp := u
		m.users[cp.ID] = &cp
	}
}

// --- SLA policy / config reads ---

// Policy returns the active SLA policy.
func (m *Memory) Policy() domain.SlaPolicy {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.policy
}

// SetPolicy replaces the SLA policy (admin PUT /config/sla-policies).
func (m *Memory) SetPolicy(p domain.SlaPolicy) domain.SlaPolicy {
	m.mu.Lock()
	defer m.mu.Unlock()
	if p.ID == "" {
		p.ID = m.policy.ID
	}
	m.policy = p
	return m.policy
}

// Categories returns the taxonomy tree.
func (m *Memory) Categories() []domain.Category {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]domain.Category, len(m.categories))
	copy(out, m.categories)
	return out
}

// AddCategory appends a taxonomy node.
func (m *Memory) AddCategory(c domain.Category) domain.Category {
	m.mu.Lock()
	defer m.mu.Unlock()
	c.ID = id.New()
	c.Active = true
	m.categories = append(m.categories, c)
	return c
}

// Users returns a page of the user directory.
func (m *Memory) Users(page, pageSize int) ([]domain.User, int) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	all := make([]domain.User, 0, len(m.users))
	for _, u := range m.users {
		all = append(all, *u)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].Username < all[j].Username })
	total := len(all)
	return paginate(all, page, pageSize), total
}

// AddUser creates a user (admin POST /config/users).
func (m *Memory) AddUser(u domain.User) domain.User {
	m.mu.Lock()
	defer m.mu.Unlock()
	u.ID = id.New()
	if u.Status == "" {
		u.Status = "active"
	}
	cp := u
	m.users[cp.ID] = &cp
	return cp
}

// SetUserRoles replaces a user's roles (admin PUT /config/users/{id}/roles).
func (m *Memory) SetUserRoles(userID string, roles []string) (domain.User, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[userID]
	if !ok {
		return domain.User{}, false
	}
	u.Roles = roles
	return *u, true
}

// --- ticket writes ---

// Idempotent returns the ticketID previously created for key, if any.
func (m *Memory) Idempotent(key string) (string, bool) {
	if key == "" {
		return "", false
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	tid, ok := m.idem[key]
	return tid, ok
}

// RememberIdempotent records key -> ticketID.
func (m *Memory) RememberIdempotent(key, ticketID string) {
	if key == "" {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.idem[key] = ticketID
}

// PutTicket inserts/updates a ticket and its SLA state atomically.
func (m *Memory) PutTicket(t *domain.Ticket, s *domain.SlaState) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tickets[t.ID] = t
	if s != nil {
		m.sla[t.ID] = s
	}
}

// NextNumber issues a工单号 like SD-2026-000123.
func (m *Memory) NextNumber(now time.Time) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	if now.Year() != m.year {
		m.year = now.Year()
		m.seq = 0
	}
	m.seq++
	return formatNumber(m.year, m.seq)
}

// Ticket fetches a ticket by id.
func (m *Memory) Ticket(ticketID string) (*domain.Ticket, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.tickets[ticketID]
	return t, ok
}

// Sla fetches the SLA state for a ticket.
func (m *Memory) Sla(ticketID string) (*domain.SlaState, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sla[ticketID]
	return s, ok
}

// ListTickets applies a filter and returns a page plus the total match count.
func (m *Memory) ListTickets(f TicketFilter) ([]domain.Ticket, int) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var out []domain.Ticket
	for _, t := range m.tickets {
		if f.Status != "" && string(t.Status) != f.Status {
			continue
		}
		if f.Priority != "" && string(t.Priority) != f.Priority {
			continue
		}
		if f.AssigneeID != "" && (t.AssigneeID == nil || *t.AssigneeID != f.AssigneeID) {
			continue
		}
		if f.RequesterID != "" && t.RequesterID != f.RequesterID {
			continue
		}
		if f.GroupID != "" && (t.GroupID == nil || *t.GroupID != f.GroupID) {
			continue
		}
		if f.CategoryID != "" && (t.CategoryID == nil || *t.CategoryID != f.CategoryID) {
			continue
		}
		if f.Query != "" {
			q := strings.ToLower(f.Query)
			if !strings.Contains(strings.ToLower(t.Title), q) &&
				!strings.Contains(strings.ToLower(t.Description), q) {
				continue
			}
		}
		out = append(out, *t)
	}

	// Default sort: -created_at (newest first); "created_at" ascending.
	asc := f.Sort == "created_at"
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt.Equal(out[j].CreatedAt) {
			if asc {
				return out[i].Number < out[j].Number
			}
			return out[i].Number > out[j].Number
		}
		if asc {
			return out[i].CreatedAt.Before(out[j].CreatedAt)
		}
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})

	total := len(out)
	return paginate(out, f.Page, f.PageSize), total
}

// --- comments / assignments / timeline ---

// AddComment appends a comment.
func (m *Memory) AddComment(c domain.Comment) domain.Comment {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.comments[c.TicketID] = append(m.comments[c.TicketID], c)
	return c
}

// Comments returns a page of comments, optionally hiding internal notes for
// requester-only callers (US-2.4 AC2).
func (m *Memory) Comments(ticketID string, includeInternal bool, page, pageSize int) ([]domain.Comment, int) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var visible []domain.Comment
	for _, c := range m.comments[ticketID] {
		if c.Visibility == "internal" && !includeInternal {
			continue
		}
		visible = append(visible, c)
	}
	total := len(visible)
	return paginate(visible, page, pageSize), total
}

// AddAssignment appends an assignment and updates the ticket's assignee/group.
func (m *Memory) AddAssignment(a domain.Assignment) domain.Assignment {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.assignments[a.TicketID] = append(m.assignments[a.TicketID], a)
	if t, ok := m.tickets[a.TicketID]; ok {
		if a.ToUserID != nil {
			t.AssigneeID = a.ToUserID
		}
		if a.ToGroupID != nil {
			t.GroupID = a.ToGroupID
		}
		t.UpdatedAt = a.CreatedAt
	}
	return a
}

// AddTimeline appends an append-only audit entry (§3, US-2.8).
func (m *Memory) AddTimeline(e domain.TimelineEntry) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.timeline[e.TicketID] = append(m.timeline[e.TicketID], e)
}

// Timeline returns a page of timeline entries in ascending order (正序).
func (m *Memory) Timeline(ticketID string, page, pageSize int) ([]domain.TimelineEntry, int) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	entries := m.timeline[ticketID]
	total := len(entries)
	cp := make([]domain.TimelineEntry, total)
	copy(cp, entries)
	return paginate(cp, page, pageSize), total
}

func paginate[T any](items []T, page, pageSize int) []T {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	start := (page - 1) * pageSize
	if start >= len(items) {
		return []T{}
	}
	end := start + pageSize
	if end > len(items) {
		end = len(items)
	}
	return items[start:end]
}
