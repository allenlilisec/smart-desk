// Package httpapi exposes smartdesk-core over HTTP per openapi/core.yaml.
//
// Trust model (§6): core listens internal-only; gateway收口 authn/RBAC and
// forwards a service-jwt plus X-User-* identity headers. core does领域级
// visibility filtering (internal notes, scoping) off those headers — it does not
// re-authenticate the end user. Service-jwt signature/aud validation is a
// deploy-time concern (keys injected by ops) and is intentionally a no-op hook
// in this MVP skeleton.
package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/allenlilisec/smart-desk/src/core/internal/domain"
	"github.com/allenlilisec/smart-desk/src/core/internal/event"
	"github.com/allenlilisec/smart-desk/src/core/internal/id"
	"github.com/allenlilisec/smart-desk/src/core/internal/store"
)

// Server wires the store and event publisher into HTTP handlers.
type Server struct {
	store *store.Memory
	pub   event.Publisher
	orgID string
	now   func() time.Time
}

// New builds a Server. now may be nil (defaults to time.Now).
func New(st *store.Memory, pub event.Publisher, orgID string, now func() time.Time) *Server {
	if now == nil {
		now = time.Now
	}
	return &Server{store: st, pub: pub, orgID: orgID, now: now}
}

// Handler returns the routed http.Handler (Go 1.22+ method+path patterns).
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /tickets", s.createTicket)
	mux.HandleFunc("GET /tickets", s.listTickets)
	mux.HandleFunc("GET /tickets/{id}", s.getTicket)
	mux.HandleFunc("PATCH /tickets/{id}", s.patchTicket)
	mux.HandleFunc("POST /tickets/{id}/transitions", s.transition)
	mux.HandleFunc("POST /tickets/{id}/assignments", s.assign)
	mux.HandleFunc("GET /tickets/{id}/comments", s.listComments)
	mux.HandleFunc("POST /tickets/{id}/comments", s.addComment)
	mux.HandleFunc("GET /tickets/{id}/timeline", s.timeline)
	mux.HandleFunc("GET /tickets/{id}/sla", s.getSla)

	mux.HandleFunc("GET /config/categories", s.listCategories)
	mux.HandleFunc("POST /config/categories", s.addCategory)
	mux.HandleFunc("GET /config/sla-policies", s.listPolicies)
	mux.HandleFunc("PUT /config/sla-policies", s.putPolicy)
	mux.HandleFunc("GET /config/users", s.listUsers)
	mux.HandleFunc("POST /config/users", s.addUser)
	mux.HandleFunc("PUT /config/users/{userId}/roles", s.setUserRoles)

	mux.HandleFunc("GET /healthz", s.healthz)
	mux.HandleFunc("GET /readyz", s.readyz)

	return mux
}

// ---- request bodies (mirror core.yaml) ----

type ticketCreate struct {
	Title         string          `json:"title"`
	Description   string          `json:"description"`
	CategoryID    *string         `json:"category_id"`
	Priority      domain.Priority `json:"priority"`
	Source        string          `json:"source"`
	AttachmentIDs []string        `json:"attachment_ids"`
}

type ticketUpdate struct {
	Title       *string          `json:"title"`
	Description *string          `json:"description"`
	CategoryID  *string          `json:"category_id"`
	Priority    *domain.Priority `json:"priority"`
}

type transitionRequest struct {
	Action domain.Action `json:"action"`
	Reason string        `json:"reason"`
}

type assignmentRequest struct {
	Kind      string  `json:"kind"`
	ToUserID  *string `json:"to_user_id"`
	ToGroupID *string `json:"to_group_id"`
	Reason    string  `json:"reason"`
}

type commentCreate struct {
	Body       string   `json:"body"`
	Visibility string   `json:"visibility"`
	Mentions   []string `json:"mentions"`
}

// ---- handlers: tickets ----

