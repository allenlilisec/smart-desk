package store

import "fmt"

// formatNumber renders a工单号 like SD-2026-000123 (core.yaml Ticket.number).
func formatNumber(year, seq int) string {
	return fmt.Sprintf("SD-%04d-%06d", year, seq)
}
