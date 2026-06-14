package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"github.com/lib/pq"

	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/domain"
	"github.com/allenlilisec/smart-desk/smartdesk-core/internal/id"
	"github.com/allenlilisec/smart-desk/smartdesk-core/migrations"
)

// Postgres is the durable Store backed by Postgres. It targets the schema in
// migrations/0001_init.sql (embedded via the migrations package). All
// reads/writes go through a single *sql.DB pool, which is concurrency-safe.
type Postgres struct {
	db *sql.DB
}

// OpenPostgres opens the pool, applies migrations, and seeds baseline config on
// an empty database. The DSN is a standard libpq/postgres URL.
func OpenPostgres(dsn string, now time.Time) (*Postgres, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("store: open postgres: %w", err)
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("store: ping postgres: %w", err)
	}
	p := &Postgres{db: db}
	if err := p.migrate(); err != nil {
		return nil, err
	}
	if err := p.seedIfEmpty(now); err != nil {
		return nil, err
	}
	return p, nil
}

// Close releases the pool.
func (p *Postgres) Close() error { return p.db.Close() }

// Ping verifies connectivity (used by /readyz wiring).
func (p *Postgres) Ping() error { return p.db.Ping() }

func (p *Postgres) migrate() error {
	entries, err := fs.ReadDir(migrations.FS, ".")
	if err != nil {
		return fmt.Errorf("store: read migrations: %w", err)
	}
	var names []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, n := range names {
		b, rerr := fs.ReadFile(migrations.FS, n)
		if rerr != nil {
			return fmt.Errorf("store: read %s: %w", n, rerr)
		}
		// Migrations are idempotent (IF NOT EXISTS), safe to run every boot.
		if _, eerr := p.db.Exec(string(b)); eerr != nil {
			return fmt.Errorf("store: apply %s: %w", n, eerr)
		}
	}
	return nil
}

func (p *Postgres) seedIfEmpty(now time.Time) error {
	var n int
	if err := p.db.QueryRow(`SELECT count(*) FROM sla_policies`).Scan(&n); err != nil {
		return fmt.Errorf("store: seed probe: %w", err)
	}
	if n > 0 {
		return nil
	}

	tx, err := p.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	pol := domain.BaselineSlaPolicy(id.New())
	targets, _ := json.Marshal(pol.Targets)
	if _, err = tx.Exec(
		`INSERT INTO sla_policies (id, name, active, targets) VALUES ($1,$2,$3,$4)`,
		pol.ID, pol.Name, pol.Active, targets); err != nil {
		return fmt.Errorf("store: seed policy: %w", err)
	}

	itTech := domain.Category{ID: id.New(), Code: "it", Name: "IT支持", Active: true, Sort: 1}
	account := domain.Category{ID: id.New(), Code: "account", Name: "账号与权限", Active: true, Sort: 2}
	vpn := domain.Category{ID: id.New(), ParentID: &itTech.ID, Code: "it.vpn", Name: "VPN/网络", Active: true, Sort: 1}
	for _, c := range []domain.Category{itTech, account, vpn} {
		if _, err = tx.Exec(
			`INSERT INTO categories (id, parent_id, code, name, active, sort) VALUES ($1,$2,$3,$4,$5,$6)`,
			c.ID, argStr(c.ParentID), c.Code, c.Name, c.Active, c.Sort); err != nil {
			return fmt.Errorf("store: seed category: %w", err)
		}
	}

	for _, u := range []domain.User{
		{Username: "alice", DisplayName: "Alice（坐席）", Status: "active", Roles: []string{"agent"}},
		{Username: "lead", DisplayName: "Lead（组长）", Status: "active", Roles: []string{"agent", "lead"}},
		{Username: "bob", DisplayName: "Bob（报单人）", Status: "active", Roles: []string{"requester"}},
		{Username: "admin", DisplayName: "Admin", Status: "active", Roles: []string{"admin", "manager"}},
	} {
		if _, err = tx.Exec(
			`INSERT INTO users (id, username, email, display_name, status, roles) VALUES ($1,$2,$3,$4,$5,$6)`,
			id.New(), u.Username, u.Email, u.DisplayName, u.Status, pq.Array(u.Roles)); err != nil {
			return fmt.Errorf("store: seed user: %w", err)
		}
	}
	return tx.Commit()
}

