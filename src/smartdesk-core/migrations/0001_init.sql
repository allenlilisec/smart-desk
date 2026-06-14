-- 0001_init.sql — smartdesk-core authoritative schema (M2.1 CORE-0)
-- Source of truth: openapi/core.yaml + specs/SmartDesk系统架构设计说明书.md §3 数据模型.
-- All enums mirror the frozen contract exactly. Multi-tenant (org_id) is
-- reserved per OQ-7: every domain row carries org_id, default 'default'.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums (frozen in openapi/core.yaml)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM
        ('new','accepted','in_progress','pending_user','resolved','closed','suspended','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE priority AS ENUM ('P1','P2','P3','P4');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE role_code AS ENUM ('requester','agent','lead','manager','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE comment_visibility AS ENUM ('public','internal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE assignment_kind AS ENUM ('manual','auto','reassign','escalate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE link_relation AS ENUM ('related','duplicate','merged_into');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active','disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Config: users / roles directory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       text NOT NULL DEFAULT 'default',
    username     text NOT NULL,
    email        text,
    display_name text NOT NULL,
    status       user_status NOT NULL DEFAULT 'active',
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, username)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role    role_code NOT NULL,
    PRIMARY KEY (user_id, role)
);

-- ---------------------------------------------------------------------------
-- Config: taxonomy (category tree) + SLA policy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id    text NOT NULL DEFAULT 'default',
    parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
    code      text,
    name      text NOT NULL,
    active    boolean NOT NULL DEFAULT true,
    sort      integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

CREATE TABLE IF NOT EXISTS sla_policies (
    id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id text NOT NULL DEFAULT 'default',
    name   text NOT NULL,
    active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sla_policy_targets (
    policy_id        uuid NOT NULL REFERENCES sla_policies(id) ON DELETE CASCADE,
    priority         priority NOT NULL,
    response_minutes integer NOT NULL,
    resolve_minutes  integer NOT NULL,
    PRIMARY KEY (policy_id, priority)
);

-- ---------------------------------------------------------------------------
-- Ticket number sequence (SD-YYYY-NNNNNN)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1;

-- ---------------------------------------------------------------------------
-- Tickets (authoritative)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       text NOT NULL DEFAULT 'default',
    number       text NOT NULL UNIQUE,
    title        text NOT NULL,
    description  text NOT NULL DEFAULT '',
    requester_id uuid NOT NULL,
    assignee_id  uuid,
    group_id     uuid,
    category_id  uuid REFERENCES categories(id) ON DELETE SET NULL,
    priority     priority NOT NULL DEFAULT 'P3',
    status       ticket_status NOT NULL DEFAULT 'new',
    source       text NOT NULL DEFAULT 'web',
    reopen_count integer NOT NULL DEFAULT 0,
    csat_score   integer CHECK (csat_score BETWEEN 1 AND 5),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_status     ON tickets(org_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee   ON tickets(org_id, assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_requester  ON tickets(org_id, requester_id);
CREATE INDEX IF NOT EXISTS idx_tickets_group      ON tickets(org_id, group_id);
CREATE INDEX IF NOT EXISTS idx_tickets_category   ON tickets(org_id, category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(org_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Per-ticket SLA timer
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_sla (
    ticket_id            uuid PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
    policy_id            uuid REFERENCES sla_policies(id) ON DELETE SET NULL,
    priority             priority NOT NULL,
    response_due_at      timestamptz,
    resolve_due_at       timestamptz,
    response_met         boolean NOT NULL DEFAULT false,
    resolve_met          boolean NOT NULL DEFAULT false,
    paused               boolean NOT NULL DEFAULT false,
    paused_since         timestamptz,
    paused_total_seconds integer NOT NULL DEFAULT 0,
    breached             boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- Assignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id   uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    kind        assignment_kind NOT NULL,
    to_user_id  uuid,
    to_group_id uuid,
    actor_id    uuid,
    reason      text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignments_ticket ON assignments(ticket_id, created_at);

-- ---------------------------------------------------------------------------
-- Comments + mentions (visibility: public/internal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id  uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_id  uuid NOT NULL,
    body       text NOT NULL,
    visibility comment_visibility NOT NULL DEFAULT 'public',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_ticket ON comments(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS comment_mentions (
    comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL,
    PRIMARY KEY (comment_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Attachments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attachments (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    comment_id   uuid REFERENCES comments(id) ON DELETE SET NULL,
    filename     text NOT NULL,
    content_type text NOT NULL,
    size_bytes   bigint NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 20971520),
    uploader_id  uuid NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON attachments(ticket_id);

-- ---------------------------------------------------------------------------
-- Ticket links (related / duplicate / merged_into)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_links (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id        uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    linked_ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    relation         link_relation NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ticket_id, linked_ticket_id, relation),
    CHECK (ticket_id <> linked_ticket_id)
);

-- ---------------------------------------------------------------------------
-- Timeline / audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timeline (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id  uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    actor_id   uuid,
    payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timeline_ticket ON timeline(ticket_id, created_at);

-- ---------------------------------------------------------------------------
-- Classification suggestion (insight async write-back, OQ-4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classification_suggestions (
    ticket_id   uuid PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
    category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
    confidence  real,
    priority    priority,
    applied     boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Idempotency keys for write operations (Idempotency-Key header)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key         text PRIMARY KEY,
    scope       text NOT NULL,
    ticket_id   uuid,
    created_at  timestamptz NOT NULL DEFAULT now()
);
