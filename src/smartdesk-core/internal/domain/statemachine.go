package domain

import "fmt"

// Action is a state-machine trigger (core.yaml TransitionRequest.action plus the
// system-only user_reply auto-transition described in US-2.2 AC2).
type Action string

const (
	ActionAccept    Action = "accept"
	ActionStart     Action = "start"
	ActionWaitUser  Action = "wait_user"
	ActionResolve   Action = "resolve"
	ActionClose     Action = "close"
	ActionReopen    Action = "reopen"
	ActionSuspend   Action = "suspend"
	ActionResume    Action = "resume"
	ActionCancel    Action = "cancel"
	ActionUserReply Action = "user_reply" // system auto: pending_user -> in_progress
)

type rule struct {
	from []TicketStatus
	to   TicketStatus
}

// transitions is the explicit action→from→to mapping from core.yaml §transitions.
// 梁栋's ruling: resume is单一化 (suspended→in_progress only); the
// pending_user→in_progress path is either system auto (user_reply) or agent
// manual (start) — resume is never reused for it.
var transitions = map[Action]rule{
	ActionAccept:    {from: []TicketStatus{StatusNew}, to: StatusAccepted},
	ActionStart:     {from: []TicketStatus{StatusAccepted, StatusPendingUser}, to: StatusInProgress},
	ActionWaitUser:  {from: []TicketStatus{StatusInProgress}, to: StatusPendingUser},
	ActionUserReply: {from: []TicketStatus{StatusPendingUser}, to: StatusInProgress},
	ActionResolve:   {from: []TicketStatus{StatusInProgress}, to: StatusResolved},
	ActionClose:     {from: []TicketStatus{StatusResolved}, to: StatusClosed},
	ActionReopen:    {from: []TicketStatus{StatusClosed}, to: StatusInProgress},
	ActionSuspend:   {from: []TicketStatus{StatusInProgress}, to: StatusSuspended},
	ActionResume:    {from: []TicketStatus{StatusSuspended}, to: StatusInProgress},
	ActionCancel: {from: []TicketStatus{
		StatusNew, StatusAccepted, StatusInProgress, StatusPendingUser, StatusSuspended,
	}, to: StatusCancelled},
}

// IsClientAction reports whether a may be sent via POST /transitions. user_reply
// is system-only and must be rejected at the API boundary.
func IsClientAction(a Action) bool {
	switch a {
	case ActionAccept, ActionStart, ActionWaitUser, ActionResolve, ActionClose,
		ActionReopen, ActionSuspend, ActionResume, ActionCancel:
		return true
	}
	return false
}

// Transition resolves the next status for (cur, action).
//
//   - legal edge          → (to, idempotent=false, nil)
//   - already in target   → (cur, idempotent=true, nil)  // repeat target = no-op (core.yaml 幂等)
//   - anything else       → (cur, false, ErrIllegalTransition)
func Transition(cur TicketStatus, a Action) (next TicketStatus, idempotent bool, err error) {
	r, ok := transitions[a]
	if !ok {
		return cur, false, fmt.Errorf("%w: unknown action %q", ErrIllegalTransition, a)
	}
	for _, f := range r.from {
		if cur == f {
			return r.to, false, nil
		}
	}
	if cur == r.to {
		return cur, true, nil
	}
	return cur, false, fmt.Errorf("%w: cannot %q from %q", ErrIllegalTransition, a, cur)
}

// statusChangeEvent maps an action to its domain event_type (§5.2 event table).
// Empty string means "no dedicated event beyond the generic status_changed".
func StatusEventType(a Action) string {
	switch a {
	case ActionResolve:
		return "ticket.resolved"
	case ActionClose:
		return "ticket.closed"
	case ActionReopen:
		return "ticket.reopened"
	default:
		return "ticket.status_changed"
	}
}