func (s *Server) createTicket(w http.ResponseWriter, r *http.Request) {
	var in ticketCreate
	if !decode(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Title) == "" || strings.TrimSpace(in.Description) == "" {
		writeErr(w, http.StatusBadRequest, "VALIDATION_FAILED", "title and description are required")
		return
	}
	if in.Priority == "" {
		in.Priority = domain.P3
	}
	if !in.Priority.Valid() {
		writeErr(w, http.StatusUnprocessableEntity, "INVALID_PRIORITY", "unknown priority")
		return
	}
	if in.Source == "" {
		in.Source = "web"
	}

	// Idempotency (core.yaml Idempotency-Key): replay returns the first result.
	if key := r.Header.Get("Idempotency-Key"); key != "" {
		if tid, ok := s.store.Idempotent(key); ok {
			if t, ok := s.store.Ticket(tid); ok {
				writeJSON(w, http.StatusCreated, t)
				return
			}
		}
	}

	c := s.caller(r)
	now := s.now()
	t := &domain.Ticket{
		ID:          id.New(),
		OrgID:       s.orgID,
		Number:      s.store.NextNumber(now),
		Title:       in.Title,
		Description: in.Description,
		RequesterID: c.UserID,
		CategoryID:  in.CategoryID,
		Priority:    in.Priority,
		Status:      domain.StatusNew,
		Source:      in.Source,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	sla := domain.StartSla(t.ID, s.store.Policy(), t.Priority, now)
	s.store.PutTicket(t, sla)
	if key := r.Header.Get("Idempotency-Key"); key != "" {
		s.store.RememberIdempotent(key, t.ID)
	}

	s.audit(t.ID, "created", c.UserIDPtr(), map[string]any{"number": t.Number, "priority": t.Priority}, now)
	s.publish("ticket.created", t.ID, c.UserIDPtr(), map[string]any{
		"number": t.Number, "title": t.Title, "priority": t.Priority, "category_id": t.CategoryID,
	}, now)

	writeJSON(w, http.StatusCreated, t)
}

func (s *Server) listTickets(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, pageSize := pageParams(q)
	items, total := s.store.ListTickets(store.TicketFilter{
		Status:      q.Get("status"),
		Priority:    q.Get("priority"),
		AssigneeID:  q.Get("assignee_id"),
		RequesterID: q.Get("requester_id"),
		GroupID:     q.Get("group_id"),
		CategoryID:  q.Get("category_id"),
		Query:       q.Get("q"),
		Sort:        q.Get("sort"),
		Page:        page,
		PageSize:    pageSize,
	})
	writeJSON(w, http.StatusOK, pageEnvelope(items, page, pageSize, total))
}

func (s *Server) getTicket(w http.ResponseWriter, r *http.Request) {
	t, ok := s.store.Ticket(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, "NOT_FOUND", "ticket not found")
		return
	}
	detail := map[string]any{}
	b, _ := json.Marshal(t)
	_ = json.Unmarshal(b, &detail)
	if sla, ok := s.store.Sla(t.ID); ok {
		detail["sla"] = sla.View(s.now())
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) patchTicket(w http.ResponseWriter, r *http.Request) {
	t, ok := s.store.Ticket(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, "NOT_FOUND", "ticket not found")
		return
	}
	var in ticketUpdate
	if !decode(w, r, &in) {
		return
	}
	now := s.now()
	if in.Title != nil {
		t.Title = *in.Title
	}
	if in.Description != nil {
		t.Description = *in.Description
	}
	if in.CategoryID != nil {
		t.CategoryID = in.CategoryID
	}
	if in.Priority != nil {
		if !in.Priority.Valid() {
			writeErr(w, http.StatusUnprocessableEntity, "INVALID_PRIORITY", "unknown priority")
			return
		}
		t.Priority = *in.Priority
		// Priority change triggers SLA recompute (core.yaml PATCH summary).
		if sla, ok := s.store.Sla(t.ID); ok {
			target := s.store.Policy().TargetFor(t.Priority)
			pausedExtra := time.Duration(sla.PausedSeconds) * time.Second
			sla.Priority = t.Priority
			sla.ResponseDueAt = t.CreatedAt.Add(time.Duration(target.ResponseMinutes)*time.Minute + pausedExtra)
			sla.ResolveDueAt = t.CreatedAt.Add(time.Duration(target.ResolveMinutes)*time.Minute + pausedExtra)
		}
	}
	t.UpdatedAt = now
	s.store.PutTicket(t, nil)
	s.audit(t.ID, "updated", s.caller(r).UserIDPtr(), map[string]any{"priority": t.Priority}, now)
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) transition(w http.ResponseWriter, r *http.Request) {
	t, ok := s.store.Ticket(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, "NOT_FOUND", "ticket not found")
		return
	}
	var in transitionRequest
	if !decode(w, r, &in) {
		return
	}
	if !domain.IsClientAction(in.Action) {
		writeErr(w, http.StatusBadRequest, "VALIDATION_FAILED", "unknown or system-only action")
		return
	}

	now := s.now()
	from := t.Status

	// reopen window guard (OQ-13): only within 7 days of close.
	if in.Action == domain.ActionReopen && t.Status == domain.StatusClosed {
		if t.ClosedAt == nil || now.Sub(*t.ClosedAt) > domain.ReopenWindow {
			writeErr(w, http.StatusConflict, "REOPEN_WINDOW_EXPIRED", "reopen allowed only within 7 days of close")
			return
		}
	}

	next, idempotent, err := domain.Transition(t.Status, in.Action)
	if err != nil {
		writeErr(w, http.StatusConflict, "ILLEGAL_TRANSITION", err.Error())
		return
	}
	if idempotent {
		writeJSON(w, http.StatusOK, t) // repeat target state = idempotent no-op
		return
	}

	t.Status = next
	t.UpdatedAt = now
	s.applySlaSideEffects(t.ID, in.Action, now)
	if in.Action == domain.ActionReopen {
		t.ReopenCount++
		t.ClosedAt = nil
	}
	if next == domain.StatusClosed {
		c := now
		t.ClosedAt = &c
	}
	s.store.PutTicket(t, nil)

	actor := s.caller(r).UserIDPtr()
	s.audit(t.ID, "status_changed", actor, map[string]any{
		"action": in.Action, "from": from, "to": next, "reason": in.Reason,
	}, now)
	s.publish(domain.StatusEventType(in.Action), t.ID, actor, map[string]any{
		"action": in.Action, "from": from, "to": next,
	}, now)

	writeJSON(w, http.StatusOK, t)
}

