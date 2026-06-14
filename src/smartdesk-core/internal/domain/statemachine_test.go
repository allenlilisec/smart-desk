package domain

import (
	"errors"
	"testing"
)

func TestTransition_HappyPath(t *testing.T) {
	steps := []struct {
		a    Action
		from TicketStatus
		to   TicketStatus
	}{
		{ActionAccept, StatusNew, StatusAccepted},
		{ActionStart, StatusAccepted, StatusInProgress},
		{ActionWaitUser, StatusInProgress, StatusPendingUser},
		{ActionStart, StatusPendingUser, StatusInProgress},
		{ActionResolve, StatusInProgress, StatusResolved},
		{ActionClose, StatusResolved, StatusClosed},
	}
	for _, s := range steps {
		got, idem, err := Transition(s.from, s.a)
		if err != nil {
			t.Fatalf("%s from %s: unexpected err %v", s.a, s.from, err)
		}
		if idem {
			t.Fatalf("%s from %s: unexpected idempotent", s.a, s.from)
		}
		if got != s.to {
			t.Fatalf("%s from %s: got %s want %s", s.a, s.from, got, s.to)
		}
	}
}

func TestTransition_Illegal(t *testing.T) {
	// Cannot close a brand-new ticket.
	if _, _, err := Transition(StatusNew, ActionClose); !errors.Is(err, ErrIllegalTransition) {
		t.Fatalf("expected illegal transition, got %v", err)
	}
	// Cannot resolve while pending_user (must start first).
	if _, _, err := Transition(StatusPendingUser, ActionResolve); !errors.Is(err, ErrIllegalTransition) {
		t.Fatalf("expected illegal transition, got %v", err)
	}
}

func TestTransition_IdempotentRepeat(t *testing.T) {
	// Accepting an already-accepted ticket is a no-op, not an error.
	got, idem, err := Transition(StatusAccepted, ActionAccept)
	if err != nil {
		t.Fatalf("unexpected err %v", err)
	}
	if !idem {
		t.Fatalf("expected idempotent no-op")
	}
	if got != StatusAccepted {
		t.Fatalf("got %s want accepted", got)
	}
}

func TestUserReplyIsNotClientAction(t *testing.T) {
	if IsClientAction(ActionUserReply) {
		t.Fatal("user_reply must be system-only, not a client action")
	}
	if !IsClientAction(ActionAccept) {
		t.Fatal("accept must be a client action")
	}
}

func TestCancelFromManyStates(t *testing.T) {
	for _, from := range []TicketStatus{StatusNew, StatusAccepted, StatusInProgress, StatusPendingUser, StatusSuspended} {
		if got, _, err := Transition(from, ActionCancel); err != nil || got != StatusCancelled {
			t.Fatalf("cancel from %s: got %s err %v", from, got, err)
		}
	}
	// Cannot cancel a resolved ticket.
	if _, _, err := Transition(StatusResolved, ActionCancel); !errors.Is(err, ErrIllegalTransition) {
		t.Fatalf("expected cancel from resolved to be illegal, got %v", err)
	}
}
