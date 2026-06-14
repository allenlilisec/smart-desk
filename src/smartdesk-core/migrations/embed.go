// Package migrations embeds the SQL migration files so they ship inside the
// binary and can be applied at boot without any external files.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS

// Dir is the embedded directory containing the migrations ("." since the .sql
// files sit alongside this file).
const Dir = "."