// --- SLA policy / config ---

func (p *Postgres) Policy() domain.SlaPolicy {
	var pol domain.SlaPolicy
	var targets []byte
	err := p.db.QueryRow(
		`SELECT id, name, active, targets FROM sla_policies WHERE active ORDER BY id LIMIT 1`).
		Scan(&pol.ID, &pol.Name, &pol.Active, &targets)
	if err != nil {
		return domain.SlaPolicy{}
	}
	_ = json.Unmarshal(targets, &pol.Targets)
	return pol
}

func (p *Postgres) SetPolicy(in domain.SlaPolicy) domain.SlaPolicy {
	if in.ID == "" {
		in.ID = p.Policy().ID
	}
	if in.ID == "" {
		in.ID = id.New()
	}
	targets, _ := json.Marshal(in.Targets)
	_, _ = p.db.Exec(
		`INSERT INTO sla_policies (id, name, active, targets) VALUES ($1,$2,$3,$4)
		 ON CONFLICT (id) DO UPDATE SET name=$2, active=$3, targets=$4`,
		in.ID, in.Name, in.Active, targets)
	return in
}

func (p *Postgres) Categories() []domain.Category {
	rows, err := p.db.Query(
		`SELECT id, parent_id, code, name, active, sort FROM categories ORDER BY sort, name`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []domain.Category
	for rows.Next() {
		var c domain.Category
		var parent, code sql.NullString
		if err := rows.Scan(&c.ID, &parent, &code, &c.Name, &c.Active, &c.Sort); err != nil {
			return out
		}
		c.ParentID = ptrStr(parent)
		c.Code = code.String
		out = append(out, c)
	}
	return out
}

func (p *Postgres) AddCategory(c domain.Category) domain.Category {
	c.ID = id.New()
	c.Active = true
	_, _ = p.db.Exec(
		`INSERT INTO categories (id, parent_id, code, name, active, sort) VALUES ($1,$2,$3,$4,$5,$6)`,
		c.ID, argStr(c.ParentID), c.Code, c.Name, c.Active, c.Sort)
	return c
}

func (p *Postgres) Users(page, pageSize int) ([]domain.User, int) {
	page, pageSize = norm(page, pageSize)
	var total int
	_ = p.db.QueryRow(`SELECT count(*) FROM users`).Scan(&total)
	rows, err := p.db.Query(
		`SELECT id, username, email, display_name, status, roles FROM users
		 ORDER BY username LIMIT $1 OFFSET $2`, pageSize, (page-1)*pageSize)
	if err != nil {
		return []domain.User{}, total
	}
	defer rows.Close()
	out := []domain.User{}
	for rows.Next() {
		var u domain.User
		var email sql.NullString
		if err := rows.Scan(&u.ID, &u.Username, &email, &u.DisplayName, &u.Status, pq.Array(&u.Roles)); err != nil {
			return out, total
		}
		u.Email = email.String
		out = append(out, u)
	}
	return out, total
}

func (p *Postgres) AddUser(u domain.User) domain.User {
	u.ID = id.New()
	if u.Status == "" {
		u.Status = "active"
	}
	if u.Roles == nil {
		u.Roles = []string{}
	}
	_, _ = p.db.Exec(
		`INSERT INTO users (id, username, email, display_name, status, roles) VALUES ($1,$2,$3,$4,$5,$6)`,
		u.ID, u.Username, u.Email, u.DisplayName, u.Status, pq.Array(u.Roles))
	return u
}

func (p *Postgres) SetUserRoles(userID string, roles []string) (domain.User, bool) {
	if roles == nil {
		roles = []string{}
	}
	res, err := p.db.Exec(`UPDATE users SET roles=$1 WHERE id=$2`, pq.Array(roles), userID)
	if err != nil {
		return domain.User{}, false
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return domain.User{}, false
	}
	var u domain.User
	var email sql.NullString
	err = p.db.QueryRow(
		`SELECT id, username, email, display_name, status, roles FROM users WHERE id=$1`, userID).
		Scan(&u.ID, &u.Username, &email, &u.DisplayName, &u.Status, pq.Array(&u.Roles))
	if err != nil {
		return domain.User{}, false
	}
	u.Email = email.String
	return u, true
}

// --- idempotency ---

func (p *Postgres) Idempotent(key string) (string, bool) {
	if key == "" {
		return "", false
	}
	var tid string
	err := p.db.QueryRow(`SELECT ticket_id FROM idempotency_keys WHERE key=$1`, key).Scan(&tid)
	if err != nil {
		return "", false
	}
	return tid, true
}

func (p *Postgres) RememberIdempotent(key, ticketID string) {
	if key == "" {
		return
	}
	_, _ = p.db.Exec(
		`INSERT INTO idempotency_keys (key, ticket_id) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`,
		key, ticketID)
}

// --- tickets ---

func (p *Postgres) NextNumber(now time.Time) string {
	year := now.Year()
	var seq int
	err := p.db.QueryRow(
		`INSERT INTO ticket_counters (year, seq) VALUES ($1, 1)
		 ON CONFLICT (year) DO UPDATE SET seq = ticket_counters.seq + 1
		 RETURNING seq`, year).Scan(&seq)
	if err != nil {
		return formatNumber(year, 0)
	}
	return formatNumber(year, seq)
}

func (p *Postgres) PutTicket(t *domain.Ticket, s *domain.SlaState) {
	tx, err := p.db.Begin()
	if err != nil {
		return
	}
	defer func() { _ = tx.Rollback() }()

	if _, err = tx.Exec(
		`INSERT INTO tickets
		   (id, org_id, number, title, description, requester_id, assignee_id, group_id,
		    category_id, priority, status, source, reopen_count, csat_score, closed_at,
		    created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		 ON CONFLICT (id) DO UPDATE SET
		   title=$4, description=$5, assignee_id=$7, group_id=$8, category_id=$9,
		   priority=$10, status=$11, reopen_count=$13, csat_score=$14, closed_at=$15,
		   updated_at=$17`,
		t.ID, orDefault(t.OrgID, "default"), t.Number, t.Title, t.Description,
		argStr(&t.RequesterID), argStr(t.AssigneeID), argStr(t.GroupID), argStr(t.CategoryID),
		string(t.Priority), string(t.Status), orDefault(t.Source, "web"), t.ReopenCount,
		argInt(t.CsatScore), argTime(t.ClosedAt), t.CreatedAt, t.UpdatedAt,
	); err != nil {
		return
	}

	if s != nil {
		if _, err = tx.Exec(
			`INSERT INTO sla_timers
			   (ticket_id, policy_id, priority, response_due_at, resolve_due_at,
			    response_met, resolve_met, paused_at, paused_seconds)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			 ON CONFLICT (ticket_id) DO UPDATE SET
			   policy_id=$2, priority=$3, response_due_at=$4, resolve_due_at=$5,
			   response_met=$6, resolve_met=$7, paused_at=$8, paused_seconds=$9`,
			s.TicketID, s.PolicyID, string(s.Priority), s.ResponseDueAt, s.ResolveDueAt,
			s.ResponseMet, s.ResolveMet, argTime(s.PausedAt), s.PausedSeconds,
		); err != nil {
			return
		}
	}
	_ = tx.Commit()
}

func (p *Postgres) Ticket(ticketID string) (*domain.Ticket, bool) {
	row := p.db.QueryRow(
		`SELECT id, org_id, number, title, description, requester_id, assignee_id, group_id,
		        category_id, priority, status, source, reopen_count, csat_score, closed_at,
		        created_at, updated_at
		 FROM tickets WHERE id=$1`, ticketID)
	t, err := scanTicket(row)
	if err != nil {
		return nil, false
	}
	return t, true
}

func (p *Postgres) Sla(ticketID string) (*domain.SlaState, bool) {
	var s domain.SlaState
	var pausedAt sql.NullTime
	var pr string
	err := p.db.QueryRow(
		`SELECT ticket_id, policy_id, priority, response_due_at, resolve_due_at,
		        response_met, resolve_met, paused_at, paused_seconds
		 FROM sla_timers WHERE ticket_id=$1`, ticketID).
		Scan(&s.TicketID, &s.PolicyID, &pr, &s.ResponseDueAt, &s.ResolveDueAt,
			&s.ResponseMet, &s.ResolveMet, &pausedAt, &s.PausedSeconds)
	if err != nil {
		return nil, false
	}
	s.Priority = domain.Priority(pr)
	s.PausedAt = ptrTime(pausedAt)
	return &s, true
}

func (p *Postgres) ListTickets(f TicketFilter) ([]domain.Ticket, int) {
	page, pageSize := norm(f.Page, f.PageSize)
	var where []string
	var args []any
	add := func(cond string, val any) {
		args = append(args, val)
		where = append(where, fmt.Sprintf(cond, len(args)))
	}
	if f.Status != "" {
		add("status = $%d", f.Status)
	}
	if f.Priority != "" {
		add("priority = $%d", f.Priority)
	}
	if f.AssigneeID != "" {
		add("assignee_id = $%d", f.AssigneeID)
	}
	if f.RequesterID != "" {
		add("requester_id = $%d", f.RequesterID)
	}
	if f.GroupID != "" {
		add("group_id = $%d", f.GroupID)
	}
	if f.CategoryID != "" {
		add("category_id = $%d", f.CategoryID)
	}
	if f.Query != "" {
		args = append(args, "%"+strings.ToLower(f.Query)+"%")
		i := len(args)
		where = append(where, fmt.Sprintf("(lower(title) LIKE $%d OR lower(description) LIKE $%d)", i, i))
	}
	clause := ""
	if len(where) > 0 {
		clause = " WHERE " + strings.Join(where, " AND ")
	}

	var total int
	if err := p.db.QueryRow(`SELECT count(*) FROM tickets`+clause, args...).Scan(&total); err != nil {
		return []domain.Ticket{}, 0
	}

	order := " ORDER BY created_at DESC, number DESC"
	if f.Sort == "created_at" {
		order = " ORDER BY created_at ASC, number ASC"
	}
	args = append(args, pageSize, (page-1)*pageSize)
	q := `SELECT id, org_id, number, title, description, requester_id, assignee_id, group_id,
	             category_id, priority, status, source, reopen_count, csat_score, closed_at,
	             created_at, updated_at
	      FROM tickets` + clause + order +
		fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(args)-1, len(args))
	rows, err := p.db.Query(q, args...)
	if err != nil {
		return []domain.Ticket{}, total
	}
	defer rows.Close()
	out := []domain.Ticket{}
	for rows.Next() {
		t, serr := scanTicket(rows)
		if serr != nil {
			return out, total
		}
		out = append(out, *t)
	}
	return out, total
}

