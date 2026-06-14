// Package migrations embeds the authoritative Postgres DDL so it ships inside
// the binary and is applied at boot — no external migration tool required.
package migrations

import "embed"

// FS holds every *.sql migration, applied in lexical order. Each file is
// idempotent (IF NOT EXISTS), so re-running on every boot is safe.
//
//go:embed *.sql
var FS embed.FS
