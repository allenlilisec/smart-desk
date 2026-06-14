package domain

// Error is the wire error envelope (core.yaml Error).
type Error struct {
	Code    string           `json:"code"`
	Message string           `json:"message"`
	Details []map[string]any `json:"details,omitempty"`
	TraceID string           `json:"trace_id,omitempty"`
}
