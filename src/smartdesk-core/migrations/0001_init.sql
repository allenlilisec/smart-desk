-- smartdesk-core schema v1 (system design §3 data model).
-- Authoritative Postgres DDL the production store adapter targets.
-- Run with any migration runner (golang-migrate, psql -f, etc.).

BEGIN;

CREATE TABLE IF NOT EXISTS categories (
    id          UUID PRIMARY KEY,
    parent_id   UUID REFERENCES categories (id),
    code        TEXT,
    name        TEXT NOT NULL,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sla_policies (
    id        UUID PRIMARY KEY,
    name      TEXT NOT NULL,
    active    BOOLEAN NOT NULL DEFAULT TRUE,
    targets   JSONB NOT NULL  -- [{priority,response_minutes,resolve_minutes}]
);

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT,
    display_name  TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'active',  -- active | disabled
    roles         TEXT[] NOT NULL DEFAULT '{}'     -- requester|agent|lead|manager|admin
);

CREATE TABLE IF NOT EXISTS tickets (
    id            UUID PRIMARY KEY,
    org_id        TEXT NOT NULL DEFAULT 'default',
    number        TEXT NOT NULL UNIQUE,            -- SD-2026-000123
    title         TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    requester_id  UUID,
    assignee_id   UUID,
    group_id      UUID,
    category_id   UUID REFERENCES categories (id),
    priority      TEXT NOT NULL DEFAULT 'P3',      -- P1..P4
    status        TEXT NOT NULL DEFAULT 'new',     -- 八态
    source        TEXT NOT NULL DEFAULT 'web',
    reopen_count  INTEGER NOT NULL DEFAULT 0,
    csat_score    SMALLINT CHECK (csat_score BETWEEN 1 AND 5),
    closed_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets (assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets (requester_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created  ON tickets (created_at DESC);

CREATE TABLE IF NOT EXISTS sla_timers (
    ticket_id            UUID PRIMARY KEY REFERENCES tickets (id) ON DELETE CASCADE,
    policy_id            UUID NOT NULL,
    priority             TEXT NOT NULL,
    response_due_at      TIMESTAMPTZ NOT NULL,
    resolve_due_at       TIMESTAMPTZ NOT NULL,
    response_met         BOOLEAN NOT NULL DEFAULT FALSE,
    resolve_met          BOOLEAN NOT NULL DEFAULT FALSE,
    paused_at            TIMESTAMPTZ,
    paused_seconds       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assignments (
    id           UUID PRIMARY KEY,
    ticket_id    UUID NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    kind         TEXT NOT NULL,            -- manual|auto|reassign|escalate
    to_user_id   UUID,
    to_group_id  UUID,
    reason       TEXT,
    actor_id     UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignments_ticket ON assignments (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS comments (
    id          UUID PRIMARY KEY,
    ticket_id   UUID NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    author_id   UUID,
    body        TEXT NOT NULL,
    visibility  TEXT NOT NULL DEFAULT 'public',   -- public | internal
    mentions    UUID[] NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_ticket ON comments (ticket_id, created_at);

-- Append-only audit/timeline (§3, US-2.8): no UPDATE/DELETE exposed to non-system roles.
CREATE TABLE IF NOT EXISTS ticket_timeline (
    id          UUID PRIMARY KEY,
    ticket_id   UUID NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,           -- created|status_changed|assigned|commented|...
    actor_id    UUID,
    payload     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timeline_ticket ON ticket_timeline (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS ticket_links (
    id                UUID PRIMARY KEY,
    ticket_id         UUID NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    linked_ticket_id  UUID NOT NULL REFERENCES tickets (id),
    relation          TEXT NOT NULL,     -- related|duplicate|merged_into
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Write-path idempotency (core.yaml Idempotency-Key).
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key         TEXT PRIMARY KEY,
    ticket_id   UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consumer-side dedupe for at-least-once delivery (§5.2).
CREATE TABLE IF NOT EXISTS processed_events (
    event_id     UUID PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
