// Package db owns the Postgres connection pool and the embedded SQL migration
// runner for smartdesk-core.
//
// Migrations are plain .sql files under ../migrations, applied in lexical order
// inside a single transaction each, tracked in the schema_migrations table.
// This keeps the migration story dependency-free (no external migrate tool) and
// reproducible across dev/CI/prod.
package db

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	_ "github.com/lib/pq" // postgres driver
)

// DB wraps the sql.DB pool.
type DB struct {
	*sql.DB
}

// Open opens (but does not verify) a Postgres connection pool for the given DSN.
func Open(dsn string) (*DB, error) {
	if strings.TrimSpace(dsn) == "" {
		return nil, errors.New("db: empty DSN")
	}
	pool, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("db: open: %w", err)
	}
	pool.SetMaxOpenConns(20)
	pool.SetMaxIdleConns(5)
	pool.SetConnMaxLifetime(30 * time.Minute)
	return &DB{pool}, nil
}

// Ping verifies the connection is usable, bounded by ctx.
func (d *DB) Ping(ctx context.Context) error {
	return d.PingContext(ctx)
}

// Migrate applies every embedded migration that has not yet been recorded.
// It is idempotent and safe to call on every boot.
func (d *DB) Migrate(ctx context.Context, files embed.FS, dir string) (applied []string, err error) {
	if _, err = d.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`); err != nil {
		return nil, fmt.Errorf("db: ensure schema_migrations: %w", err)
	}

	entries, err := fs.ReadDir(files, dir)
	if err != nil {
		return nil, fmt.Errorf("db: read migrations: %w", err)
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var exists bool
		if err = d.QueryRowContext(ctx,
			`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)`, name).
			Scan(&exists); err != nil {
			return applied, fmt.Errorf("db: check migration %s: %w", name, err)
		}
		if exists {
			continue
		}
		stmt, rerr := fs.ReadFile(files, dir+"/"+name)
		if rerr != nil {
			return applied, fmt.Errorf("db: read %s: %w", name, rerr)
		}
		if err = d.runMigration(ctx, name, string(stmt)); err != nil {
			return applied, err
		}
		applied = append(applied, name)
	}
	return applied, nil
}

func (d *DB) runMigration(ctx context.Context, name, stmt string) error {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("db: begin %s: %w", name, err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err = tx.ExecContext(ctx, stmt); err != nil {
		return fmt.Errorf("db: apply %s: %w", name, err)
	}
	if _, err = tx.ExecContext(ctx,
		`INSERT INTO schema_migrations(version) VALUES ($1)`, name); err != nil {
		return fmt.Errorf("db: record %s: %w", name, err)
	}
	return tx.Commit()
}