// --- comments / assignments / timeline ---

func (p *Postgres) AddComment(c domain.Comment) domain.Comment {
	if c.Mentions == nil {
		c.Mentions = []string{}
	}
	_, _ = p.db.Exec(
		`INSERT INTO comments (id, ticket_id, author_id, body, visibility, mentions, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		c.ID, c.TicketID, argStr(&c.AuthorID), c.Body, c.Visibility, pq.Array(c.Mentions), c.CreatedAt)
	return c
}

func (p *Postgres) Comments(ticketID string, includeInternal bool, page, pageSize int) ([]domain.Comment, int) {
	page, pageSize = norm(page, pageSize)
	vis := ""
	if !includeInternal {
		vis = " AND visibility <> 'internal'"
	}
	var total int
	_ = p.db.QueryRow(`SELECT count(*) FROM comments WHERE ticket_id=$1`+vis, ticketID).Scan(&total)
	rows, err := p.db.Query(
		`SELECT id, ticket_id, author_id, body, visibility, mentions, created_at
		 FROM comments WHERE ticket_id=$1`+vis+
			` ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
		ticketID, pageSize, (page-1)*pageSize)
	if err != nil {
		return []domain.Comment{}, total
	}
	defer rows.Close()
	out := []domain.Comment{}
	for rows.Next() {
		var c domain.Comment
		var author sql.NullString
		if err := rows.Scan(&c.ID, &c.TicketID, &author, &c.Body, &c.Visibility, pq.Array(&c.Mentions), &c.CreatedAt); err != nil {
			return out, total
		}
		c.AuthorID = author.String
		out = append(out, c)
	}
	return out, total
}