func (s *Server) applySlaSideEffects(ticketID string, a domain.Action, now time.Time) {
	sla, ok := s.store.Sla(ticketID)
	if !ok {
		return
	}
	switch a {
	case domain.ActionAccept:
		sla.MarkResponded()
	case domain.ActionWaitUser:
		sla.Pause(now)
	case domain.ActionStart, domain.ActionUserReply:
		sla.Resume(now)
	case domain.ActionResolve:
		sla.MarkResolved()
	}
}

func (s *Server) assign(w http.ResponseWriter, r *http.Request) {
	t, ok := s.store.Ticket(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, "NOT_FOUND", "ticket not found")
		return
	}
	var in assignmentRequest
	if !decode(w, r, &in) {
		return
	}
	switch in.Kind {
	case "manual", "auto", "reassign", "escalate":
	default:
		writeErr(w, http.StatusBadRequest, "VALIDATION_FAILED", "unknown assignment kind")
		return
	}
	now := s.now()
	actor := s.caller(r)
	a := domain.Assignment{
		ID:        id.New(),
		TicketID:  t.ID,
		Kind:      in.Kind,
		ToUserID:  in.ToUserID,
		ToGroupID: in.ToGroupID,
		Reason:    in.Reason,
		ActorID:   actor.UserID,
		CreatedAt: now,
	}
	// auto-dispatch baseline (CORE-A2): unrouted auto lands in the default L1 group.
	if in.Kind == "auto" && a.ToUserID == nil && a.ToGroupID == nil {
		if a.Reason == "" {
			a.Reason = "auto:L1-default"
		}
	}
	a = s.store.AddAssignment(a)

	evt := "ticket.assigned"
	if in.Kind == "reassign" {
		evt = "ticket.reassigned"
	}
	s.audit(t.ID, "assigned", actor.UserIDPtr(), map[string]any{
		"kind": in.Kind, "to_user_id": in.ToUserID, "to_group_id": in.ToGroupID,
	}, now)
	s.publish(evt, t.ID, actor.UserIDPtr(), map[string]any{
		"kind": in.Kind, "to_user_id": in.ToUserID, "to_group_id": in.ToGroupID,
	}, now)
	writeJSON(w, http.StatusCreated, a)
}

