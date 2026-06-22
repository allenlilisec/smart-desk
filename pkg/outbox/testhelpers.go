// Package outbox provides test helpers for integration testing.
package outbox

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
)

// TestDB provides a PostgreSQL test container for integration tests.
// This is a placeholder - full implementation requires testcontainers.
type TestDB struct {
	DB  *sql.DB
	DSN string
}

// NewTestDB creates a PostgreSQL test container for testing.
// This is a placeholder for full testcontainer integration.
// Phase 1: Skip container-based tests until dependencies are ready.
func NewTestDB(t *testing.T) (*TestDB, error) {
	t.Skip("TestDB requires testcontainers - skipping in Phase 1")
	return nil, nil
}

// Close closes the test database.
func (td *TestDB) Close() error {
	if td.DB != nil {
		return td.DB.Close()
	}
	return nil
}

// MockNATSClient provides a mock NATS client for testing.
type MockNATSClient struct {
	PublishedMessages []MockNATSMessage
	PublishError      error
	ShouldFail        bool
}

// MockNATSMessage represents a published NATS message.
type MockNATSMessage struct {
	Subject string
	Data    []byte
	Headers map[string]string
}

// NewMockNATSClient creates a new mock NATS client.
func NewMockNATSClient() *MockNATSClient {
	return &MockNATSClient{
		PublishedMessages: make([]MockNATSMessage, 0),
	}
}

// Publish mocks publishing a message to NATS.
func (m *MockNATSClient) Publish(subject string, data []byte) error {
	if m.ShouldFail {
		return m.PublishError
	}
	m.PublishedMessages = append(m.PublishedMessages, MockNATSMessage{
		Subject: subject,
		Data:    data,
		Headers: make(map[string]string),
	})
	return nil
}

// PublishWithHeaders mocks publishing with headers.
func (m *MockNATSClient) PublishWithHeaders(subject string, headers map[string]string, data []byte) error {
	if m.ShouldFail {
		return m.PublishError
	}
	m.PublishedMessages = append(m.PublishedMessages, MockNATSMessage{
		Subject: subject,
		Data:    data,
		Headers: headers,
	})
	return nil
}

// Reset clears the published messages.
func (m *MockNATSClient) Reset() {
	m.PublishedMessages = make([]MockNATSMessage, 0)
	m.ShouldFail = false
	m.PublishError = nil
}

// TestFixtures provides helper methods for creating test data.
type TestFixtures struct{}

// NewTestFixtures creates a new TestFixtures instance.
func NewTestFixtures() *TestFixtures {
	return &TestFixtures{}
}

// CreateTestEvent creates a test domain event.
func (f *TestFixtures) CreateTestEvent() *DomainEvent {
	return &DomainEvent{
		EventID:    uuid.New(),
		EventType:  "ticket.created",
		OccurredAt: time.Now(),
		OrgID:      "test-org-123",
		TicketID:   uuid.New(),
		Version:    1,
		Payload: map[string]interface{}{
			"title":       "Test Ticket",
			"description": "This is a test ticket",
			"priority":    "high",
		},
	}
}

// CreateTestOutboxEvent creates a test outbox event.
func (f *TestFixtures) CreateTestOutboxEvent() *OutboxEvent {
	now := time.Now()
	return &OutboxEvent{
		ID:         uuid.New(),
		EventID:    uuid.New(),
		EventType:  "ticket.created",
		Topic:      "smartdesk.ticket.created",
		Payload:    []byte(`{"title":"Test Ticket"}`),
		Headers:    []byte(`{"org_id":"test-org-123"}`),
		CreatedAt:  now,
		RetryCount: 0,
		MaxRetries: 5,
		Status:     string(StatusPending),
	}
}

// CreateTestOutboxEventWithRetries creates a test outbox event with retry count.
func (f *TestFixtures) CreateTestOutboxEventWithRetries(retryCount int) *OutboxEvent {
	event := f.CreateTestOutboxEvent()
	event.RetryCount = retryCount
	nextRetry := time.Now().Add(time.Minute)
	event.NextRetryAt = &nextRetry
	return event
}

// TestTransactionManager provides helper methods for transaction testing.
type TestTransactionManager struct {
	DB *sql.DB
}

// NewTestTransactionManager creates a new transaction manager.
func NewTestTransactionManager(db *sql.DB) *TestTransactionManager {
	return &TestTransactionManager{DB: db}
}

// WithTransaction executes the given function within a transaction.
// The transaction is committed if fn returns nil, otherwise rolled back.
func (tm *TestTransactionManager) WithTransaction(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := tm.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	if err := fn(tx); err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit()
}

// TestTimeout returns a standard timeout for tests.
func TestTimeout() time.Duration {
	return 10 * time.Second
}

// TestContext returns a context with standard test timeout.
func TestContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), TestTimeout())
}