func (p *Postgres) AddAssignment(a domain.Assignment) domain.Assignment {
	tx, err := p.db.Begin()
	if err != nil {
		return a
	}
	defer func() { _ = tx.Rollback() }()

	if _, err = tx.Exec(
		`INSERT INTO assignments (id, ticket_id, kind, to_user_id, to_group_id, reason, actor_id, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		a.ID, a.TicketID, a.Kind, argStr(a.ToUserID), argStr(a.ToGroupID), a.Reason,
		argStr(&a.ActorID), a.CreatedAt); err != nil {
		return a
	}
	// Mirror Memory: assignment updates the ticket's assignee/group + updated_at.
	if a.ToUserID != nil {
		if _, err = tx.Exec(`UPDATE tickets SET assignee_id=$1, updated_at=$2 WHERE id=$3`,
			*a.ToUserID, a.CreatedAt, a.TicketID); err != nil {
			return a
		}
	}
	if a.ToGroupID != nil {
		if _, err = tx.Exec(`UPDATE tickets SET group_id=$1, updated_at=$2 WHERE id=$3`,
			*a.ToGroupID, a.CreatedAt, a.TicketID); err != nil {
			return a
		}
	}
	_ = tx.Commit()
	return a
}

func (p *Postgres) AddTimeline(e domain.TimelineEntry) {
	if e.ID == "" {
		e.ID = id.New()
	}
	payload, _ := json.Marshal(e.Payload)
	if len(payload) == 0 || string(payload) == "null" {
		payload = []byte("{}")
	}
	_, _ = p.db.Exec(
		`INSERT INTO ticket_timeline (id, ticket_id, event_type, actor_id, payload, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		e.ID, e.TicketID, e.EventType, argStr(e.ActorID), payload, e.CreatedAt)
}

func (p *Postgres) Timeline(ticketID string, page, pageSize int) ([]domain.TimelineEntry, int) {
	page, pageSize = norm(page, pageSize)
	var total int
	_ = p.db.QueryRow(`SELECT count(*) FROM ticket_timeline WHERE ticket_id=$1`, ticketID).Scan(&total)
	rows, err := p.db.Query(
		`SELECT id, ticket_id, event_type, actor_id, payload, created_at
		 FROM ticket_timeline WHERE ticket_id=$1 ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
		ticketID, pageSize, (page-1)*pageSize)
	if err != nil {
		return []domain.TimelineEntry{}, total
	}
	defer rows.Close()
	out := []domain.TimelineEntry{}
	for rows.Next() {
		var e domain.TimelineEntry
		var actor sql.NullString
		var payload []byte
		if err := rows.Scan(&e.ID, &e.TicketID, &e.EventType, &actor, &payload, &e.CreatedAt); err != nil {
			return out, total
		}
		e.ActorID = ptrStr(actor)
		_ = json.Unmarshal(payload, &e.Payload)
		out = append(out, e)
	}
	return out, total
}

// --- scan / arg helpers ---

type scanner interface {
	Scan(dest ...any) error
}

func scanTicket(row scanner) (*domain.Ticket, error) {
	var t domain.Ticket
	var requester, assignee, group, category sql.NullString
	var csat sql.NullInt64
	var closed sql.NullTime
	var pr, st string
	if err := row.Scan(
		&t.ID, &t.OrgID, &t.Number, &t.Title, &t.Description, &requester, &assignee, &group,
		&category, &pr, &st, &t.Source, &t.ReopenCount, &csat, &closed, &t.CreatedAt, &t.UpdatedAt,
	); err != nil {
		return nil, err
	}
	t.RequesterID = requester.String
	t.AssigneeID = ptrStr(assignee)
	t.GroupID = ptrStr(group)
	t.CategoryID = ptrStr(category)
	t.Priority = domain.Priority(pr)
	t.Status = domain.TicketStatus(st)
	if csat.Valid {
		v := int(csat.Int64)
		t.CsatScore = &v
	}
	t.ClosedAt = ptrTime(closed)
	return &t, nil
}

func argStr(p *string) any {
	if p == nil || *p == "" {
		return nil
	}
	return *p
}

func argInt(p *int) any {
	if p == nil {
		return nil
	}
	return *p
}

func argTime(p *time.Time) any {
	if p == nil {
		return nil
	}
	return *p
}

func ptrStr(n sql.NullString) *string {
	if !n.Valid || n.String == "" {
		return nil
	}
	v := n.String
	return &v
}

func ptrTime(n sql.NullTime) *time.Time {
	if !n.Valid {
		return nil
	}
	v := n.Time
	return &v
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func norm(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	return page, pageSize
}