// ---- handlers: comments / timeline / sla ----

func (s *Server) addComment(w http.ResponseWriter, r *http.Request) {
	t, ok := s.store.Ticket(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, "NOT_FOUND", "ticket not found")
		return
	}
	var in commentCreate
	if !decode(w, r, &in) {
		return
	}
	if in.Visibility != "public" && in.Visibility != "internal" {
		writeErr(w, http.StatusBadRequest, "VALIDATION_FAILED", "visibility must be public or internal")
		return
	}
	c := s.caller(r)
	// Requester-only callers may not author internal notes (US-5.2 / §7 红线).
	if in.Visibility == "internal" && !isStaff(c.Roles) {
		writeErr(w, http.StatusForbidden, "FORBIDDEN", "internal notes are staff-only")
		return
	}
	now := s.now()
	cm := domain.Comment{
		ID:         id.New(),
		TicketID:   t.ID,
		AuthorID:   c.UserID,
		Body:       in.Body,
		Visibility: in.Visibility,
		Mentions:   in.Mentions,
		CreatedAt:  now,
	}
	cm = s.store.AddComment(cm)

	// US-2.2 AC2: a requester reply on a pending_user ticket auto-resumes work.
	if in.Visibility == "public" && t.Status == domain.StatusPendingUser && !isStaff(c.Roles) {
		if next, _, err := domain.Transition(t.Status, domain.ActionUserReply); err == nil {
			prev := t.Status
			t.Status = next
			t.UpdatedAt = now
			s.applySlaSideEffects(t.ID, domain.ActionUserReply, now)
			s.store.PutTicket(t, nil)
			s.audit(t.ID, "status_changed", nil, map[string]any{
				"action": domain.ActionUserReply, "from": prev, "to": next,
			}, now)
			s.publish("ticket.status_changed", t.ID, nil, map[string]any{
				"action": domain.ActionUserReply, "from": prev, "to": next,
			}, now)
		}
	}

	s.audit(t.ID, "commented", c.UserIDPtr(), map[string]any{"visibility": cm.Visibility}, now)
	s.publish("ticket.commented", t.ID, c.UserIDPtr(), map[string]any{
		"comment_id": cm.ID, "visibility": cm.Visibility, "mentions": cm.Mentions,
	}, now)
	writeJSON(w, http.StatusCreated, cm)
}

func (s *Server) listComments(w http.ResponseWriter, r *http.Request) {
	t, ok := s.store.Ticket(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, "NOT_FOUND", "ticket not found")
		return
	}
	page, pageSize := pageParams(r.URL.Query())
	includeInternal := isStaff(s.caller(r).Roles)
	items, total := s.store.Comments(t.ID, includeInternal, page, pageSize)
	writeJSON(w, http.StatusOK, pageEnvelope(items, page, pageSize, total))
}

func (s *Server) timeline(w http.ResponseWriter, r *http.Request) {
	t, ok := s.store.Ticket(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, "NOT_FOUND", "ticket not found")
		return
	}
	page, pageSize := pageParams(r.URL.Query())
	items, total := s.store.Timeline(t.ID, page, pageSize)
	writeJSON(w, http.StatusOK, pageEnvelope(items, page, pageSize, total))
}

func (s *Server) getSla(w http.ResponseWriter, r *http.Request) {
	sla, ok := s.store.Sla(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, "NOT_FOUND", "sla timer not found")
		return
	}
	writeJSON(w, http.StatusOK, sla.View(s.now()))
}

// ---- handlers: config ----

func (s *Server) listCategories(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.store.Categories())
}

func (s *Server) addCategory(w http.ResponseWriter, r *http.Request) {
	var in domain.Category
	if !decode(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Name) == "" {
		writeErr(w, http.StatusBadRequest, "VALIDATION_FAILED", "name is required")
		return
	}
	writeJSON(w, http.StatusCreated, s.store.AddCategory(in))
}

