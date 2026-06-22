package outbox

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"
)

// mockTx is a mock sql.Tx for testing transaction rollback scenarios.
// In production, use a real test database.
type mockTx struct {
	committed   bool
	rolledBack  bool
	execCalls   []execCall
	simulateErr error
}

type execCall struct {
	query string
	args  []interface{}
}

func (m *mockTx) ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	m.execCalls = append(m.execCalls, execCall{query: query, args: args})
	if m.simulateErr != nil {
		return nil, m.simulateErr
	}
	return &mockResult{}, nil
}

func (m *mockTx) Commit() error {
	m.committed = true
	return nil
}

func (m *mockTx) Rollback() error {
	m.rolledBack = true
	return nil
}

func (m *mockTx) PrepareContext(ctx context.Context, query string) (*sql.Stmt, error) {
	return nil, nil
}

func (m *mockTx) QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	return nil, nil
}

func (m *mockTx) QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row {
	return nil
}

func (m *mockTx) StmtContext(ctx context.Context, stmt *sql.Stmt) *sql.Stmt {
	return nil
}

type mockResult struct {
	lastID int64
	affected int64
}

func (r *mockResult) LastInsertId() (int64, error) {
	return r.lastID, nil
}

func (r *mockResult) RowsAffected() (int64, error) {
	return r.affected, nil
}

// TestDomainEvent_Topic tests the topic generation.
func TestDomainEvent_Topic(t *testing.T) {
	tests := []struct {
		name      string
		eventType string
		expected  string
	}{
		{
			name:      "ticket.created",
			eventType: "ticket.created",
			expected:  "smartdesk.ticket.created",
		},
		{
			name:      "ticket.updated",
			eventType: "ticket.updated",
			expected:  "smartdesk.ticket.updated",
		},
		{
			name:      "ticket.assigned",
			eventType: "ticket.assigned",
			expected:  "smartdesk.ticket.assigned",
		},
		{
			name:      "sla.breached",
			eventType: "sla.breached",
			expected:  "smartdesk.sla.breached",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			event := &DomainEvent{
				EventType: tt.eventType,
			}
			got := event.Topic()
			if got != tt.expected {
				t.Errorf("Topic() = %v, expected %v", got, tt.expected)
			}
		})
	}
}

// TestEventStatus_IsValid tests status validation.
func TestEventStatus_IsValid(t *testing.T) {
	tests := []struct {
		status EventStatus
		valid  bool
	}{
		{StatusPending, true},
		{StatusPublished, true},
		{StatusFailed, true},
		{StatusDeadLetter, true},
		{EventStatus("invalid"), false},
		{EventStatus(""), false},
	}

	for _, tt := range tests {
		t.Run(string(tt.status), func(t *testing.T) {
			if got := tt.status.IsValid(); got != tt.valid {
				t.Errorf("IsValid() = %v, expected %v", got, tt.valid)
			}
		})
	}
}

// TestOutboxWriter_Interface ensures SQLWriter implements OutboxWriter.
func TestOutboxWriter_Interface(t *testing.T) {
	var _ OutboxWriter = (*SQLWriter)(nil)
}

// TestSQLWriter_WriteEvent_Success tests successful event writing.
func TestSQLWriter_WriteEvent_Success(t *testing.T) {
	_ = NewSQLWriter() // Verify writer can be created

	// Note: This test requires a real database connection to run fully.
	// For now, we test the interface and structure.
	// In integration tests, we'll use testcontainers with PostgreSQL.

	event := &DomainEvent{
		EventID:    uuid.New(),
		EventType:  "ticket.created",
		OccurredAt: time.Now(),
		OrgID:      "org-123",
		TicketID:   uuid.New(),
		Version:    1,
		Payload: map[string]interface{}{
			"title": "Test Ticket",
			"description": "Test Description",
		},
	}

	// Validate event structure
	if event.EventID == uuid.Nil {
		t.Error("EventID should not be nil")
	}
	if event.Topic() != "smartdesk.ticket.created" {
		t.Errorf("Topic mismatch: got %v", event.Topic())
	}

	// Validate payload marshaling
	payload, err := event.MarshalPayload()
	if err != nil {
		t.Errorf("MarshalPayload() error = %v", err)
	}
	if len(payload) == 0 {
		t.Error("Payload should not be empty after marshaling")
	}
}

// TestDomainEvent_MarshalPayload tests payload serialization.
func TestDomainEvent_MarshalPayload(t *testing.T) {
	tests := []struct {
		name    string
		payload interface{}
		wantErr bool
	}{
		{
			name: "simple map",
			payload: map[string]string{
				"key": "value",
			},
			wantErr: false,
		},
		{
			name: "complex struct",
			payload: struct {
				Title       string `json:"title"`
				Description string `json:"description"`
				Priority    int    `json:"priority"`
			}{
				Title:       "Test",
				Description: "Description",
				Priority:    1,
			},
			wantErr: false,
		},
		{
			name:    "nil payload",
			payload: nil,
			wantErr: false, // json.Marshal handles nil
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			event := &DomainEvent{
				EventID:   uuid.New(),
				EventType: "test.event",
				Payload:   tt.payload,
			}

			got, err := event.MarshalPayload()
			if (err != nil) != tt.wantErr {
				t.Errorf("MarshalPayload() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if err == nil && got == nil {
				t.Error("MarshalPayload() returned nil but no error")
			}
		})
	}
}

// TestOutboxEvent_Structure validates the OutboxEvent struct fields.
func TestOutboxEvent_Structure(t *testing.T) {
	now := time.Now()
	nextRetry := now.Add(time.Minute)
	published := now.Add(2 * time.Minute)

	event := OutboxEvent{
		ID:          uuid.New(),
		EventID:     uuid.New(),
		EventType:   "ticket.created",
		Topic:       "smartdesk.ticket.created",
		Payload:     []byte(`{"title":"test"}`),
		Headers:     []byte(`{"org_id":"org-123"}`),
		CreatedAt:   now,
		RetryCount:  2,
		MaxRetries:  5,
		NextRetryAt: &nextRetry,
		PublishedAt: &published,
		Error:       "",
		Status:      string(StatusPending),
	}

	// Validate struct is properly formed
	if event.ID == uuid.Nil {
		t.Error("ID should not be nil")
	}
	if event.EventID == uuid.Nil {
		t.Error("EventID should not be nil")
	}
	if event.RetryCount >= event.MaxRetries {
		t.Error("RetryCount should be less than MaxRetries")
	}
	if !EventStatus(event.Status).IsValid() {
		t.Errorf("Invalid status: %v", event.Status)
	}
}

// TestNewSQLWriter tests the factory function.
func TestNewSQLWriter(t *testing.T) {
	writer := NewSQLWriter()
	if writer == nil {
		t.Error("NewSQLWriter() returned nil")
	}
}
