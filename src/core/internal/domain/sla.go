package domain

import "time"

// businessDay is the v1 baseline definition of "1bd" used to seed SLA targets
// (system design §8). Admin-configurable via /config/sla-policies.
const businessDayMinutes = 8 * 60

// SlaTarget maps a priority to response/resolve minute budgets (core.yaml).
type SlaTarget struct {
	Priority        Priority `json:"priority"`
	ResponseMinutes int      `json:"response_minutes"`
	ResolveMinutes  int      `json:"resolve_minutes"`
}

// SlaPolicy is the authoritative SLA configuration (core.yaml SlaPolicy).
type SlaPolicy struct {
	ID      string      `json:"id"`
	Name    string      `json:"name"`
	Active  bool        `json:"active"`
	Targets []SlaTarget `json:"targets"`
}

// TargetFor returns the target for a priority, falling back to P3 if unset.
func (p SlaPolicy) TargetFor(pr Priority) SlaTarget {
	for _, t := range p.Targets {
		if t.Priority == pr {
			return t
		}
	}
	return SlaTarget{Priority: pr, ResponseMinutes: 240, ResolveMinutes: 3 * businessDayMinutes}
}

// BaselineSlaPolicy is the seeded v1 policy (core.yaml SlaPolicy description:
// P1 15m/4h; P2 60m/1bd; P3 240m/3bd; P4 1bd/5bd).
func BaselineSlaPolicy(id string) SlaPolicy {
	return SlaPolicy{
		ID:     id,
		Name:   "baseline-v1",
		Active: true,
		Targets: []SlaTarget{
			{P1, 15, 4 * 60},
			{P2, 60, 1 * businessDayMinutes},
			{P3, 240, 3 * businessDayMinutes},
			{P4, 1 * businessDayMinutes, 5 * businessDayMinutes},
		},
	}
}

// SlaTimer is the contract view returned by GET /tickets/{id}/sla.
type SlaTimer struct {
	TicketID           string    `json:"ticket_id"`
	PolicyID           string    `json:"policy_id"`
	Priority           Priority  `json:"priority"`
	ResponseDueAt      time.Time `json:"response_due_at"`
	ResolveDueAt       time.Time `json:"resolve_due_at"`
	ResponseMet        bool      `json:"response_met"`
	ResolveMet         bool      `json:"resolve_met"`
	Paused             bool      `json:"paused"`
	PausedTotalSeconds int       `json:"paused_total_seconds"`
	Breached           bool      `json:"breached"`
}

// SlaState is the persisted timer plus internal bookkeeping for pause/resume.
type SlaState struct {
	TicketID      string
	PolicyID      string
	Priority      Priority
	ResponseDueAt time.Time
	ResolveDueAt  time.Time
	ResponseMet   bool
	ResolveMet    bool
	PausedAt      *time.Time // non-nil while in pending_user
	PausedSeconds int
}

// StartSla initializes timers at create time (§8: 建单按优先级启动计时).
func StartSla(ticketID string, p SlaPolicy, pr Priority, now time.Time) *SlaState {
	t := p.TargetFor(pr)
	return &SlaState{
		TicketID:      ticketID,
		PolicyID:      p.ID,
		Priority:      pr,
		ResponseDueAt: now.Add(time.Duration(t.ResponseMinutes) * time.Minute),
		ResolveDueAt:  now.Add(time.Duration(t.ResolveMinutes) * time.Minute),
	}
}

// Pause stops the clock when entering pending_user.
func (s *SlaState) Pause(now time.Time) {
	if s.PausedAt == nil {
		t := now
		s.PausedAt = &t
	}
}

// Resume restarts the clock, extending due dates by the paused duration so the
// remaining budget is preserved (§8: 暂停、恢复顺延).
func (s *SlaState) Resume(now time.Time) {
	if s.PausedAt == nil {
		return
	}
	d := now.Sub(*s.PausedAt)
	s.PausedSeconds += int(d.Seconds())
	s.ResponseDueAt = s.ResponseDueAt.Add(d)
	s.ResolveDueAt = s.ResolveDueAt.Add(d)
	s.PausedAt = nil
}

// MarkResponded records first agent response (response SLA met).
func (s *SlaState) MarkResponded() { s.ResponseMet = true }

// MarkResolved records resolution (resolve SLA met).
func (s *SlaState) MarkResolved() { s.ResolveMet = true }

// View renders the contract SlaTimer, computing breach at read time.
func (s *SlaState) View(now time.Time) SlaTimer {
	breached := !s.ResolveMet && s.PausedAt == nil && now.After(s.ResolveDueAt)
	return SlaTimer{
		TicketID:           s.TicketID,
		PolicyID:           s.PolicyID,
		Priority:           s.Priority,
		ResponseDueAt:      s.ResponseDueAt,
		ResolveDueAt:       s.ResolveDueAt,
		ResponseMet:        s.ResponseMet,
		ResolveMet:         s.ResolveMet,
		Paused:             s.PausedAt != nil,
		PausedTotalSeconds: s.PausedSeconds,
		Breached:           breached,
	}
}