func (s *Server) listPolicies(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []domain.SlaPolicy{s.store.Policy()})
}

func (s *Server) putPolicy(w http.ResponseWriter, r *http.Request) {
	var in domain.SlaPolicy
	if !decode(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Name) == "" || len(in.Targets) == 0 {
		writeErr(w, http.StatusBadRequest, "VALIDATION_FAILED", "name and targets are required")
		return
	}
	writeJSON(w, http.StatusOK, s.store.SetPolicy(in))
}

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	page, pageSize := pageParams(r.URL.Query())
	items, total := s.store.Users(page, pageSize)
	writeJSON(w, http.StatusOK, pageEnvelope(items, page, pageSize, total))
}

func (s *Server) addUser(w http.ResponseWriter, r *http.Request) {
	var in domain.User
	if !decode(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Username) == "" || strings.TrimSpace(in.DisplayName) == "" || len(in.Roles) == 0 {
		writeErr(w, http.StatusBadRequest, "VALIDATION_FAILED", "username, display_name and roles are required")
		return
	}
	writeJSON(w, http.StatusCreated, s.store.AddUser(in))
}

func (s *Server) setUserRoles(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Roles []string `json:"roles"`
	}
	if !decode(w, r, &body) {
		return
	}
	u, ok := s.store.SetUserRoles(r.PathValue("userId"), body.Roles)
	if !ok {
		writeErr(w, http.StatusNotFound, "NOT_FOUND", "user not found")
		return
	}
	writeJSON(w, http.StatusOK, u)
}

// ---- health ----

func (s *Server) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) readyz(w http.ResponseWriter, _ *http.Request) {
	// Bus is best-effort (§8 degradation); readiness reports it but does not fail
	// the core write path on bus outage.
	writeJSON(w, http.StatusOK, map[string]any{"status": "ready", "bus": s.pub.Healthy()})
}

// ---- helpers ----

func (s *Server) audit(ticketID, eventType string, actor *string, payload map[string]any, now time.Time) {
	s.store.AddTimeline(domain.TimelineEntry{
		ID:        id.New(),
		TicketID:  ticketID,
		EventType: eventType,
		ActorID:   actor,
		Payload:   payload,
		CreatedAt: now,
	})
}

func (s *Server) publish(eventType, ticketID string, actor *string, payload map[string]any, now time.Time) {
	s.pub.Publish(event.New(eventType, s.orgID, ticketID, actor, payload, now))
}

type caller struct {
	UserID string
	Roles  []string
	OrgID  string
}

func (c caller) UserIDPtr() *string {
	if c.UserID == "" {
		return nil
	}
	v := c.UserID
	return &v
}

func (s *Server) caller(r *http.Request) caller {
	roles := []string{}
	if raw := r.Header.Get("X-User-Roles"); raw != "" {
		for _, p := range strings.Split(raw, ",") {
			if p = strings.TrimSpace(p); p != "" {
				roles = append(roles, p)
			}
		}
	}
	org := r.Header.Get("X-Org-Id")
	if org == "" {
		org = s.orgID
	}
	return caller{UserID: r.Header.Get("X-User-Id"), Roles: roles, OrgID: org}
}

func isStaff(roles []string) bool {
	for _, r := range roles {
		switch r {
		case "agent", "lead", "manager", "admin":
			return true
		}
	}
	return false
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		writeErr(w, http.StatusBadRequest, "VALIDATION_FAILED", "invalid JSON body: "+err.Error())
		return false
	}
	return true
}

func pageParams(q interface{ Get(string) string }) (int, int) {
	page := atoiDefault(q.Get("page"), 1)
	pageSize := atoiDefault(q.Get("page_size"), 20)
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}

func atoiDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}

func pageEnvelope[T any](items []T, page, pageSize, total int) map[string]any {
	if items == nil {
		items = []T{}
	}
	return map[string]any{"items": items, "page": page, "page_size": pageSize, "total": total}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, domain.Error{Code: code, Message: msg})
}
