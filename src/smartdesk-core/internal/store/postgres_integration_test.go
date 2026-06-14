package store_test

import (
	"os"
	"testing"
	"time"

	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/domain"
	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/id"
	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/store"
)

// Integration test for the Postgres adapter. Skipped unless CORE_TEST_DATABASE_URL
// points at a reachable Postgres (e.g. a docker container in CI), so the default
// `go test ./...` stays hermetic.
func TestPostgresStore(t *testing.T) {
	dsn := os.Getenv("CORE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("CORE_TEST_DATABASE_URL not set; skipping Postgres integration test")
	}
	now := time.Date(2026, 6, 14, 10, 0, 0, 0, time.UTC)
	pg, err := store.OpenPostgres(dsn, now)
	if err != nil {
		t.Fatalf("OpenPostgres: %v", err)
	}
	defer pg.Close()

	// Baseline config seeded.
	if pg.Policy().ID == "" {
		t.Fatal("expected seeded SLA policy")
	}
	if len(pg.Categories()) == 0 {
		t.Fatal("expected seeded categories")
	}
	if users, total := pg.Users(1, 50); total == 0 || len(users) == 0 {
		t.Fatal("expected seeded users")
	}

	// Idempotency round-trip.
	if _, ok := pg.Idempotent("k-" + id.New()); ok {
		t.Fatal("unexpected idempotency hit")
	}

	// Create a ticket with SLA, mirroring the createTicket flow.
	num := pg.NextNumber(now)
	if num == "" {
		t.Fatal("empty ticket number")
	}
	tid := id.New()
	reqID := id.New()
	tk := &domain.Ticket{
		ID: tid, OrgID: "default", Number: num, Title: "VPN 连不上",
		Description: "remote vpn fails", RequesterID: reqID, Priority: domain.P2,
		Status: domain.StatusNew, Source: "web", CreatedAt: now, UpdatedAt: now,
	}
	sla := domain.StartSla(tid, pg.Policy(), domain.P2, now)
	pg.PutTicket(tk, sla)
	idemKey := "idem-" + id.New()
	pg.RememberIdempotent(idemKey, tid)

	if got, ok := pg.Idempotent(idemKey); !ok || got != tid {
		t.Fatalf("idempotent: got %q ok=%v", got, ok)
	}
	got, ok := pg.Ticket(tid)
	if !ok || got.Number != num || got.Priority != domain.P2 || got.RequesterID != reqID {
		t.Fatalf("Ticket round-trip mismatch: %+v ok=%v", got, ok)
	}
	if s, ok := pg.Sla(tid); !ok || s.Priority != domain.P2 {
		t.Fatalf("Sla round-trip: %+v ok=%v", s, ok)
	}

	// Assignment updates the ticket assignee.
	agentID := id.New()
	pg.AddAssignment(domain.Assignment{
		ID: id.New(), TicketID: tid, Kind: "manual", ToUserID: &agentID,
		ActorID: agentID, CreatedAt: now,
	})
	if got, _ := pg.Ticket(tid); got.AssigneeID == nil || *got.AssigneeID != agentID {
		t.Fatalf("assignee not updated: %+v", got)
	}

	// Comments: internal note hidden from requester-only callers.
	pg.AddComment(domain.Comment{ID: id.New(), TicketID: tid, AuthorID: agentID, Body: "public reply", Visibility: "public", CreatedAt: now})
	pg.AddComment(domain.Comment{ID: id.New(), TicketID: tid, AuthorID: agentID, Body: "internal note", Visibility: "internal", CreatedAt: now.Add(time.Second)})
	if _, total := pg.Comments(tid, true, 1, 20); total != 2 {
		t.Fatalf("comments incl internal: got %d want 2", total)
	}
	if pub, total := pg.Comments(tid, false, 1, 20); total != 1 || pub[0].Visibility != "public" {
		t.Fatalf("comments excl internal: got %d", total)
	}

	// Timeline append + read.
	pg.AddTimeline(domain.TimelineEntry{TicketID: tid, EventType: "created", ActorID: &reqID, Payload: map[string]any{"x": 1}, CreatedAt: now})
	if _, total := pg.Timeline(tid, 1, 20); total != 1 {
		t.Fatalf("timeline: got %d want 1", total)
	}

	// Status transition persists.
	tk.Status = domain.StatusAccepted
	tk.UpdatedAt = now.Add(time.Minute)
	pg.PutTicket(tk, nil)
	if got, _ := pg.Ticket(tid); got.Status != domain.StatusAccepted {
		t.Fatalf("status not persisted: %s", got.Status)
	}

	// Filtered list finds it.
	items, total := pg.ListTickets(store.TicketFilter{RequesterID: reqID, Page: 1, PageSize: 10})
	if total < 1 || len(items) < 1 {
		t.Fatalf("ListTickets by requester: total=%d", total)
	}
	if _, none := pg.ListTickets(store.TicketFilter{Status: "closed", RequesterID: reqID, Page: 1, PageSize: 10}); none != 0 {
		t.Fatalf("ListTickets status=closed should be 0, got %d", none)
	}
}
